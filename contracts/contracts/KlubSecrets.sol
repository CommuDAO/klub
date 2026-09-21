// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IKlubOrganizerLookup {
    function organizerOf(uint256 eventId) external view returns (address);
}

/// @title KlubSecrets
/// @notice Lets an organizer share an event's private details with approved
/// guests without any server. Everything stored here is already encrypted in
/// the browser: guests publish an X25519 public key, and the organizer stores
/// the event key sealed to each guest's public key. The contract never sees a
/// plaintext secret and cannot decrypt anything.
contract KlubSecrets {
    IKlubOrganizerLookup public immutable factory;

    /// X25519 public key per wallet, derived in the browser from a signature.
    mapping(address => bytes32) public encryptionKey;
    /// eventId => guest => event key sealed to that guest's public key.
    mapping(uint256 => mapping(address => bytes)) private _sealed;

    event EncryptionKeySet(address indexed account, bytes32 key);
    event KeyShared(uint256 indexed eventId, address indexed guest);

    error NotOrganizer();
    error LengthMismatch();
    error EmptyKey();

    constructor(IKlubOrganizerLookup factory_) {
        factory = factory_;
    }

    function setEncryptionKey(bytes32 key) external {
        if (key == bytes32(0)) revert EmptyKey();
        encryptionKey[msg.sender] = key;
        emit EncryptionKeySet(msg.sender, key);
    }

    /// @notice Only the event's organizer can hand out its key.
    function shareKeys(uint256 eventId, address[] calldata guests, bytes[] calldata sealedKeys) external {
        if (msg.sender != factory.organizerOf(eventId)) revert NotOrganizer();
        if (guests.length != sealedKeys.length) revert LengthMismatch();
        for (uint256 i; i < guests.length; ++i) {
            _sealed[eventId][guests[i]] = sealedKeys[i];
            emit KeyShared(eventId, guests[i]);
        }
    }

    function sealedKeyOf(uint256 eventId, address guest) external view returns (bytes memory) {
        return _sealed[eventId][guest];
    }

    function encryptionKeysOf(address[] calldata accounts) external view returns (bytes32[] memory keys) {
        keys = new bytes32[](accounts.length);
        for (uint256 i; i < accounts.length; ++i) {
            keys[i] = encryptionKey[accounts[i]];
        }
    }
}
