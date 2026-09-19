// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title KlubTypes
/// @notice Shared enums and structs. Kept in one place so the factory, the
/// registry and the vault agree on the shape of an event.
library KlubTypes {
    /// @notice How the check-in reward pool is split between guests.
    enum RewardMode {
        ByTime, // weight = max(time at event, minCredit)
        Equal // weight = 1 per checked-in guest
    }

    /// @notice Where a deposit (or the part of it that is not burned) ends up.
    enum Destination {
        Refund, // guest can withdraw it
        Burn, // sent to the burn address
        RewardPool, // added to the event check-in reward pool
        Organizer // escrowed for the organizer, claimable after the event ends
    }

    /// @notice Lifecycle of one guest for one event.
    enum GuestStatus {
        None,
        Pending,
        Approved,
        Waitlisted,
        Rejected,
        Cancelled
    }

    /// @notice Destination of a deposit in each situation. Locked at creation.
    struct RefundPolicy {
        Destination remainder; // left over after the check-in burn
        Destination cancelBefore; // guest cancels before refundCutoff
        Destination cancelAfter; // guest cancels after refundCutoff
        Destination rejected; // organizer rejects, or approval never comes
        Destination noShow; // RSVP but never checked in
        uint64 refundCutoff; // the line between cancelBefore and cancelAfter
    }

    /// @notice Everything about an event that the other contracts read.
    struct EventConfig {
        address organizer;
        address token;
        bool tokenCreated; // true when KLUB deployed the token for this event
        uint64 startTime;
        uint64 endTime;
        RewardMode rewardMode;
        uint32 minCreditMinutes;
        uint8 methods; // bit flags: STAFF | KIOSK | CODE
        bool requireApproval;
        uint32 capacity; // 0 = unlimited
        uint128 minHolding; // deposited at RSVP
        uint128 burnAmount; // burned from the deposit at check-in
        string metadataCID; // cover, description, venue, chat link
        RefundPolicy policy;
    }

    /// @notice Arguments of createEvent, kept as a struct to stay under the
    /// stack limit and to keep the call site readable.
    struct CreateEventParams {
        address token; // 0 = deploy a new token on the curve
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
        bytes routeData; // swap route for a graduated token; empty otherwise
    }

    uint8 internal constant METHOD_STAFF = 1;
    uint8 internal constant METHOD_KIOSK = 2;
    uint8 internal constant METHOD_CODE = 4;
}
