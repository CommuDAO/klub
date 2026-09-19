// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KlubBase} from "./KlubBase.t.sol";
import {KlubTypes} from "../contracts/KlubTypes.sol";
import {KlubEventFactory} from "../contracts/KlubEventFactory.sol";
import {KlubCheckInRegistry} from "../contracts/KlubCheckInRegistry.sol";
import {KlubTestToken} from "../contracts/testnet/KlubTestnetAdapter.sol";

contract KlubCreateEventTest is KlubBase {
    function test_createEvent_deploysTokenAndBuys() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, true, 0));
        assertEq(eventId, 1);
        assertTrue(token != address(0));
        // testnet adapter mints 1000 tokens per native unit
        assertEq(KlubTestToken(token).balanceOf(organizer), MIN_INITIAL_BUY * 1000);
        KlubTypes.EventConfig memory e = factory.getEvent(eventId);
        assertEq(e.organizer, organizer);
        assertEq(e.minCreditMinutes, 60);
        assertTrue(e.tokenCreated);
    }

    function test_createEvent_revertsBelowMinInitialBuy() public {
        KlubTypes.CreateEventParams memory p = _params(KlubTypes.RewardMode.ByTime, false, 0);
        vm.prank(organizer);
        vm.expectRevert(
            abi.encodeWithSelector(KlubEventFactory.InitialBuyTooSmall.selector, 1 ether, MIN_INITIAL_BUY)
        );
        factory.createEvent{value: 1 ether}(p);
    }

    function test_createEvent_revertsWhenBurnAboveHolding() public {
        KlubTypes.CreateEventParams memory p = _params(KlubTypes.RewardMode.ByTime, false, 0);
        p.burnAmount = MIN_HOLDING + 1;
        vm.prank(organizer);
        vm.expectRevert(KlubEventFactory.BadAmounts.selector);
        factory.createEvent{value: MIN_INITIAL_BUY}(p);
    }

    function test_setMinCredit_lockedAfterFirstCheckIn() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        vm.prank(organizer);
        factory.setMinCredit(eventId, 30);
        assertEq(factory.getEvent(eventId).minCreditMinutes, 30);

        _rsvp(eventId, token, alice);
        vm.warp(startTime + 10 minutes);
        vm.prank(organizer);
        registry.checkIn(eventId, alice);

        vm.prank(organizer);
        vm.expectRevert(KlubEventFactory.CheckInStarted.selector);
        factory.setMinCredit(eventId, 45);
    }

    function test_existingTokenCanBeReused() public {
        (, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        KlubTypes.CreateEventParams memory p = _params(KlubTypes.RewardMode.Equal, false, 0);
        p.token = token;
        vm.prank(organizer);
        uint256 second = factory.createEvent{value: MIN_INITIAL_BUY}(p);
        assertEq(factory.tokenOf(second), token);
        assertEq(factory.eventsByToken(token).length, 2);
    }
}

contract KlubRsvpTest is KlubBase {
    function test_rsvp_pullsDepositAndNeedsApproval() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, true, 0));
        _rsvp(eventId, token, alice);

        assertEq(KlubTestToken(token).balanceOf(address(registry)), MIN_HOLDING);
        KlubCheckInRegistry.Guest memory g = registry.guestOf(eventId, alice);
        assertEq(uint8(g.status), uint8(KlubTypes.GuestStatus.Pending));
        assertEq(g.deposit, MIN_HOLDING);
    }

    function test_invitedGuestSkipsApprovalButStillDeposits() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, true, 0));
        address[] memory guests = new address[](1);
        guests[0] = alice;
        vm.prank(organizer);
        registry.invite(eventId, guests);

        _rsvp(eventId, token, alice);
        KlubCheckInRegistry.Guest memory g = registry.guestOf(eventId, alice);
        assertEq(uint8(g.status), uint8(KlubTypes.GuestStatus.Approved));
        assertEq(g.deposit, MIN_HOLDING);
    }

    function test_capacityPushesToWaitlistAndCancelPromotes() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 1));
        _rsvp(eventId, token, alice);
        _rsvp(eventId, token, bob);

        assertEq(uint8(registry.guestOf(eventId, bob).status), uint8(KlubTypes.GuestStatus.Waitlisted));
        assertEq(registry.waitlistLength(eventId), 1);

        vm.prank(alice);
        registry.cancelRsvp(eventId);

        assertEq(uint8(registry.guestOf(eventId, bob).status), uint8(KlubTypes.GuestStatus.Approved));
        assertEq(registry.waitlistLength(eventId), 0);
    }

    function test_cancelBeforeCutoffRefunds_afterCutoffBurns() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        _rsvp(eventId, token, alice);
        _rsvp(eventId, token, bob);

        vm.prank(alice);
        registry.cancelRsvp(eventId);
        vm.prank(alice);
        registry.withdrawDeposit(eventId);
        assertEq(KlubTestToken(token).balanceOf(alice), MIN_HOLDING);

        vm.warp(startTime - 1 minutes); // past the cutoff
        uint256 burnedBefore = KlubTestToken(token).balanceOf(registry.BURN_ADDRESS());
        vm.prank(bob);
        registry.cancelRsvp(eventId);
        assertEq(KlubTestToken(token).balanceOf(registry.BURN_ADDRESS()) - burnedBefore, MIN_HOLDING);
        assertEq(registry.guestOf(eventId, bob).refundable, 0);
    }

    function test_rejectRefundsDeposit() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, true, 0));
        _rsvp(eventId, token, alice);

        address[] memory guests = new address[](1);
        guests[0] = alice;
        vm.prank(organizer);
        registry.reject(eventId, guests);

        vm.prank(alice);
        registry.withdrawDeposit(eventId);
        assertEq(KlubTestToken(token).balanceOf(alice), MIN_HOLDING);
    }

    function test_cannotCheckInWithoutApproval() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, true, 0));
        _rsvp(eventId, token, alice);
        vm.warp(startTime + 5 minutes);
        vm.prank(organizer);
        vm.expectRevert(KlubCheckInRegistry.NotApproved.selector);
        registry.checkIn(eventId, alice);
    }
}
