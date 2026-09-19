// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KlubDexAdapter, IBondingCurve, IAggRouter} from "../contracts/mainnet/KlubDexAdapter.sol";
import {KlubTestToken} from "../contracts/testnet/KlubTestnetAdapter.sol";

/// @dev Stand-in for the the DEX bonding curve, matching the real ABI.
contract MockCurve is IBondingCurve {
    uint256 public constant TOKENS_PER_NATIVE = 1000;
    uint256 public createFeeValue = 1 ether;
    mapping(address => uint256) public tokenReserveOf;

    function createFee() external view returns (uint256) {
        return createFeeValue;
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata,
        string calldata,
        string calldata,
        string calldata,
        string calldata
    ) external payable returns (address token) {
        require(msg.value == createFeeValue, "fee");
        KlubTestToken t = new KlubTestToken(name, symbol, address(this));
        token = address(t);
        tokenReserveOf[token] = 1_000_000e18;
    }

    function buy(address tokenAddr, uint256 minToken) external payable returns (uint256 amountOut) {
        amountOut = msg.value * TOKENS_PER_NATIVE;
        require(amountOut >= minToken, "slippage");
        KlubTestToken(tokenAddr).mint(msg.sender, amountOut);
    }

    function pumpReserve(address token) external view returns (uint256, uint256) {
        return (0, tokenReserveOf[token]);
    }

    function mintFor(address token, address to, uint256 amount) external {
        KlubTestToken(token).mint(to, amount);
    }

    function setGraduated(address token) external {
        tokenReserveOf[token] = 0;
    }
}

contract MockRouter is IAggRouter {
    uint256 public constant TOKENS_PER_NATIVE = 500;
    MockCurve public immutable curve;

    constructor(MockCurve curve_) {
        curve = curve_;
    }

    function aggregate(AggregateParams calldata p, Leg[] calldata legs) external payable returns (uint256 amountOut) {
        require(legs.length > 0, "no legs");
        amountOut = msg.value * TOKENS_PER_NATIVE;
        require(amountOut >= p.minAmountOut, "slippage");
        curve.mintFor(p.tokenOut, p.recipient, amountOut);
    }
}

contract KlubAdapterTest is Test {
    MockCurve internal curve;
    MockRouter internal router;
    KlubDexAdapter internal adapter;
    address internal organizer = address(0x0B9A);

    function setUp() public {
        curve = new MockCurve();
        router = new MockRouter(curve);
        adapter = new KlubDexAdapter(IBondingCurve(address(curve)), IAggRouter(address(router)));
        vm.deal(organizer, 100 ether);
    }

    function _create() internal returns (address token, uint256 out) {
        vm.prank(organizer);
        (token, out) = adapter.createTokenAndBuy{value: 10 ether}("KLUB Night", "KNIGHT", "bafy", organizer, organizer, 0);
    }

    function test_createSplitsFeeAndForwardsTokens() public {
        (address token, uint256 out) = _create();
        // 10 KUB minus the 1 KUB create fee, at 1000 tokens per KUB
        assertEq(out, 9 ether * 1000);
        assertEq(KlubTestToken(token).balanceOf(organizer), out);
        assertEq(KlubTestToken(token).balanceOf(address(adapter)), 0);
    }

    function test_createRevertsWhenValueOnlyCoversTheFee() public {
        vm.prank(organizer);
        vm.expectRevert(abi.encodeWithSelector(KlubDexAdapter.ValueBelowCreateFee.selector, 1 ether, 1 ether));
        adapter.createTokenAndBuy{value: 1 ether}("N", "S", "cid", organizer, organizer, 0);
    }

    function test_buyExistingOnCurveRejectsRouteData() public {
        (address token,) = _create();
        vm.prank(organizer);
        vm.expectRevert(KlubDexAdapter.RouteNotAllowedOnCurve.selector);
        adapter.buyExisting{value: 1 ether}(token, organizer, 0, hex"1234");
    }

    function test_buyExistingOnCurve() public {
        (address token,) = _create();
        uint256 before = KlubTestToken(token).balanceOf(organizer);
        vm.prank(organizer);
        uint256 out = adapter.buyExisting{value: 2 ether}(token, organizer, 0, "");
        assertEq(out, 2 ether * 1000);
        assertEq(KlubTestToken(token).balanceOf(organizer) - before, out);
    }

    function test_graduatedTokenNeedsARoute() public {
        (address token,) = _create();
        curve.setGraduated(token);
        vm.prank(organizer);
        vm.expectRevert(KlubDexAdapter.RouteRequired.selector);
        adapter.buyExisting{value: 1 ether}(token, organizer, 0, "");
    }

    function test_graduatedTokenBuysThroughRouter() public {
        (address token,) = _create();
        curve.setGraduated(token);

        IAggRouter.Hop[] memory hops = new IAggRouter.Hop[](1);
        hops[0] = IAggRouter.Hop({factory: address(0xF00), swapData: hex"beef"});
        IAggRouter.Leg[] memory legs = new IAggRouter.Leg[](1);
        legs[0] = IAggRouter.Leg({amountIn: 1 ether, hops: hops});

        uint256 before = KlubTestToken(token).balanceOf(organizer);
        vm.prank(organizer);
        uint256 out = adapter.buyExisting{value: 1 ether}(token, organizer, 0, abi.encode(legs));
        assertEq(out, 1 ether * 500);
        assertEq(KlubTestToken(token).balanceOf(organizer) - before, out);
    }

    function test_slippageGuardOnCurve() public {
        (address token,) = _create();
        vm.prank(organizer);
        vm.expectRevert("slippage");
        adapter.buyExisting{value: 1 ether}(token, organizer, 2 ether * 1000, "");
    }
}
