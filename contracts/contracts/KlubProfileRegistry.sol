// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title KlubProfileRegistry
/// @notice On-chain display name, avatar and Telegram handle, plus following
/// organizers. Nothing here is verified; it is what the wallet owner typed.
contract KlubProfileRegistry {
    struct Profile {
        string name;
        string avatarCID;
        string telegram;
        uint64 updatedAt;
    }

    mapping(address => Profile) private _profiles;
    mapping(address => mapping(address => bool)) public isFollowing; // follower => organizer
    mapping(address => uint256) public followerCount;
    mapping(address => address[]) private _following;

    event ProfileUpdated(address indexed account, string name, string avatarCID, string telegram);
    event Followed(address indexed follower, address indexed organizer);
    event Unfollowed(address indexed follower, address indexed organizer);

    error AlreadyFollowing();
    error NotFollowing();
    error CannotFollowSelf();

    function setProfile(string calldata name, string calldata avatarCID, string calldata telegram) external {
        _profiles[msg.sender] =
            Profile({name: name, avatarCID: avatarCID, telegram: telegram, updatedAt: uint64(block.timestamp)});
        emit ProfileUpdated(msg.sender, name, avatarCID, telegram);
    }

    function follow(address organizer) external {
        if (organizer == msg.sender) revert CannotFollowSelf();
        if (isFollowing[msg.sender][organizer]) revert AlreadyFollowing();
        isFollowing[msg.sender][organizer] = true;
        followerCount[organizer] += 1;
        _following[msg.sender].push(organizer);
        emit Followed(msg.sender, organizer);
    }

    function unfollow(address organizer) external {
        if (!isFollowing[msg.sender][organizer]) revert NotFollowing();
        isFollowing[msg.sender][organizer] = false;
        followerCount[organizer] -= 1;
        address[] storage list = _following[msg.sender];
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == organizer) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
        emit Unfollowed(msg.sender, organizer);
    }

    function profileOf(address account) external view returns (Profile memory) {
        return _profiles[account];
    }

    function profilesOf(address[] calldata accounts) external view returns (Profile[] memory out) {
        out = new Profile[](accounts.length);
        for (uint256 i; i < accounts.length; ++i) {
            out[i] = _profiles[accounts[i]];
        }
    }

    function followingOf(address follower) external view returns (address[] memory) {
        return _following[follower];
    }
}
