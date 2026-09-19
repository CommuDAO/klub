// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Shared enums and structs for the KLUB event system.
library KlubTypes {
    /// @notice How the check-in reward pool is split.
    enum RewardMode {
        ByTime, // weight = max(time at event, minCredit)
        Equal // weight = 1 per checked-in guest
    }

    /// @notice Where a deposit (or the part of it that is not burned) ends up.
    enum Destination {
        Refund, // guest can withdraw it
        Burn, // sent to the burn address
        RewardPool // added to the event check-in reward pool
    }

    /// @notice Lifecycle of one guest for one event.
    enum GuestStatus {
        None,
        Pending, // waiting for organizer approval
        Approved, // may check in
        Waitlisted, // queued, deposit already taken
        Rejected, // organizer said no
        Cancelled // guest cancelled the RSVP
    }

    /// @dev Bit flags for enabled check-in methods.
    uint8 internal constant METHOD_STAFF = 1;
    uint8 internal constant METHOD_KIOSK = 2;
    uint8 internal constant METHOD_CODE = 4;

    /// @notice Destination of a deposit in each situation. Locked at creation.
    struct RefundPolicy {
        Destination remainder; // left over after the check-in burn
        Destination cancelBefore; // guest cancels before refundCutoff
        Destination cancelAfter; // guest cancels after refundCutoff
        Destination rejected; // organizer rejects, or approval never comes
        Destination noShow; // RSVP but never checked in
        uint64 refundCutoff; // timestamp splitting cancelBefore / cancelAfter
    }

    /// @notice Everything about one event. Only minCredit can change, and only
    /// before the first check-in.
    struct EventConfig {
        address organizer;
        address token;
        bool tokenCreated; // true when KLUB deployed the token for this event
        uint64 startTime;
        uint64 endTime;
        RewardMode rewardMode;
        uint32 minCreditMinutes;
        uint8 methods; // bit flags above
        bool requireApproval;
        uint32 capacity; // 0 = unlimited
        uint128 minHolding; // deposited at RSVP
        uint128 burnAmount; // burned at check-in, <= minHolding
        string metadataCID; // IPFS CID: cover, description, venue, chat link
        RefundPolicy policy;
    }

    /// @notice Arguments of createEvent, kept in a struct to stay readable.
    struct CreateEventParams {
        address token; // address(0) = deploy a new token
        string name;
        string symbol;
        string metadataCID;
        uint64 startTime;
        uint64 endTime;
        RewardMode rewardMode;
        uint32 minCreditMinutes;
        uint8 methods;
        bool requireApproval;
        uint32 capacity;
        uint128 minHolding;
        uint128 burnAmount;
        RefundPolicy policy;
        uint256 minTokensOut; // slippage guard for the organizer initial buy
    }
}
