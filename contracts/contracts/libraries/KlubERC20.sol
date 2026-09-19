// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// @notice Transfer helpers that measure what was actually received, so
/// fee-on-transfer tokens revert instead of short-changing an event.
library KlubERC20 {
    error TransferFailed();
    error AmountNotReceived(uint256 expected, uint256 received);

    function pullExact(IERC20 token, address from, uint256 amount) internal {
        uint256 before = token.balanceOf(address(this));
        _call(address(token), abi.encodeCall(IERC20.transferFrom, (from, address(this), amount)));
        uint256 received = token.balanceOf(address(this)) - before;
        if (received != amount) revert AmountNotReceived(amount, received);
    }

    function pushExact(IERC20 token, address to, uint256 amount) internal {
        uint256 before = token.balanceOf(to);
        _call(address(token), abi.encodeCall(IERC20.transfer, (to, amount)));
        uint256 received = token.balanceOf(to) - before;
        if (received != amount) revert AmountNotReceived(amount, received);
    }

    function push(IERC20 token, address to, uint256 amount) internal {
        _call(address(token), abi.encodeCall(IERC20.transfer, (to, amount)));
    }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
