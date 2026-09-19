// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KlubTypes} from "./KlubTypes.sol";
import {IKlubEventFactory} from "./interfaces/IKlubEventFactory.sol";
import {IKlubCheckInView} from "./interfaces/IKlubCheckInView.sol";
import {IKlubQuestRegistry} from "./interfaces/IKlubQuestRegistry.sol";
import {IERC20, KlubERC20} from "./libraries/KlubERC20.sol";

/// @title KlubRewardVault
/// @notice Holds the rewards the organizer funds (KUB and/or the event token),
/// plus event tokens forfeited by the refund policy. Guests pull their share
/// after the event is finalized.
contract KlubRewardVault {
    using KlubERC20 for IERC20;

    uint64 public constant CLAIM_WINDOW = 30 days;

    IKlubEventFactory public immutable factory;
    IKlubCheckInView public immutable registry;
    address public admin;
    IKlubQuestRegistry public quests;

    struct Pool {
        uint128 native;
        uint128 token;
    }

    struct EventPools {
        Pool checkIn; // shared by everyone who checked in
        Pool checkInSnapshot; // frozen at finalize
        uint256 weightSnapshot;
        bool finalized;
    }

    mapping(uint256 => EventPools) private _pools;
    mapping(uint256 => mapping(uint256 => Pool)) private _questPool; // eventId => questId => pool
    mapping(uint256 => mapping(uint256 => Pool)) private _questSnapshot;
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public questClaimed;

    event CheckInFunded(uint256 indexed eventId, address indexed from, uint256 nativeAmount, uint256 tokenAmount);
    event QuestFunded(uint256 indexed eventId, uint256 indexed questId, uint256 nativeAmount, uint256 tokenAmount);
    event Finalized(uint256 indexed eventId, uint256 weight, uint256 nativePool, uint256 tokenPool);
    event Claimed(uint256 indexed eventId, address indexed guest, uint256 nativeAmount, uint256 tokenAmount);
    event QuestClaimed(
        uint256 indexed eventId, uint256 indexed questId, address indexed guest, uint256 nativeAmount, uint256 tokenAmount
    );
    event LeftoverWithdrawn(uint256 indexed eventId, uint256 nativeAmount, uint256 tokenAmount);
    event QuestsUpdated(address quests);

    error NotAdmin();
    error NotOrganizer();
    error NotRegistry();
    error UnknownEvent();
    error TooEarly();
    error AlreadyFinalized();
    error NotFinalized();
    error NothingToClaim();
    error AlreadyClaimed();
    error DidNotAttend();
    error QuestNotCompleted();
    error ClaimWindowOpen();
    error NativeTransferFailed();

    constructor(IKlubEventFactory factory_, IKlubCheckInView registry_, address admin_) {
        factory = factory_;
        registry = registry_;
        admin = admin_;
    }

    function setQuests(IKlubQuestRegistry quests_) external {
        if (msg.sender != admin) revert NotAdmin();
        quests = quests_;
        emit QuestsUpdated(address(quests_));
    }

    // --- funding -----------------------------------------------------------

    /// @notice Organizer (or anyone) tops up the check-in pool. Native KUB
    /// comes as msg.value; tokenAmount is pulled from the caller.
    function fundCheckIn(uint256 eventId, uint256 tokenAmount) external payable {
        KlubTypes.EventConfig memory e = factory.getEvent(eventId);
        EventPools storage p = _pools[eventId];
        if (p.finalized) revert AlreadyFinalized();
        if (msg.value > 0) p.checkIn.native += uint128(msg.value);
        if (tokenAmount > 0) {
            IERC20(e.token).pullExact(msg.sender, tokenAmount);
            p.checkIn.token += uint128(tokenAmount);
        }
        emit CheckInFunded(eventId, msg.sender, msg.value, tokenAmount);
    }

    /// @notice Funds one quest. Called by the quest registry when a quest is
    /// created or topped up, or directly by the organizer.
    function fundQuest(uint256 eventId, uint256 questId, uint256 tokenAmount, address payer) external payable {
        KlubTypes.EventConfig memory e = factory.getEvent(eventId);
        if (msg.sender != address(quests) && msg.sender != e.organizer) revert NotOrganizer();
        EventPools storage p = _pools[eventId];
        if (p.finalized) revert AlreadyFinalized();
        Pool storage qp = _questPool[eventId][questId];
        if (msg.value > 0) qp.native += uint128(msg.value);
        if (tokenAmount > 0) {
            IERC20(e.token).pullExact(payer, tokenAmount);
            qp.token += uint128(tokenAmount);
        }
        emit QuestFunded(eventId, questId, msg.value, tokenAmount);
    }

    /// @notice Called by the check-in registry after it transferred forfeited
    /// event tokens (rejected, cancelled or no-show deposits) into this vault.
    function notifyTokenDeposit(uint256 eventId, uint256 amount) external {
        if (msg.sender != address(registry)) revert NotRegistry();
        _pools[eventId].checkIn.token += uint128(amount);
        emit CheckInFunded(eventId, msg.sender, 0, amount);
    }

    // --- finalize and claim ------------------------------------------------

    /// @notice Freezes the pools and the attendance weights. Anyone can call it
    /// once the event has ended.
    function finalize(uint256 eventId) public {
        KlubTypes.EventConfig memory e = factory.getEvent(eventId);
        if (e.organizer == address(0)) revert UnknownEvent();
        if (block.timestamp <= e.endTime) revert TooEarly();
        EventPools storage p = _pools[eventId];
        if (p.finalized) revert AlreadyFinalized();

        if (!registry.settled(eventId)) registry.settle(eventId);

        p.finalized = true;
        p.checkInSnapshot = p.checkIn;
        p.weightSnapshot = registry.totalWeight(eventId);

        uint256 n = address(quests) == address(0) ? 0 : quests.questCount(eventId);
        for (uint256 q = 1; q <= n; ++q) {
            _questSnapshot[eventId][q] = _questPool[eventId][q];
        }
        emit Finalized(eventId, p.weightSnapshot, p.checkInSnapshot.native, p.checkInSnapshot.token);
    }

    /// @notice Share of the check-in pool: by time at the event, or equally.
    function claim(uint256 eventId) external {
        EventPools storage p = _pools[eventId];
        if (!p.finalized) revert NotFinalized();
        if (claimed[eventId][msg.sender]) revert AlreadyClaimed();
        if (registry.checkInTime(eventId, msg.sender) == 0) revert DidNotAttend();

        uint256 weight = registry.guestWeight(eventId, msg.sender);
        if (weight == 0 || p.weightSnapshot == 0) revert NothingToClaim();

        claimed[eventId][msg.sender] = true;
        uint256 nativeAmount = (uint256(p.checkInSnapshot.native) * weight) / p.weightSnapshot;
        uint256 tokenAmount = (uint256(p.checkInSnapshot.token) * weight) / p.weightSnapshot;

        if (nativeAmount > 0) {
            p.checkIn.native -= uint128(nativeAmount);
            _sendNative(msg.sender, nativeAmount);
        }
        if (tokenAmount > 0) {
            p.checkIn.token -= uint128(tokenAmount);
            IERC20(factory.tokenOf(eventId)).pushExact(msg.sender, tokenAmount);
        }
        emit Claimed(eventId, msg.sender, nativeAmount, tokenAmount);
    }

    /// @notice Each quest reward is split equally between everyone who passed
    /// that quest and checked in.
    function claimQuest(uint256 eventId, uint256 questId) external {
        EventPools storage p = _pools[eventId];
        if (!p.finalized) revert NotFinalized();
        if (questClaimed[eventId][questId][msg.sender]) revert AlreadyClaimed();
        if (registry.checkInTime(eventId, msg.sender) == 0) revert DidNotAttend();
        if (!quests.hasCompleted(eventId, questId, msg.sender)) revert QuestNotCompleted();

        uint256 winners = quests.completions(eventId, questId);
        if (winners == 0) revert NothingToClaim();
        Pool memory snap = _questSnapshot[eventId][questId];

        questClaimed[eventId][questId][msg.sender] = true;
        uint256 nativeAmount = uint256(snap.native) / winners;
        uint256 tokenAmount = uint256(snap.token) / winners;

        Pool storage live = _questPool[eventId][questId];
        if (nativeAmount > 0) {
            live.native -= uint128(nativeAmount);
            _sendNative(msg.sender, nativeAmount);
        }
        if (tokenAmount > 0) {
            live.token -= uint128(tokenAmount);
            IERC20(factory.tokenOf(eventId)).pushExact(msg.sender, tokenAmount);
        }
        emit QuestClaimed(eventId, questId, msg.sender, nativeAmount, tokenAmount);
    }

    /// @notice After the claim window the organizer takes back what is left,
    /// including rounding dust.
    function withdrawLeftover(uint256 eventId) external {
        KlubTypes.EventConfig memory e = factory.getEvent(eventId);
        if (msg.sender != e.organizer) revert NotOrganizer();
        if (block.timestamp < uint256(e.endTime) + CLAIM_WINDOW) revert ClaimWindowOpen();
        EventPools storage p = _pools[eventId];
        if (!p.finalized) revert NotFinalized();

        uint256 nativeAmount = p.checkIn.native;
        uint256 tokenAmount = p.checkIn.token;
        p.checkIn.native = 0;
        p.checkIn.token = 0;

        uint256 n = address(quests) == address(0) ? 0 : quests.questCount(eventId);
        for (uint256 q = 1; q <= n; ++q) {
            Pool storage qp = _questPool[eventId][q];
            nativeAmount += qp.native;
            tokenAmount += qp.token;
            qp.native = 0;
            qp.token = 0;
        }

        if (nativeAmount > 0) _sendNative(e.organizer, nativeAmount);
        if (tokenAmount > 0) IERC20(e.token).pushExact(e.organizer, tokenAmount);
        emit LeftoverWithdrawn(eventId, nativeAmount, tokenAmount);
    }

    function _sendNative(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }

    // --- views -------------------------------------------------------------

    function poolsOf(uint256 eventId) external view returns (EventPools memory) {
        return _pools[eventId];
    }

    function questPoolOf(uint256 eventId, uint256 questId) external view returns (Pool memory) {
        return _questPool[eventId][questId];
    }

    /// @notice What the guest would get right now if the event were finalized
    /// with the current pools.
    function previewClaim(uint256 eventId, address guest)
        external
        view
        returns (uint256 nativeAmount, uint256 tokenAmount)
    {
        EventPools memory p = _pools[eventId];
        uint256 weight = registry.guestWeight(eventId, guest);
        uint256 total = p.finalized ? p.weightSnapshot : registry.totalWeight(eventId);
        if (weight == 0 || total == 0 || claimed[eventId][guest]) return (0, 0);
        Pool memory pool = p.finalized ? p.checkInSnapshot : p.checkIn;
        nativeAmount = (uint256(pool.native) * weight) / total;
        tokenAmount = (uint256(pool.token) * weight) / total;
    }
}
