// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Thin boundary between KLUB and the launchpad and router.
/// Deployed separately once that ABI is fixed, so KLUB never depends on that
/// codebase directly. KLUB always passes its own minTokensOut and never relies
/// on router level slippage checks.
interface IKlubBuyAdapter {
    function createTokenAndBuy(
        string calldata name,
        string calldata symbol,
        string calldata metadataCID,
        address creator,
        address recipient,
        uint256 minTokensOut
    ) external payable returns (address token, uint256 amountOut);

    /// @param routeData empty for a token still on the bonding curve; for a
    /// graduated token it is the swap route the app computed, opaque to KLUB.
    function buyExisting(address token, address recipient, uint256 minTokensOut, bytes calldata routeData)
        external
        payable
        returns (uint256 amountOut);
}
