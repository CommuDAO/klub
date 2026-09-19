// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {KlubEventFactory} from "../contracts/KlubEventFactory.sol";
import {KlubCheckInRegistry} from "../contracts/KlubCheckInRegistry.sol";
import {KlubRewardVault} from "../contracts/KlubRewardVault.sol";
import {KlubQuestRegistry, IKlubVaultFunding} from "../contracts/KlubQuestRegistry.sol";
import {KlubProfileRegistry} from "../contracts/KlubProfileRegistry.sol";
import {KlubTestnetAdapter} from "../contracts/testnet/KlubTestnetAdapter.sol";
import {IKlubEventFactory} from "../contracts/interfaces/IKlubEventFactory.sol";
import {IKlubCheckInRegistry} from "../contracts/interfaces/IKlubCheckInRegistry.sol";
import {IKlubCheckInView} from "../contracts/interfaces/IKlubCheckInView.sol";
import {IKlubQuestRegistry} from "../contracts/interfaces/IKlubQuestRegistry.sol";
import {IKlubRewardVault} from "../contracts/interfaces/IKlubRewardVault.sol";
import {IKlubBuyAdapter} from "../contracts/interfaces/IKlubBuyAdapter.sol";

/// @notice Deploys the whole KLUB system and wires it together.
/// Testnet (chain 25925) deploys KlubTestnetAdapter unless ADAPTER is set.
/// Mainnet (chain 96) requires ADAPTER, the adapter that talks to the DEX.
///
///   forge script script/Deploy.s.sol --rpc-url kub_testnet --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.envOr("ADMIN", vm.addr(pk));
        uint256 minInitialBuy = vm.envOr("MIN_INITIAL_BUY", uint256(10 ether));
        address adapter = vm.envOr("ADAPTER", address(0));

        vm.startBroadcast(pk);

        KlubEventFactory factory = new KlubEventFactory(admin, minInitialBuy);
        KlubCheckInRegistry registry = new KlubCheckInRegistry(IKlubEventFactory(address(factory)), admin);
        KlubRewardVault vault =
            new KlubRewardVault(IKlubEventFactory(address(factory)), IKlubCheckInView(address(registry)), admin);
        KlubQuestRegistry quests = new KlubQuestRegistry(
            IKlubEventFactory(address(factory)),
            IKlubCheckInView(address(registry)),
            IKlubVaultFunding(address(vault))
        );
        KlubProfileRegistry profiles = new KlubProfileRegistry();

        if (adapter == address(0)) {
            require(block.chainid != 96, "ADAPTER required on mainnet");
            adapter = address(new KlubTestnetAdapter());
        }

        factory.setWiring(IKlubBuyAdapter(adapter), IKlubCheckInRegistry(address(registry)));
        registry.setVault(IKlubRewardVault(address(vault)));
        vault.setQuests(IKlubQuestRegistry(address(quests)));

        vm.stopBroadcast();

        console2.log("chainId          ", block.chainid);
        console2.log("KlubEventFactory ", address(factory));
        console2.log("CheckInRegistry  ", address(registry));
        console2.log("RewardVault      ", address(vault));
        console2.log("QuestRegistry    ", address(quests));
        console2.log("ProfileRegistry  ", address(profiles));
        console2.log("BuyAdapter       ", adapter);
    }
}
