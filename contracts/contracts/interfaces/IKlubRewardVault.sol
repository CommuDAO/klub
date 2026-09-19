// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IKlubRewardVault {
    /// @notice Called by the check-in registry after it has transferred
    /// forfeited event tokens into the check-in pool.
    function notifyTokenDeposit(uint256 eventId, uint256 amount) external;
}
