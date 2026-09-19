// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KlubTypes} from "./KlubTypes.sol";
import {IKlubBuyAdapter} from "./interfaces/IKlubBuyAdapter.sol";
import {IKlubCheckInRegistry} from "./interfaces/IKlubCheckInRegistry.sol";

/// @title KlubEventFactory
/// @notice Creates KLUB events. One transaction stores the event, deploys or
/// links the event token on Junoswap, and spends the organizer initial buy.
contract KlubEventFactory {
    using KlubTypes for KlubTypes.EventConfig;

    address public admin;
    IKlubBuyAdapter public buyAdapter;
    IKlubCheckInRegistry public registry;

    /// @notice Minimum KUB the organizer must spend on the initial buy.
    uint256 public minInitialBuy;

    uint256 public eventCount;
    mapping(uint256 => KlubTypes.EventConfig) private _events;
    mapping(address => uint256[]) private _eventsByToken;
    mapping(address => uint256[]) private _eventsByOrganizer;

    event EventCreated(
        uint256 indexed eventId,
        address indexed organizer,
        address indexed token,
        bool tokenCreated,
        uint64 startTime,
        uint64 endTime,
        string metadataCID
    );
    event InitialBuy(uint256 indexed eventId, address indexed organizer, uint256 valueIn, uint256 tokensOut);
    event MinCreditUpdated(uint256 indexed eventId, uint32 minCreditMinutes);
    event MetadataUpdated(uint256 indexed eventId, string metadataCID);
    event MinInitialBuyUpdated(uint256 minInitialBuy);
    event AdminUpdated(address admin);
    event WiringUpdated(address buyAdapter, address registry);

    error NotAdmin();
    error NotOrganizer();
    error UnknownEvent();
    error InitialBuyTooSmall(uint256 sent, uint256 required);
    error BadTimes();
    error BadMethods();
    error BadAmounts();
    error BadMinCredit();
    error BadCutoff();
    error TokenNotDelivered();
    error CheckInStarted();

    constructor(address admin_, uint256 minInitialBuy_) {
        admin = admin_;
        minInitialBuy = minInitialBuy_;
        emit AdminUpdated(admin_);
        emit MinInitialBuyUpdated(minInitialBuy_);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // --- admin -------------------------------------------------------------

    function setAdmin(address admin_) external onlyAdmin {
        admin = admin_;
        emit AdminUpdated(admin_);
    }

    /// @notice New value applies to events created afterwards only.
    function setMinInitialBuy(uint256 minInitialBuy_) external onlyAdmin {
        minInitialBuy = minInitialBuy_;
        emit MinInitialBuyUpdated(minInitialBuy_);
    }

    function setWiring(IKlubBuyAdapter buyAdapter_, IKlubCheckInRegistry registry_) external onlyAdmin {
        buyAdapter = buyAdapter_;
        registry = registry_;
        emit WiringUpdated(address(buyAdapter_), address(registry_));
    }

    // --- create ------------------------------------------------------------

    function createEvent(KlubTypes.CreateEventParams calldata p) external payable returns (uint256 eventId) {
        if (msg.value < minInitialBuy) revert InitialBuyTooSmall(msg.value, minInitialBuy);
        if (p.startTime < block.timestamp || p.endTime <= p.startTime) revert BadTimes();
        if (p.methods == 0 || p.methods > 7) revert BadMethods();
        if (p.burnAmount > p.minHolding) revert BadAmounts();
        if (p.rewardMode == KlubTypes.RewardMode.ByTime && p.minCreditMinutes == 0) revert BadMinCredit();
        if (p.policy.refundCutoff > p.startTime) revert BadCutoff();

        (address token, uint256 tokensOut) = _acquireToken(p);

        eventId = ++eventCount;
        KlubTypes.EventConfig storage e = _events[eventId];
        e.organizer = msg.sender;
        e.token = token;
        e.tokenCreated = p.token == address(0);
        e.startTime = p.startTime;
        e.endTime = p.endTime;
        e.rewardMode = p.rewardMode;
        e.minCreditMinutes = p.minCreditMinutes;
        e.methods = p.methods;
        e.requireApproval = p.requireApproval;
        e.capacity = p.capacity;
        e.minHolding = p.minHolding;
        e.burnAmount = p.burnAmount;
        e.metadataCID = p.metadataCID;
        e.policy = p.policy;

        _eventsByToken[token].push(eventId);
        _eventsByOrganizer[msg.sender].push(eventId);

        emit EventCreated(eventId, msg.sender, token, e.tokenCreated, p.startTime, p.endTime, p.metadataCID);
        emit InitialBuy(eventId, msg.sender, msg.value, tokensOut);
    }

    function _acquireToken(KlubTypes.CreateEventParams calldata p)
        private
        returns (address token, uint256 tokensOut)
    {
        if (p.token == address(0)) {
            (token, tokensOut) = buyAdapter.createTokenAndBuy{value: msg.value}(
                p.name, p.symbol, p.metadataCID, msg.sender, msg.sender, p.minTokensOut
            );
        } else {
            token = p.token;
            tokensOut = buyAdapter.buyExisting{value: msg.value}(token, msg.sender, p.minTokensOut);
        }
        if (token == address(0)) revert TokenNotDelivered();
        if (tokensOut < p.minTokensOut) revert TokenNotDelivered();
    }

    // --- organizer ---------------------------------------------------------

    /// @notice Adjustable until the first guest checks in, then locked.
    function setMinCredit(uint256 eventId, uint32 minCreditMinutes) external {
        KlubTypes.EventConfig storage e = _events[eventId];
        if (e.organizer == address(0)) revert UnknownEvent();
        if (msg.sender != e.organizer) revert NotOrganizer();
        if (registry.checkedInCount(eventId) != 0) revert CheckInStarted();
        if (e.rewardMode == KlubTypes.RewardMode.ByTime && minCreditMinutes == 0) revert BadMinCredit();
        e.minCreditMinutes = minCreditMinutes;
        emit MinCreditUpdated(eventId, minCreditMinutes);
    }

    /// @notice Cover, description, venue and chat link live on IPFS, so the
    /// organizer can correct them by publishing a new CID.
    function setMetadata(uint256 eventId, string calldata metadataCID) external {
        KlubTypes.EventConfig storage e = _events[eventId];
        if (e.organizer == address(0)) revert UnknownEvent();
        if (msg.sender != e.organizer) revert NotOrganizer();
        e.metadataCID = metadataCID;
        emit MetadataUpdated(eventId, metadataCID);
    }

    // --- views -------------------------------------------------------------

    function getEvent(uint256 eventId) external view returns (KlubTypes.EventConfig memory) {
        if (_events[eventId].organizer == address(0)) revert UnknownEvent();
        return _events[eventId];
    }

    function exists(uint256 eventId) external view returns (bool) {
        return _events[eventId].organizer != address(0);
    }

    function organizerOf(uint256 eventId) external view returns (address) {
        return _events[eventId].organizer;
    }

    function tokenOf(uint256 eventId) external view returns (address) {
        return _events[eventId].token;
    }

    /// @notice Paged listing so the static web app can read events over RPC
    /// without an indexer.
    function getEvents(uint256 offset, uint256 limit)
        external
        view
        returns (KlubTypes.EventConfig[] memory page, uint256 total)
    {
        total = eventCount;
        if (offset >= total) return (new KlubTypes.EventConfig[](0), total);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new KlubTypes.EventConfig[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            page[i - offset] = _events[i + 1];
        }
    }

    function eventsByToken(address token) external view returns (uint256[] memory) {
        return _eventsByToken[token];
    }

    function eventsByOrganizer(address organizer) external view returns (uint256[] memory) {
        return _eventsByOrganizer[organizer];
    }
}
