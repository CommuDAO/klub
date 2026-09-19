// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {KlubJunoswapAdapter, IJunoBondingCurve, IJunoAggRouter} from "../contracts/mainnet/KlubJunoswapAdapter.sol";
import {KlubEventFactory} from "../contracts/KlubEventFactory.sol";
import {KlubCheckInRegistry} from "../contracts/KlubCheckInRegistry.sol";
import {KlubRewardVault} from "../contracts/KlubRewardVault.sol";
import {KlubQuestRegistry, IKlubVaultFunding} from "../contracts/KlubQuestRegistry.sol";
import {KlubProfileRegistry} from "../contracts/KlubProfileRegistry.sol";
import {IKlubEventFactory} from "../contracts/interfaces/IKlubEventFactory.sol";
import {IKlubCheckInRegistry} from "../contracts/interfaces/IKlubCheckInRegistry.sol";
import {IKlubCheckInView} from "../contracts/interfaces/IKlubCheckInView.sol";
import {IKlubQuestRegistry} from "../contracts/interfaces/IKlubQuestRegistry.sol";
import {IKlubRewardVault} from "../contracts/interfaces/IKlubRewardVault.sol";
import {IKlubBuyAdapter} from "../contracts/interfaces/IKlubBuyAdapter.sol";

/// @notice Full KLUB deployment on Bitkub Chain mainnet (96).
///
///   PRIVATE_KEY=0x… forge script script/DeployMainnet.s.sol --rpc-url kub_mainnet --broadcast
contract DeployMainnet is Script {
    // Junoswap deployments on chain 96, from @coshi190/juno-moneta-sdk
    address constant BONDING_CURVE = 0x65F6EC30A9E70822721585f6Bba15c40c2F8ab4e;
    address constant AGG_ROUTER = 0x869A40921A332e0D79300F91361A3DC77F2a0ebc;

    function run() external {
        require(block.chainid == 96, "not Bitkub mainnet");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.envOr("ADMIN", vm.addr(pk));
        uint256 minInitialBuy = vm.envOr("MIN_INITIAL_BUY", uint256(10 ether));
        address curve = vm.envOr("BONDING_CURVE", BONDING_CURVE);
        address router = vm.envOr("AGG_ROUTER", AGG_ROUTER);

        vm.startBroadcast(pk);

        KlubJunoswapAdapter adapter =
            new KlubJunoswapAdapter(IJunoBondingCurve(curve), IJunoAggRouter(router));
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

        factory.setWiring(IKlubBuyAdapter(address(adapter)), IKlubCheckInRegistry(address(registry)));
        registry.setVault(IKlubRewardVault(address(vault)));
        vault.setQuests(IKlubQuestRegistry(address(quests)));

        vm.stopBroadcast();

        console2.log("NEXT_PUBLIC_ADAPTER  =", address(adapter));
        console2.log("NEXT_PUBLIC_FACTORY  =", address(factory));
        console2.log("NEXT_PUBLIC_REGISTRY =", address(registry));
        console2.log("NEXT_PUBLIC_VAULT    =", address(vault));
        console2.log("NEXT_PUBLIC_QUESTS   =", address(quests));
        console2.log("NEXT_PUBLIC_PROFILES =", address(profiles));
    }
}
