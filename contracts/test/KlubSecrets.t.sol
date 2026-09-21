// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KlubSecrets, IKlubOrganizerLookup} from "../contracts/KlubSecrets.sol";

contract FakeFactory is IKlubOrganizerLookup {
    mapping(uint256 => address) public organizers;

    function setOrganizer(uint256 eventId, address who) external {
        organizers[eventId] = who;
    }

    function organizerOf(uint256 eventId) external view returns (address) {
        return organizers[eventId];
    }
}

contract KlubSecretsTest is Test {
    FakeFactory factory;
    KlubSecrets secrets;
    address organizer = address(0xA11CE);
    address guest = address(0xB0B);

    function setUp() public {
        factory = new FakeFactory();
        factory.setOrganizer(1, organizer);
        secrets = new KlubSecrets(factory);
    }

    function test_guestPublishesKey() public {
        vm.prank(guest);
        secrets.setEncryptionKey(bytes32(uint256(42)));
        assertEq(secrets.encryptionKey(guest), bytes32(uint256(42)));

        address[] memory who = new address[](1);
        who[0] = guest;
        assertEq(secrets.encryptionKeysOf(who)[0], bytes32(uint256(42)));
    }

    function test_emptyKeyRejected() public {
        vm.prank(guest);
        vm.expectRevert(KlubSecrets.EmptyKey.selector);
        secrets.setEncryptionKey(bytes32(0));
    }

    function test_organizerSharesSealedKey() public {
        address[] memory who = new address[](1);
        who[0] = guest;
        bytes[] memory sealedKeys = new bytes[](1);
        sealedKeys[0] = hex"deadbeef";

        vm.prank(organizer);
        secrets.shareKeys(1, who, sealedKeys);
        assertEq(secrets.sealedKeyOf(1, guest), hex"deadbeef");
    }

    function test_onlyOrganizerShares() public {
        address[] memory who = new address[](1);
        who[0] = guest;
        bytes[] memory sealedKeys = new bytes[](1);
        sealedKeys[0] = hex"01";

        vm.prank(guest);
        vm.expectRevert(KlubSecrets.NotOrganizer.selector);
        secrets.shareKeys(1, who, sealedKeys);
    }

    function test_lengthsMustMatch() public {
        address[] memory who = new address[](2);
        bytes[] memory sealedKeys = new bytes[](1);
        vm.prank(organizer);
        vm.expectRevert(KlubSecrets.LengthMismatch.selector);
        secrets.shareKeys(1, who, sealedKeys);
    }
}
