// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IKlubBuyAdapter} from "../interfaces/IKlubBuyAdapter.sol";
import {IERC20, KlubERC20} from "../libraries/KlubERC20.sol";

/// @notice Bonding-curve launchpad on KUB Chain.
interface IBondingCurve {
    function createFee() external view returns (uint256);

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata logo,
        string calldata description,
        string calldata link1,
        string calldata link2,
        string calldata link3
    ) external payable returns (address token);

    /// @dev Tokens are delivered to msg.sender.
    function buy(address tokenAddr, uint256 minToken) external payable returns (uint256 amountOut);

    function pumpReserve(address token) external view returns (uint256 nativeReserve, uint256 tokenReserve);
}

/// @notice Aggregator router, used once a token has graduated.
interface IAggRouter {
    struct AggregateParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        address recipient;
        uint256 deadline;
        bool unwrapOut;
        address referrer;
    }

    struct Hop {
        address factory;
        bytes swapData;
    }

    struct Leg {
        uint256 amountIn;
        Hop[] hops;
    }

    function aggregate(AggregateParams calldata p, Leg[] calldata legs)
        external
        payable
        returns (uint256 amountOut);
}

/// @title KlubDexAdapter
/// @notice The only KLUB contract that knows the DEX. It splits the create fee
/// from the organizer initial buy, forwards the tokens the launchpad sends back
/// to this contract, and always re-checks the delivered amount against KLUB's
/// own minTokensOut, so a missing slippage guard on the router cannot hurt an
/// organizer.
contract KlubDexAdapter is IKlubBuyAdapter {
    using KlubERC20 for IERC20;

    IBondingCurve public immutable launchpad;
    IAggRouter public immutable router;

    error NoValue();
    error ValueBelowCreateFee(uint256 sent, uint256 createFee);
    error TokenNotDelivered();
    error SlippageTooHigh(uint256 amountOut, uint256 minTokensOut);
    error RouteRequired();
    error RouteNotAllowedOnCurve();

    constructor(IBondingCurve launchpad_, IAggRouter router_) {
        launchpad = launchpad_;
        router = router_;
    }

    /// @notice Deploys a token on the bonding curve and spends the rest of the
    /// value buying it for the organizer. metadataCID is stored as the token
    /// logo field, which is where the launchpad keeps its off-chain metadata.
    function createTokenAndBuy(
        string calldata name,
        string calldata symbol,
        string calldata metadataCID,
        address, /* creator */
        address recipient,
        uint256 minTokensOut
    ) external payable returns (address token, uint256 amountOut) {
        uint256 fee = launchpad.createFee();
        if (msg.value <= fee) revert ValueBelowCreateFee(msg.value, fee);

        TokenInfo memory info = _tokenInfo(metadataCID);
        token = launchpad.createToken{value: fee}(
            name, symbol, info.logo, info.description, info.link1, info.link2, info.link3
        );
        if (token == address(0)) revert TokenNotDelivered();

        amountOut = _buyOnCurve(token, msg.value - fee, minTokensOut, recipient);
    }

    /// @notice Buys a token that already exists. routeData is empty while the
    /// token is still on the curve; once it has graduated the app passes the
    /// encoded router legs.
    function buyExisting(address token, address recipient, uint256 minTokensOut, bytes calldata routeData)
        external
        payable
        returns (uint256 amountOut)
    {
        if (msg.value == 0) revert NoValue();

        (, uint256 tokenReserve) = launchpad.pumpReserve(token);
        bool onCurve = tokenReserve > 0;

        if (onCurve) {
            if (routeData.length != 0) revert RouteNotAllowedOnCurve();
            return _buyOnCurve(token, msg.value, minTokensOut, recipient);
        }

        if (routeData.length == 0) revert RouteRequired();
        IAggRouter.Leg[] memory legs = abi.decode(routeData, (IAggRouter.Leg[]));

        uint256 before = IERC20(token).balanceOf(recipient);
        router.aggregate{value: msg.value}(
            IAggRouter.AggregateParams({
                tokenIn: address(0),
                tokenOut: token,
                amountIn: msg.value,
                minAmountOut: minTokensOut,
                recipient: recipient,
                deadline: block.timestamp,
                unwrapOut: false,
                referrer: address(0)
            }),
            legs
        );
        amountOut = IERC20(token).balanceOf(recipient) - before;
        if (amountOut < minTokensOut) revert SlippageTooHigh(amountOut, minTokensOut);
    }

    struct TokenInfo {
        string logo;
        string description;
        string link1;
        string link2;
        string link3;
    }

    bytes5 private constant INFO_PREFIX = "klub:";

    /// @dev The factory hands over one string. Plain text is the logo link, as
    /// before. "klub:" followed by hex is abi.encode(logo, description, link1,
    /// link2, link3), which fills the launchpad's About section too.
    function _tokenInfo(string calldata value) private pure returns (TokenInfo memory info) {
        bytes calldata raw = bytes(value);
        if (raw.length < 5 || bytes5(raw[:5]) != INFO_PREFIX) {
            info.logo = value;
            return info;
        }
        bytes memory packed = _fromHex(raw[5:]);
        (info.logo, info.description, info.link1, info.link2, info.link3) =
            abi.decode(packed, (string, string, string, string, string));
    }

    error BadHex();

    function _fromHex(bytes calldata hexChars) private pure returns (bytes memory out) {
        if (hexChars.length % 2 != 0) revert BadHex();
        out = new bytes(hexChars.length / 2);
        for (uint256 i; i < out.length; ++i) {
            out[i] = bytes1((_nibble(hexChars[2 * i]) << 4) | _nibble(hexChars[2 * i + 1]));
        }
    }

    function _nibble(bytes1 c) private pure returns (uint8) {
        uint8 b = uint8(c);
        if (b >= 48 && b <= 57) return b - 48; // 0-9
        if (b >= 97 && b <= 102) return b - 87; // a-f
        if (b >= 65 && b <= 70) return b - 55; // A-F
        revert BadHex();
    }

    /// @dev The launchpad sends bought tokens to msg.sender, so this contract
    /// receives them and forwards the exact amount to the organizer.
    function _buyOnCurve(address token, uint256 value, uint256 minTokensOut, address recipient)
        private
        returns (uint256 amountOut)
    {
        IERC20 erc20 = IERC20(token);
        uint256 before = erc20.balanceOf(address(this));
        launchpad.buy{value: value}(token, minTokensOut);
        amountOut = erc20.balanceOf(address(this)) - before;
        if (amountOut < minTokensOut || amountOut == 0) revert SlippageTooHigh(amountOut, minTokensOut);
        erc20.pushExact(recipient, amountOut);
    }
}
