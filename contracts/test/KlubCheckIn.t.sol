// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KlubBase} from "./KlubBase.t.sol";
import {KlubTypes} from "../contracts/KlubTypes.sol";
import {KlubCheckInRegistry} from "../contracts/KlubCheckInRegistry.sol";
import {KlubTestToken} from "../contracts/testnet/KlubTestnetAdapter.sol";

contract KlubCheckInTest is KlubBase {
    uint256 internal kioskPk = 0xA11CE5;
    uint256 internal codePk = 0xC0DE5;

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethDigest);
        return abi.encodePacked(r, s, v);
    }

    function _kioskSig(uint256 eventId, bool inbound, uint64 windowId) internal view returns (bytes memory) {
        bytes32 digest =
            keccak256(abi.encode(block.chainid, address(registry), "KLUB_KIOSK", eventId, inbound, windowId));
        return _sign(kioskPk, digest);
    }

    function _codeSig(uint256 eventId, address guest) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encode(block.chainid, address(registry), "KLUB_CODE", eventId, guest));
        return _sign(codePk, digest);
    }

    function test_staffCheckInBurnsAndRefundsRemainder() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        _rsvp(eventId, token, alice);

        vm.prank(organizer);
        registry.setStaff(eventId, staff, true);

        vm.warp(startTime + 5 minutes);
        vm.prank(staff);
        registry.checkIn(eventId, alice);

        assertEq(KlubTestToken(token).balanceOf(registry.BURN_ADDRESS()), BURN_AMOUNT);
        KlubCheckInRegistry.Guest memory g = registry.guestOf(eventId, alice);
        assertEq(g.deposit, 0);
        assertEq(g.refundable, MIN_HOLDING - BURN_AMOUNT);
        assertEq(g.checkInTime, uint64(block.timestamp));
        assertEq(registry.checkedInCount(eventId), 1);

        vm.prank(alice);
        registry.withdrawDeposit(eventId);
        assertEq(KlubTestToken(token).balanceOf(alice), MIN_HOLDING - BURN_AMOUNT);
    }

    function test_onlyStaffOrOrganizerCanCheckInOthers() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        _rsvp(eventId, token, alice);
        vm.warp(startTime + 5 minutes);
        vm.prank(bob);
        vm.expectRevert(KlubCheckInRegistry.NotStaff.selector);
        registry.checkIn(eventId, alice);
    }

    function test_cannotCheckInTwice() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        _rsvp(eventId, token, alice);
        vm.warp(startTime + 5 minutes);
        vm.startPrank(organizer);
        registry.checkIn(eventId, alice);
        vm.expectRevert(KlubCheckInRegistry.AlreadyCheckedIn.selector);
        registry.checkIn(eventId, alice);
        vm.stopPrank();
    }

    function test_cannotCheckInOutsideWindow() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        _rsvp(eventId, token, alice);
        vm.prank(organizer);
        vm.expectRevert(KlubCheckInRegistry.OutsideEventWindow.selector);
        registry.checkIn(eventId, alice);
    }

    function test_checkOutRecordsMinutesWithMinimumCredit() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        _rsvp(eventId, token, alice);
        _rsvp(eventId, token, bob);

        vm.warp(startTime + 1 minutes);
        vm.startPrank(organizer);
        registry.checkIn(eventId, alice);
        registry.checkIn(eventId, bob);
        vm.stopPrank();

        // alice stays two hours, bob leaves after ten minutes
        vm.warp(startTime + 2 hours);
        vm.prank(organizer);
        registry.checkOut(eventId, alice);
        assertEq(registry.guestWeight(eventId, alice), 119);

        vm.prank(organizer);
        registry.checkOut(eventId, bob);
        assertEq(registry.guestWeight(eventId, bob), 119);
    }

    function test_shortStayGetsMinCreditNotLess() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        _rsvp(eventId, token, alice);
        vm.warp(startTime + 1 minutes);
        vm.prank(organizer);
        registry.checkIn(eventId, alice);
        vm.warp(startTime + 11 minutes);
        vm.prank(organizer);
        registry.checkOut(eventId, alice);
        assertEq(registry.guestWeight(eventId, alice), 60); // minCredit
    }

    function test_settleBurnsNoShowDepositsAndCreditsNoCheckouts() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        _rsvp(eventId, token, alice); // attends, no check-out
        _rsvp(eventId, token, bob); // no-show

        vm.warp(startTime + 1 minutes);
        vm.prank(organizer);
        registry.checkIn(eventId, alice);

        uint256 burnedBefore = KlubTestToken(token).balanceOf(registry.BURN_ADDRESS());
        vm.warp(endTime + 1);
        registry.settle(eventId);

        // bob's whole deposit is burned
        assertEq(KlubTestToken(token).balanceOf(registry.BURN_ADDRESS()) - burnedBefore, MIN_HOLDING);
        // alice never checked out: minimum credit of 60 minutes
        assertEq(registry.totalWeight(eventId), 60);
        assertTrue(registry.settled(eventId));
    }

    function test_equalModeWeightsOnePerGuest() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.Equal, false, 0));
        _rsvp(eventId, token, alice);
        _rsvp(eventId, token, bob);
        vm.warp(startTime + 1 minutes);
        vm.startPrank(organizer);
        registry.checkIn(eventId, alice);
        registry.checkIn(eventId, bob);
        vm.stopPrank();
        vm.warp(endTime + 1);
        registry.settle(eventId);
        assertEq(registry.totalWeight(eventId), 2);
    }

    function test_kioskCheckInAndCheckOut() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        _rsvp(eventId, token, alice);
        vm.prank(organizer);
        registry.setKioskKey(eventId, vm.addr(kioskPk));

        vm.warp(startTime + 1 minutes);
        uint64 windowId = uint64(vm.getBlockTimestamp()) / registry.KIOSK_WINDOW();
        vm.prank(alice);
        registry.checkInWithKiosk(eventId, windowId, _kioskSig(eventId, true, windowId));
        assertEq(registry.checkedInCount(eventId), 1);

        vm.warp(startTime + 2 hours);
        uint64 outWindow = uint64(vm.getBlockTimestamp()) / registry.KIOSK_WINDOW();
        vm.prank(alice);
        registry.checkOutWithKiosk(eventId, outWindow, _kioskSig(eventId, false, outWindow));
        assertEq(registry.checkedOutCount(eventId), 1);
    }

    function test_kioskSignatureRejectedAfterRevoke() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        _rsvp(eventId, token, alice);
        vm.startPrank(organizer);
        registry.setKioskKey(eventId, vm.addr(kioskPk));
        registry.revokeKioskKey(eventId);
        vm.stopPrank();

        vm.warp(startTime + 1 minutes);
        uint64 windowId = uint64(vm.getBlockTimestamp()) / registry.KIOSK_WINDOW();
        vm.prank(alice);
        vm.expectRevert(KlubCheckInRegistry.BadSigner.selector);
        registry.checkInWithKiosk(eventId, windowId, _kioskSig(eventId, true, windowId));
    }

    function test_kioskSignatureExpiresAfterTwoWindows() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        _rsvp(eventId, token, alice);
        vm.prank(organizer);
        registry.setKioskKey(eventId, vm.addr(kioskPk));

        vm.warp(startTime + 1 minutes);
        uint64 windowId = uint64(vm.getBlockTimestamp()) / registry.KIOSK_WINDOW();
        bytes memory sig = _kioskSig(eventId, true, windowId);

        vm.warp(block.timestamp + 90); // three windows later
        vm.prank(alice);
        vm.expectRevert(KlubCheckInRegistry.BadWindow.selector);
        registry.checkInWithKiosk(eventId, windowId, sig);
    }

    function test_codeSignatureIsBoundToTheGuest() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.ByTime, false, 0));
        _rsvp(eventId, token, alice);
        _rsvp(eventId, token, bob);
        vm.prank(organizer);
        registry.setCodeAddress(eventId, vm.addr(codePk), startTime, endTime);

        vm.warp(startTime + 1 minutes);
        bytes memory aliceSig = _codeSig(eventId, alice);

        // bob cannot replay the signature that was issued for alice
        vm.prank(bob);
        vm.expectRevert(KlubCheckInRegistry.BadSigner.selector);
        registry.checkInWithCode(eventId, aliceSig);

        vm.prank(alice);
        registry.checkInWithCode(eventId, aliceSig);
        assertEq(registry.checkedInCount(eventId), 1);
    }
}
