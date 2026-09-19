// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KlubBase} from "./KlubBase.t.sol";
import {KlubTypes} from "../contracts/KlubTypes.sol";
import {KlubRewardVault} from "../contracts/KlubRewardVault.sol";
import {KlubQuestRegistry} from "../contracts/KlubQuestRegistry.sol";
import {KlubTestToken} from "../contracts/testnet/KlubTestnetAdapter.sol";

contract KlubRewardTest is KlubBase {
    function _fundedEvent(KlubTypes.RewardMode mode) internal returns (uint256 eventId, address token) {
        (eventId, token) = _createEvent(_params(mode, false, 0));
        vm.prank(organizer);
        vault.fundCheckIn{value: 100 ether}(eventId, 0);
    }

    function test_rewardSplitByTimeAtEvent() public {
        (uint256 eventId, address token) = _fundedEvent(KlubTypes.RewardMode.ByTime);
        _rsvp(eventId, token, alice);
        _rsvp(eventId, token, bob);

        vm.warp(startTime);
        vm.startPrank(organizer);
        registry.checkIn(eventId, alice);
        registry.checkIn(eventId, bob);
        vm.stopPrank();

        vm.warp(startTime + 3 hours); // alice stays 180 minutes
        vm.prank(organizer);
        registry.checkOut(eventId, alice);
        vm.warp(startTime + 4 hours); // bob stays 240 minutes
        vm.prank(organizer);
        registry.checkOut(eventId, bob);

        vm.warp(endTime + 1);
        vault.finalize(eventId);
        assertEq(registry.totalWeight(eventId), 420);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        vault.claim(eventId);
        assertEq(alice.balance - aliceBefore, (uint256(100 ether) * 180) / 420);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        vault.claim(eventId);
        assertEq(bob.balance - bobBefore, (uint256(100 ether) * 240) / 420);
    }

    function test_rewardSplitEqually() public {
        (uint256 eventId, address token) = _fundedEvent(KlubTypes.RewardMode.Equal);
        _rsvp(eventId, token, alice);
        _rsvp(eventId, token, bob);
        vm.warp(startTime);
        vm.startPrank(organizer);
        registry.checkIn(eventId, alice);
        registry.checkIn(eventId, bob);
        vm.stopPrank();

        vm.warp(endTime + 1);
        vault.finalize(eventId);

        uint256 before = alice.balance;
        vm.prank(alice);
        vault.claim(eventId);
        assertEq(alice.balance - before, 50 ether);
    }

    function test_noShowCannotClaimAndCannotClaimTwice() public {
        (uint256 eventId, address token) = _fundedEvent(KlubTypes.RewardMode.Equal);
        _rsvp(eventId, token, alice);
        _rsvp(eventId, token, bob); // never checks in

        vm.warp(startTime);
        vm.prank(organizer);
        registry.checkIn(eventId, alice);
        vm.warp(endTime + 1);
        vault.finalize(eventId);

        vm.prank(bob);
        vm.expectRevert(KlubRewardVault.DidNotAttend.selector);
        vault.claim(eventId);

        vm.startPrank(alice);
        vault.claim(eventId);
        vm.expectRevert(KlubRewardVault.AlreadyClaimed.selector);
        vault.claim(eventId);
        vm.stopPrank();
    }

    function test_forfeitedDepositsCanFeedTheRewardPool() public {
        KlubTypes.CreateEventParams memory p = _params(KlubTypes.RewardMode.Equal, false, 0);
        p.policy.noShow = KlubTypes.Destination.RewardPool;
        (uint256 eventId, address token) = _createEvent(p);

        _rsvp(eventId, token, alice);
        _rsvp(eventId, token, bob); // no-show, deposit goes to the pool

        vm.warp(startTime);
        vm.prank(organizer);
        registry.checkIn(eventId, alice);

        vm.warp(endTime + 1);
        vault.finalize(eventId);

        // alice is the only attendee, so she receives bob's forfeited deposit
        vm.prank(alice);
        vault.claim(eventId);
        assertEq(KlubTestToken(token).balanceOf(alice), MIN_HOLDING);
    }

    function test_finalizeRequiresEventToBeOver() public {
        (uint256 eventId,) = _fundedEvent(KlubTypes.RewardMode.Equal);
        vm.expectRevert(KlubRewardVault.TooEarly.selector);
        vault.finalize(eventId);
    }

    function test_leftoverGoesBackToOrganizerAfterClaimWindow() public {
        (uint256 eventId, address token) = _fundedEvent(KlubTypes.RewardMode.Equal);
        _rsvp(eventId, token, alice);
        vm.warp(startTime);
        vm.prank(organizer);
        registry.checkIn(eventId, alice);
        vm.warp(endTime + 1);
        vault.finalize(eventId);

        vm.prank(organizer);
        vm.expectRevert(KlubRewardVault.ClaimWindowOpen.selector);
        vault.withdrawLeftover(eventId);

        vm.warp(uint256(endTime) + vault.CLAIM_WINDOW() + 1);
        uint256 before = organizer.balance;
        vm.prank(organizer);
        vault.withdrawLeftover(eventId);
        assertEq(organizer.balance - before, 100 ether);
    }
}

contract KlubQuestTest is KlubBase {
    function _eventWithGuests() internal returns (uint256 eventId, address token) {
        (eventId, token) = _createEvent(_params(KlubTypes.RewardMode.Equal, false, 0));
        _rsvp(eventId, token, alice);
        _rsvp(eventId, token, bob);
        vm.warp(startTime);
        vm.startPrank(organizer);
        registry.checkIn(eventId, alice);
        registry.checkIn(eventId, bob);
        vm.stopPrank();
    }

    function test_holdTokenQuestSplitsRewardEqually() public {
        (uint256 eventId, address token) = _eventWithGuests();
        vm.prank(organizer);
        uint256 questId = quests.createQuest{value: 10 ether}(
            eventId, KlubQuestRegistry.QuestKind.HoldToken, 100e18, "", 0, 0
        );

        _fund(token, alice, 100e18);
        vm.prank(alice);
        quests.completeQuest(eventId, questId);

        vm.prank(bob);
        vm.expectRevert(KlubQuestRegistry.RequirementNotMet.selector);
        quests.completeQuest(eventId, questId);

        vm.warp(endTime + 1);
        vault.finalize(eventId);

        uint256 before = alice.balance;
        vm.prank(alice);
        vault.claimQuest(eventId, questId);
        assertEq(alice.balance - before, 10 ether);
    }

    function test_stayMinutesQuest() public {
        (uint256 eventId,) = _eventWithGuests();
        vm.prank(organizer);
        uint256 questId =
            quests.createQuest{value: 4 ether}(eventId, KlubQuestRegistry.QuestKind.StayMinutes, 120, "", 0, 0);

        vm.warp(startTime + 3 hours);
        vm.prank(organizer);
        registry.checkOut(eventId, alice);
        vm.prank(alice);
        quests.completeQuest(eventId, questId);
        assertTrue(quests.hasCompleted(eventId, questId, alice));

        vm.warp(startTime + 3 hours + 5 minutes);
        vm.prank(organizer);
        registry.checkOut(eventId, bob);
        vm.prank(bob);
        quests.completeQuest(eventId, questId);
        assertEq(quests.completions(eventId, questId), 2);
    }

    function test_referralQuestCountsOnlyFriendsWhoCheckedIn() public {
        (uint256 eventId, address token) = _createEvent(_params(KlubTypes.RewardMode.Equal, false, 0));
        _rsvp(eventId, token, alice);
        _rsvp(eventId, token, bob);
        _rsvp(eventId, token, carol);

        vm.prank(bob);
        quests.setReferrer(eventId, alice);
        vm.prank(carol);
        quests.setReferrer(eventId, alice);

        vm.prank(organizer);
        uint256 questId =
            quests.createQuest{value: 2 ether}(eventId, KlubQuestRegistry.QuestKind.InviteCheckedIn, 2, "", 0, 0);

        vm.warp(startTime);
        vm.startPrank(organizer);
        registry.checkIn(eventId, alice);
        registry.checkIn(eventId, bob);
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(KlubQuestRegistry.RequirementNotMet.selector);
        quests.completeQuest(eventId, questId);

        vm.prank(organizer);
        registry.checkIn(eventId, carol);
        vm.prank(alice);
        quests.completeQuest(eventId, questId);
        assertEq(quests.countReferralsCheckedIn(eventId, alice), 2);
    }

    function test_socialQuestNeedsOrganizerApproval() public {
        (uint256 eventId,) = _eventWithGuests();
        vm.prank(organizer);
        uint256 questId =
            quests.createQuest{value: 2 ether}(eventId, KlubQuestRegistry.QuestKind.Social, 0, "", 0, 0);

        vm.prank(alice);
        quests.submitSocialProof(eventId, "https://example.com/post");

        vm.prank(alice);
        vm.expectRevert(KlubQuestRegistry.WrongKind.selector);
        quests.completeQuest(eventId, questId);

        address[] memory guests = new address[](1);
        guests[0] = alice;
        vm.prank(bob);
        vm.expectRevert(KlubQuestRegistry.NotOrganizer.selector);
        quests.approveSocialQuest(eventId, questId, guests);

        vm.prank(organizer);
        quests.approveSocialQuest(eventId, questId, guests);
        assertTrue(quests.hasCompleted(eventId, questId, alice));
    }

    function test_boothQuestMarkedByStaff() public {
        (uint256 eventId,) = _eventWithGuests();
        vm.startPrank(organizer);
        registry.setStaff(eventId, staff, true);
        uint256 questId = quests.createQuest{value: 1 ether}(eventId, KlubQuestRegistry.QuestKind.Booth, 0, "", 0, 0);
        vm.stopPrank();

        address[] memory guests = new address[](1);
        guests[0] = bob;
        vm.prank(staff);
        quests.markBooth(eventId, questId, guests);
        assertTrue(quests.hasCompleted(eventId, questId, bob));
    }
}
