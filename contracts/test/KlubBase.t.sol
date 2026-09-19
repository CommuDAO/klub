// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KlubTypes} from "../contracts/KlubTypes.sol";
import {KlubEventFactory} from "../contracts/KlubEventFactory.sol";
import {KlubCheckInRegistry} from "../contracts/KlubCheckInRegistry.sol";
import {KlubRewardVault} from "../contracts/KlubRewardVault.sol";
import {KlubQuestRegistry} from "../contracts/KlubQuestRegistry.sol";
import {KlubProfileRegistry} from "../contracts/KlubProfileRegistry.sol";
import {KlubTestnetAdapter, KlubTestToken} from "../contracts/testnet/KlubTestnetAdapter.sol";
import {IKlubEventFactory} from "../contracts/interfaces/IKlubEventFactory.sol";
import {IKlubCheckInView} from "../contracts/interfaces/IKlubCheckInView.sol";
import {IKlubQuestRegistry} from "../contracts/interfaces/IKlubQuestRegistry.sol";
import {IKlubRewardVault} from "../contracts/interfaces/IKlubRewardVault.sol";
import {IKlubBuyAdapter} from "../contracts/interfaces/IKlubBuyAdapter.sol";
import {IKlubCheckInRegistry} from "../contracts/interfaces/IKlubCheckInRegistry.sol";
import {IKlubVaultFunding} from "../contracts/KlubQuestRegistry.sol";

/// @dev Shared deployment and helpers for every KLUB test.
abstract contract KlubBase is Test {
    KlubEventFactory internal factory;
    KlubCheckInRegistry internal registry;
    KlubRewardVault internal vault;
    KlubQuestRegistry internal quests;
    KlubProfileRegistry internal profiles;
    KlubTestnetAdapter internal adapter;

    address internal admin = address(0xA11CE);
    address internal organizer = address(0x0B9A);
    address internal alice = address(0xA1);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA401);
    address internal staff = address(0x57AFF);

    uint256 internal constant MIN_INITIAL_BUY = 10 ether;
    uint128 internal constant MIN_HOLDING = 500e18;
    uint128 internal constant BURN_AMOUNT = 200e18;

    uint64 internal startTime;
    uint64 internal endTime;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        startTime = uint64(block.timestamp + 1 days);
        endTime = startTime + 4 hours;

        vm.startPrank(admin);
        factory = new KlubEventFactory(admin, MIN_INITIAL_BUY);
        registry = new KlubCheckInRegistry(IKlubEventFactory(address(factory)), admin);
        vault = new KlubRewardVault(
            IKlubEventFactory(address(factory)), IKlubCheckInView(address(registry)), admin
        );
        quests = new KlubQuestRegistry(
            IKlubEventFactory(address(factory)),
            IKlubCheckInView(address(registry)),
            IKlubVaultFunding(address(vault))
        );
        profiles = new KlubProfileRegistry();
        adapter = new KlubTestnetAdapter();

        factory.setWiring(IKlubBuyAdapter(address(adapter)), IKlubCheckInRegistry(address(registry)));
        registry.setVault(IKlubRewardVault(address(vault)));
        vault.setQuests(IKlubQuestRegistry(address(quests)));
        vm.stopPrank();

        vm.deal(organizer, 1000 ether);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);
    }

    function _policy(
        KlubTypes.Destination remainder,
        KlubTypes.Destination cancelBefore,
        KlubTypes.Destination cancelAfter,
        KlubTypes.Destination rejected,
        KlubTypes.Destination noShow
    ) internal view returns (KlubTypes.RefundPolicy memory) {
        return KlubTypes.RefundPolicy({
            remainder: remainder,
            cancelBefore: cancelBefore,
            cancelAfter: cancelAfter,
            rejected: rejected,
            noShow: noShow,
            refundCutoff: startTime - 1 hours
        });
    }

    function _params(KlubTypes.RewardMode mode, bool requireApproval, uint32 capacity)
        internal
        view
        returns (KlubTypes.CreateEventParams memory p)
    {
        p = KlubTypes.CreateEventParams({
            token: address(0),
            name: "KLUB Night",
            symbol: "KNIGHT",
            metadataCID: "bafyTest",
            startTime: startTime,
            endTime: endTime,
            rewardMode: mode,
            minCreditMinutes: 60,
            methods: KlubTypes.METHOD_STAFF | KlubTypes.METHOD_KIOSK | KlubTypes.METHOD_CODE,
            requireApproval: requireApproval,
            capacity: capacity,
            minHolding: MIN_HOLDING,
            burnAmount: BURN_AMOUNT,
            policy: _policy(
                KlubTypes.Destination.Refund,
                KlubTypes.Destination.Refund,
                KlubTypes.Destination.Burn,
                KlubTypes.Destination.Refund,
                KlubTypes.Destination.Burn
            ),
            minTokensOut: 0
        });
    }

    function _createEvent(KlubTypes.CreateEventParams memory p) internal returns (uint256 eventId, address token) {
        vm.prank(organizer);
        eventId = factory.createEvent{value: MIN_INITIAL_BUY}(p);
        token = factory.tokenOf(eventId);
    }

    function _fund(address token, address who, uint256 amount) internal {
        adapter.faucet(token, 0); // no-op guard that the token is known
        vm.prank(who);
        adapter.faucet(token, amount);
    }

    function _rsvp(uint256 eventId, address token, address who) internal {
        _fund(token, who, MIN_HOLDING);
        vm.startPrank(who);
        KlubTestToken(token).approve(address(registry), MIN_HOLDING);
        registry.rsvp(eventId);
        vm.stopPrank();
    }
}
