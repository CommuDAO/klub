// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Read-only slice of the check-in registry used by quests and rewards.
interface IKlubCheckInView {
    function checkInTime(uint256 eventId, address guest) external view returns (uint64);
    function checkOutTime(uint256 eventId, address guest) external view returns (uint64);
    function totalWeight(uint256 eventId) external view returns (uint256);
    function guestWeight(uint256 eventId, address guest) external view returns (uint256);
    function settled(uint256 eventId) external view returns (bool);
    function settle(uint256 eventId) external;
    function isStaff(uint256 eventId, address account) external view returns (bool);
}
