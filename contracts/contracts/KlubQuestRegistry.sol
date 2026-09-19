// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KlubTypes} from "./KlubTypes.sol";
import {IKlubEventFactory} from "./interfaces/IKlubEventFactory.sol";
import {IKlubCheckInView} from "./interfaces/IKlubCheckInView.sol";
import {IERC20} from "./libraries/KlubERC20.sol";

interface IKlubVaultFunding {
    function fundQuest(uint256 eventId, uint256 questId, uint256 tokenAmount, address payer) external payable;
}

/// @title KlubQuestRegistry
/// @notice Quests checked on chain wherever possible. Only the social quest
/// needs the organizer to look at a link and approve it.
contract KlubQuestRegistry {
    enum QuestKind {
        HoldToken, // balance of the event token >= param
        StayMinutes, // time at the event >= param
        InviteCheckedIn, // param friends who used your referral and checked in
        Booth, // staff or organizer scans you at a booth
        Social // you post a link, organizer approves
    }

    struct Quest {
        QuestKind kind;
        uint128 param;
        string descriptionCID; // optional IPFS text shown in the app
        uint64 deadline; // 0 = event end time
        uint256 completions;
    }

    IKlubEventFactory public immutable factory;
    IKlubCheckInView public immutable registry;
    IKlubVaultFunding public immutable vault;

    mapping(uint256 => Quest[]) private _quests; // eventId => quests (id starts at 1)
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) private _done;
    mapping(uint256 => mapping(address => address)) public referrerOf; // eventId => guest => referrer
    mapping(uint256 => mapping(address => address[])) private _referrals;
    mapping(uint256 => mapping(address => string)) public socialProof; // eventId => guest => link

    event QuestCreated(uint256 indexed eventId, uint256 indexed questId, QuestKind kind, uint128 param, uint64 deadline);
    event QuestCompleted(uint256 indexed eventId, uint256 indexed questId, address indexed guest);
    event ReferrerSet(uint256 indexed eventId, address indexed guest, address indexed referrer);
    event SocialProofSubmitted(uint256 indexed eventId, address indexed guest, string link);

    error NotOrganizer();
    error NotStaff();
    error UnknownQuest();
    error AlreadyDone();
    error PastDeadline();
    error DidNotAttend();
    error RequirementNotMet();
    error WrongKind();
    error SelfReferral();
    error ReferrerLocked();

    constructor(IKlubEventFactory factory_, IKlubCheckInView registry_, IKlubVaultFunding vault_) {
        factory = factory_;
        registry = registry_;
        vault = vault_;
    }

    // --- organizer ---------------------------------------------------------

    /// @notice Creates a quest and funds its reward in the vault. Native KUB
    /// comes as msg.value; tokenAmount is pulled from the organizer.
    function createQuest(
        uint256 eventId,
        QuestKind kind,
        uint128 param,
        string calldata descriptionCID,
        uint64 deadline,
        uint256 tokenAmount
    ) external payable returns (uint256 questId) {
        KlubTypes.EventConfig memory e = factory.getEvent(eventId);
        if (msg.sender != e.organizer) revert NotOrganizer();

        _quests[eventId].push(
            Quest({kind: kind, param: param, descriptionCID: descriptionCID, deadline: deadline, completions: 0})
        );
        questId = _quests[eventId].length;

        if (msg.value > 0 || tokenAmount > 0) {
            vault.fundQuest{value: msg.value}(eventId, questId, tokenAmount, msg.sender);
        }
        emit QuestCreated(eventId, questId, kind, param, deadline);
    }

    /// @notice Booth quests: staff scans guests at the booth.
    function markBooth(uint256 eventId, uint256 questId, address[] calldata guests) external {
        KlubTypes.EventConfig memory e = factory.getEvent(eventId);
        if (msg.sender != e.organizer && !registry.isStaff(eventId, msg.sender)) revert NotStaff();
        Quest storage q = _quest(eventId, questId);
        if (q.kind != QuestKind.Booth) revert WrongKind();
        _requireOpen(e, q);
        for (uint256 i; i < guests.length; ++i) {
            _record(eventId, questId, q, guests[i]);
        }
    }

    /// @notice Social quests: the organizer reviews the posted links.
    function approveSocialQuest(uint256 eventId, uint256 questId, address[] calldata guests) external {
        KlubTypes.EventConfig memory e = factory.getEvent(eventId);
        if (msg.sender != e.organizer) revert NotOrganizer();
        Quest storage q = _quest(eventId, questId);
        if (q.kind != QuestKind.Social) revert WrongKind();
        _requireOpen(e, q);
        for (uint256 i; i < guests.length; ++i) {
            _record(eventId, questId, q, guests[i]);
        }
    }

    // --- guest -------------------------------------------------------------

    /// @notice Set once, before you check in: who invited you.
    function setReferrer(uint256 eventId, address referrer) external {
        if (referrer == msg.sender) revert SelfReferral();
        if (referrerOf[eventId][msg.sender] != address(0)) revert ReferrerLocked();
        if (registry.checkInTime(eventId, msg.sender) != 0) revert ReferrerLocked();
        referrerOf[eventId][msg.sender] = referrer;
        _referrals[eventId][referrer].push(msg.sender);
        emit ReferrerSet(eventId, msg.sender, referrer);
    }

    /// @notice Store the link for a social quest; the organizer approves later.
    function submitSocialProof(uint256 eventId, string calldata link) external {
        socialProof[eventId][msg.sender] = link;
        emit SocialProofSubmitted(eventId, msg.sender, link);
    }

    /// @notice Self-serve completion for the quests the contract can verify.
    function completeQuest(uint256 eventId, uint256 questId) external {
        KlubTypes.EventConfig memory e = factory.getEvent(eventId);
        Quest storage q = _quest(eventId, questId);
        _requireOpen(e, q);
        if (registry.checkInTime(eventId, msg.sender) == 0) revert DidNotAttend();

        if (q.kind == QuestKind.HoldToken) {
            if (IERC20(e.token).balanceOf(msg.sender) < q.param) revert RequirementNotMet();
        } else if (q.kind == QuestKind.StayMinutes) {
            uint64 inAt = registry.checkInTime(eventId, msg.sender);
            uint64 outAt = registry.checkOutTime(eventId, msg.sender);
            if (outAt == 0) revert RequirementNotMet();
            uint64 from = inAt < e.startTime ? e.startTime : inAt;
            uint64 to = outAt > e.endTime ? e.endTime : outAt;
            uint256 stayed = to > from ? (to - from) / 60 : 0;
            if (stayed < q.param) revert RequirementNotMet();
        } else if (q.kind == QuestKind.InviteCheckedIn) {
            if (countReferralsCheckedIn(eventId, msg.sender) < q.param) revert RequirementNotMet();
        } else {
            revert WrongKind(); // Booth and Social are recorded by the organizer
        }
        _record(eventId, questId, q, msg.sender);
    }

    // --- internals ---------------------------------------------------------

    function _record(uint256 eventId, uint256 questId, Quest storage q, address guest) private {
        if (_done[eventId][questId][guest]) revert AlreadyDone();
        if (registry.checkInTime(eventId, guest) == 0) revert DidNotAttend();
        _done[eventId][questId][guest] = true;
        q.completions += 1;
        emit QuestCompleted(eventId, questId, guest);
    }

    function _quest(uint256 eventId, uint256 questId) private view returns (Quest storage) {
        if (questId == 0 || questId > _quests[eventId].length) revert UnknownQuest();
        return _quests[eventId][questId - 1];
    }

    function _requireOpen(KlubTypes.EventConfig memory e, Quest storage q) private view {
        uint64 deadline = q.deadline == 0 ? e.endTime : q.deadline;
        if (block.timestamp > deadline) revert PastDeadline();
    }

    // --- views -------------------------------------------------------------

    function questCount(uint256 eventId) external view returns (uint256) {
        return _quests[eventId].length;
    }

    function getQuests(uint256 eventId) external view returns (Quest[] memory) {
        return _quests[eventId];
    }

    function completions(uint256 eventId, uint256 questId) external view returns (uint256) {
        return _quest(eventId, questId).completions;
    }

    function hasCompleted(uint256 eventId, uint256 questId, address guest) external view returns (bool) {
        return _done[eventId][questId][guest];
    }

    function referralsOf(uint256 eventId, address referrer) external view returns (address[] memory) {
        return _referrals[eventId][referrer];
    }

    function countReferralsCheckedIn(uint256 eventId, address referrer) public view returns (uint256 count) {
        address[] storage list = _referrals[eventId][referrer];
        for (uint256 i; i < list.length; ++i) {
            if (registry.checkInTime(eventId, list[i]) != 0) ++count;
        }
    }
}
