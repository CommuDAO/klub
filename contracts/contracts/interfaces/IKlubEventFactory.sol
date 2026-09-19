// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KlubTypes} from "../KlubTypes.sol";

interface IKlubEventFactory {
    function eventCount() external view returns (uint256);

    function getEvent(uint256 eventId) external view returns (KlubTypes.EventConfig memory);

    function organizerOf(uint256 eventId) external view returns (address);

    function tokenOf(uint256 eventId) external view returns (address);

    function exists(uint256 eventId) external view returns (bool);
}
