// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {KlubTypes} from "../contracts/KlubTypes.sol";
import {KlubEventFactory} from "../contracts/KlubEventFactory.sol";
import {KlubRewardVault} from "../contracts/KlubRewardVault.sol";

/// @notice Creates one demo event on testnet so the web app has data to read.
///
///   FACTORY=0x... VAULT=0x... forge script script/SeedTestnet.s.sol \
///     --rpc-url kub_testnet --broadcast
contract SeedTestnet is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        KlubEventFactory factory = KlubEventFactory(vm.envAddress("FACTORY"));
        KlubRewardVault vault = KlubRewardVault(payable(vm.envAddress("VAULT")));

        uint64 start = uint64(block.timestamp + 1 hours);
        uint64 end = start + 4 hours;

        KlubTypes.RefundPolicy memory policy = KlubTypes.RefundPolicy({
            remainder: KlubTypes.Destination.Refund,
            cancelBefore: KlubTypes.Destination.Refund,
            cancelAfter: KlubTypes.Destination.Burn,
            rejected: KlubTypes.Destination.Refund,
            noShow: KlubTypes.Destination.Burn,
            refundCutoff: start - 30 minutes
        });

        KlubTypes.CreateEventParams memory p = KlubTypes.CreateEventParams({
            token: address(0),
            name: "KLUB Testnet Night",
            symbol: "KTEST",
            metadataCID: vm.envOr("METADATA_CID", string("bafyPlaceholder")),
            startTime: start,
            endTime: end,
            rewardMode: KlubTypes.RewardMode.ByTime,
            minCreditMinutes: 60,
            methods: KlubTypes.METHOD_STAFF | KlubTypes.METHOD_KIOSK | KlubTypes.METHOD_CODE,
            requireApproval: false,
            capacity: 50,
            minHolding: 500e18,
            burnAmount: 200e18,
            policy: policy,
            minTokensOut: 0,
            routeData: ""
        });

        vm.startBroadcast(pk);
        uint256 eventId = factory.createEvent{value: 10 ether}(p);
        vault.fundCheckIn{value: 1 ether}(eventId, 0);
        vm.stopBroadcast();

        console2.log("eventId", eventId);
        console2.log("token  ", factory.tokenOf(eventId));
    }
}
