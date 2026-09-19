// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IKlubBuyAdapter} from "../interfaces/IKlubBuyAdapter.sol";
import {IERC20} from "../libraries/KlubERC20.sol";

/// @dev Replace these two interfaces with the real PumpCoreNative and Junoswap
/// router signatures before deploying. Nothing else in KLUB changes.
interface IPumpCoreNative {
    function createToken(string calldata name, string calldata symbol, string calldata metadata)
        external
        payable
        returns (address token);

    function buy(address token, uint256 minTokensOut, address to) external payable returns (uint256 amountOut);

    function graduated(address token) external view returns (bool);
}

interface IJunoswapRouter {
    function swapExactNativeForTokens(address token, uint256 minTokensOut, address to, uint256 deadline)
        external
        payable
        returns (uint256 amountOut);
}

/// @title KlubJunoswapAdapter
/// @notice The only KLUB contract that knows the Junoswap launchpad and router.
/// It re-checks the delivered amount against KLUB's own minTokensOut, so a
/// missing slippage guard on the router cannot hurt an organizer.
contract KlubJunoswapAdapter is IKlubBuyAdapter {
    IPumpCoreNative public immutable launchpad;
    IJunoswapRouter public immutable router;

    error NoValue();
    error SlippageTooHigh(uint256 amountOut, uint256 minTokensOut);
    error TokenNotDelivered();

    constructor(IPumpCoreNative launchpad_, IJunoswapRouter router_) {
        launchpad = launchpad_;
        router = router_;
    }

    function createTokenAndBuy(
        string calldata name,
        string calldata symbol,
        string calldata metadataCID,
        address, /* creator */
        address recipient,
        uint256 minTokensOut
    ) external payable returns (address token, uint256 amountOut) {
        if (msg.value == 0) revert NoValue();
        token = launchpad.createToken(name, symbol, metadataCID);
        if (token == address(0)) revert TokenNotDelivered();

        uint256 before = IERC20(token).balanceOf(recipient);
        launchpad.buy{value: msg.value}(token, minTokensOut, recipient);
        amountOut = IERC20(token).balanceOf(recipient) - before;
        if (amountOut < minTokensOut) revert SlippageTooHigh(amountOut, minTokensOut);
    }

    function buyExisting(address token, address recipient, uint256 minTokensOut)
        external
        payable
        returns (uint256 amountOut)
    {
        if (msg.value == 0) revert NoValue();
        uint256 before = IERC20(token).balanceOf(recipient);

        if (launchpad.graduated(token)) {
            router.swapExactNativeForTokens{value: msg.value}(token, minTokensOut, recipient, block.timestamp);
        } else {
            launchpad.buy{value: msg.value}(token, minTokensOut, recipient);
        }

        amountOut = IERC20(token).balanceOf(recipient) - before;
        if (amountOut < minTokensOut) revert SlippageTooHigh(amountOut, minTokensOut);
    }
}
