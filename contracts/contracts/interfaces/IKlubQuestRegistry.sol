// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IKlubQuestRegistry {
    function questCount(uint256 eventId) external view returns (uint256);
    function completions(uint256 eventId, uint256 questId) external view returns (uint256);
    function hasCompleted(uint256 eventId, uint256 questId, address guest) external view returns (bool);
}
