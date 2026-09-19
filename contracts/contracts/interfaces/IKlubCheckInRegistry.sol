// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IKlubCheckInRegistry {
    function checkedInCount(uint256 eventId) external view returns (uint256);

    function checkedOutCount(uint256 eventId) external view returns (uint256);

    function checkInTime(uint256 eventId, address guest) external view returns (uint64);

    function totalWeight(uint256 eventId) external view returns (uint256);

    function guestWeight(uint256 eventId, address guest) external view returns (uint256);

    function settled(uint256 eventId) external view returns (bool);

    function settle(uint256 eventId) external;
}
