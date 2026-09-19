// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IKlubBuyAdapter} from "../interfaces/IKlubBuyAdapter.sol";

/// @notice Very small ERC20 used only on testnet, standing in for a token that
/// the Junoswap launchpad would deploy on mainnet.
contract KlubTestToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public immutable minter;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error NotMinter();

    constructor(string memory name_, string memory symbol_, address minter_) {
        name = name_;
        symbol = symbol_;
        minter = minter_;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

/// @notice Testnet stand-in for the Junoswap launchpad and router. It mints a
/// fixed number of tokens per tKUB instead of running a bonding curve, so the
/// whole KLUB flow can be tested before the real adapter exists on mainnet.
contract KlubTestnetAdapter is IKlubBuyAdapter {
    uint256 public constant TOKENS_PER_NATIVE = 1000;

    mapping(address => bool) public isKlubToken;

    event TestTokenCreated(address indexed token, address indexed creator, string symbol);

    error NoValue();
    error UnknownToken();
    error SlippageTooHigh(uint256 out, uint256 minOut);

    function createTokenAndBuy(
        string calldata name,
        string calldata symbol,
        string calldata,
        address creator,
        address recipient,
        uint256 minTokensOut
    ) external payable returns (address token, uint256 amountOut) {
        if (msg.value == 0) revert NoValue();
        KlubTestToken t = new KlubTestToken(name, symbol, address(this));
        token = address(t);
        isKlubToken[token] = true;
        amountOut = msg.value * TOKENS_PER_NATIVE;
        if (amountOut < minTokensOut) revert SlippageTooHigh(amountOut, minTokensOut);
        t.mint(recipient, amountOut);
        emit TestTokenCreated(token, creator, symbol);
    }

    function buyExisting(address token, address recipient, uint256 minTokensOut)
        external
        payable
        returns (uint256 amountOut)
    {
        if (msg.value == 0) revert NoValue();
        if (!isKlubToken[token]) revert UnknownToken();
        amountOut = msg.value * TOKENS_PER_NATIVE;
        if (amountOut < minTokensOut) revert SlippageTooHigh(amountOut, minTokensOut);
        KlubTestToken(token).mint(recipient, amountOut);
    }

    /// @notice Testnet convenience: anyone can top up their own balance so they
    /// can RSVP and test the deposit and burn flow.
    function faucet(address token, uint256 amount) external {
        if (!isKlubToken[token]) revert UnknownToken();
        KlubTestToken(token).mint(msg.sender, amount);
    }
}
