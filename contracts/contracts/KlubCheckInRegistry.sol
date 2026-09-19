// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KlubTypes} from "./KlubTypes.sol";
import {IKlubEventFactory} from "./interfaces/IKlubEventFactory.sol";
import {IKlubRewardVault} from "./interfaces/IKlubRewardVault.sol";
import {IERC20, KlubERC20} from "./libraries/KlubERC20.sol";
import {KlubSignature} from "./libraries/KlubSignature.sol";

/// @title KlubCheckInRegistry
/// @notice RSVP with a token deposit, approval, three check-in methods that
/// burn part of the deposit, check-out, and settlement of every deposit
/// according to the refund policy the organizer locked at creation.
contract KlubCheckInRegistry {
    using KlubERC20 for IERC20;

    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint64 public constant KIOSK_WINDOW = 30; // seconds per rotating QR code

    IKlubEventFactory public immutable factory;
    IKlubRewardVault public vault;
    address public admin;

    struct Guest {
        KlubTypes.GuestStatus status;
        bool invited;
        uint128 deposit; // still held for this guest
        uint64 checkInTime;
        uint64 checkOutTime;
        uint128 refundable; // withdrawable by the guest
        uint256 weight; // minutes (ByTime) or 1 (Equal), set at check-out/settle
    }

    struct EventState {
        uint32 activeCount; // approved + pending, i.e. holding a seat
        uint32 waitlistHead;
        uint32 checkedIn;
        uint32 checkedOut;
        uint128 heldDeposits; // deposits not yet settled
        uint256 totalWeight;
        bool settled;
        address kioskKey;
        address codeAddress;
        uint64 codeStart;
        uint64 codeEnd;
    }

    mapping(uint256 => EventState) private _state;
    mapping(uint256 => mapping(address => Guest)) private _guests;
    mapping(uint256 => mapping(address => bool)) public isStaff;
    mapping(uint256 => address[]) private _waitlist;
    mapping(uint256 => address[]) private _rsvps;

    event Rsvp(uint256 indexed eventId, address indexed guest, KlubTypes.GuestStatus status, uint256 deposit);
    event RsvpCancelled(uint256 indexed eventId, address indexed guest, KlubTypes.Destination destination);
    event Approved(uint256 indexed eventId, address indexed guest);
    event Rejected(uint256 indexed eventId, address indexed guest);
    event Invited(uint256 indexed eventId, address indexed guest);
    event Promoted(uint256 indexed eventId, address indexed guest);
    event CheckedIn(uint256 indexed eventId, address indexed guest, uint64 at, uint256 burned, uint8 method);
    event CheckedOut(uint256 indexed eventId, address indexed guest, uint64 at, uint256 weight);
    event Settled(uint256 indexed eventId, uint256 totalWeight, uint256 forfeited);
    event DepositWithdrawn(uint256 indexed eventId, address indexed guest, uint256 amount);
    event StaffUpdated(uint256 indexed eventId, address indexed staff, bool enabled);
    event KioskKeyUpdated(uint256 indexed eventId, address kioskKey);
    event CodeUpdated(uint256 indexed eventId, address codeAddress, uint64 start, uint64 end);
    event VaultUpdated(address vault);

    error NotAdmin();
    error NotOrganizer();
    error NotStaff();
    error UnknownEvent();
    error AlreadyRsvped();
    error NoRsvp();
    error NotApproved();
    error EventFull();
    error TooLate();
    error TooEarly();
    error OutsideEventWindow();
    error AlreadyCheckedIn();
    error NotCheckedIn();
    error AlreadyCheckedOut();
    error MethodDisabled();
    error BadWindow();
    error BadSigner();
    error AlreadySettled();
    error NotSettled();
    error NothingToWithdraw();
    error CodeClosed();

    constructor(IKlubEventFactory factory_, address admin_) {
        factory = factory_;
        admin = admin_;
    }

    function setVault(IKlubRewardVault vault_) external {
        if (msg.sender != admin) revert NotAdmin();
        vault = vault_;
        emit VaultUpdated(address(vault_));
    }

    // --- organizer setup ---------------------------------------------------

    function setStaff(uint256 eventId, address staff, bool enabled) external {
        _onlyOrganizer(eventId);
        isStaff[eventId][staff] = enabled;
        emit StaffUpdated(eventId, staff, enabled);
    }

    /// @notice Address of the ephemeral key held by the venue kiosk screen.
    function setKioskKey(uint256 eventId, address kioskKey) external {
        _onlyOrganizer(eventId);
        _state[eventId].kioskKey = kioskKey;
        emit KioskKeyUpdated(eventId, kioskKey);
    }

    function revokeKioskKey(uint256 eventId) external {
        _onlyOrganizer(eventId);
        _state[eventId].kioskKey = address(0);
        emit KioskKeyUpdated(eventId, address(0));
    }

    /// @notice Only the address derived from the secret code is stored, so the
    /// code itself never appears on chain.
    function setCodeAddress(uint256 eventId, address codeAddress, uint64 start, uint64 end) external {
        _onlyOrganizer(eventId);
        EventState storage s = _state[eventId];
        s.codeAddress = codeAddress;
        s.codeStart = start;
        s.codeEnd = end;
        emit CodeUpdated(eventId, codeAddress, start, end);
    }

    function invite(uint256 eventId, address[] calldata guests) external {
        _onlyOrganizer(eventId);
        for (uint256 i; i < guests.length; ++i) {
            _guests[eventId][guests[i]].invited = true;
            emit Invited(eventId, guests[i]);
        }
    }

    function approve(uint256 eventId, address[] calldata guests) external {
        _onlyOrganizer(eventId);
        for (uint256 i; i < guests.length; ++i) {
            Guest storage g = _guests[eventId][guests[i]];
            if (g.status != KlubTypes.GuestStatus.Pending) continue;
            g.status = KlubTypes.GuestStatus.Approved;
            emit Approved(eventId, guests[i]);
        }
    }

    function reject(uint256 eventId, address[] calldata guests) external {
        KlubTypes.EventConfig memory e = _config(eventId);
        if (msg.sender != e.organizer) revert NotOrganizer();
        EventState storage s = _state[eventId];
        for (uint256 i; i < guests.length; ++i) {
            Guest storage g = _guests[eventId][guests[i]];
            if (g.status != KlubTypes.GuestStatus.Pending && g.status != KlubTypes.GuestStatus.Approved) continue;
            g.status = KlubTypes.GuestStatus.Rejected;
            s.activeCount -= 1;
            _release(eventId, e, guests[i], g, e.policy.rejected);
            emit Rejected(eventId, guests[i]);
            _promote(eventId, e, s);
        }
    }

    // --- guest -------------------------------------------------------------

    /// @notice RSVP and deposit minHolding in the event token. Invited guests
    /// skip approval but still deposit.
    function rsvp(uint256 eventId) external {
        KlubTypes.EventConfig memory e = _config(eventId);
        if (block.timestamp >= e.endTime) revert TooLate();
        EventState storage s = _state[eventId];
        Guest storage g = _guests[eventId][msg.sender];
        if (g.status != KlubTypes.GuestStatus.None) revert AlreadyRsvped();

        if (e.minHolding > 0) {
            IERC20(e.token).pullExact(msg.sender, e.minHolding);
            g.deposit = e.minHolding;
            s.heldDeposits += e.minHolding;
        }

        bool full = e.capacity != 0 && s.activeCount >= e.capacity;
        if (full) {
            g.status = KlubTypes.GuestStatus.Waitlisted;
            _waitlist[eventId].push(msg.sender);
        } else {
            g.status = (e.requireApproval && !g.invited)
                ? KlubTypes.GuestStatus.Pending
                : KlubTypes.GuestStatus.Approved;
            s.activeCount += 1;
        }
        _rsvps[eventId].push(msg.sender);
        emit Rsvp(eventId, msg.sender, g.status, e.minHolding);
    }

    function cancelRsvp(uint256 eventId) external {
        KlubTypes.EventConfig memory e = _config(eventId);
        if (block.timestamp >= e.startTime) revert TooLate();
        EventState storage s = _state[eventId];
        Guest storage g = _guests[eventId][msg.sender];
        bool active = g.status == KlubTypes.GuestStatus.Pending || g.status == KlubTypes.GuestStatus.Approved;
        if (!active && g.status != KlubTypes.GuestStatus.Waitlisted) revert NoRsvp();

        KlubTypes.Destination dest = block.timestamp <= e.policy.refundCutoff
            ? e.policy.cancelBefore
            : e.policy.cancelAfter;

        g.status = KlubTypes.GuestStatus.Cancelled;
        if (active) s.activeCount -= 1;
        _release(eventId, e, msg.sender, g, dest);
        emit RsvpCancelled(eventId, msg.sender, dest);
        if (active) _promote(eventId, e, s);
    }

    function withdrawDeposit(uint256 eventId) external {
        Guest storage g = _guests[eventId][msg.sender];
        uint128 amount = g.refundable;
        if (amount == 0) revert NothingToWithdraw();
        g.refundable = 0;
        IERC20(factory.tokenOf(eventId)).pushExact(msg.sender, amount);
        emit DepositWithdrawn(eventId, msg.sender, amount);
    }

    // --- check-in ----------------------------------------------------------

    function checkIn(uint256 eventId, address guest) external {
        KlubTypes.EventConfig memory e = _config(eventId);
        _requireStaff(eventId, e);
        if (e.methods & KlubTypes.METHOD_STAFF == 0) revert MethodDisabled();
        _checkIn(eventId, e, guest, KlubTypes.METHOD_STAFF);
    }

    function checkInBatch(uint256 eventId, address[] calldata guests) external {
        KlubTypes.EventConfig memory e = _config(eventId);
        _requireStaff(eventId, e);
        if (e.methods & KlubTypes.METHOD_STAFF == 0) revert MethodDisabled();
        for (uint256 i; i < guests.length; ++i) {
            _checkIn(eventId, e, guests[i], KlubTypes.METHOD_STAFF);
        }
    }

    /// @notice The kiosk screen signs (eventId, inbound, windowId) with its
    /// registered key; the guest submits that signature.
    function checkInWithKiosk(uint256 eventId, uint64 windowId, bytes calldata signature) external {
        KlubTypes.EventConfig memory e = _config(eventId);
        if (e.methods & KlubTypes.METHOD_KIOSK == 0) revert MethodDisabled();
        _verifyKiosk(eventId, windowId, true, signature);
        _checkIn(eventId, e, msg.sender, KlubTypes.METHOD_KIOSK);
    }

    /// @notice The guest signs their own address with the key derived from the
    /// secret code, so a pending transaction cannot be reused by anyone else.
    function checkInWithCode(uint256 eventId, bytes calldata signature) external {
        KlubTypes.EventConfig memory e = _config(eventId);
        if (e.methods & KlubTypes.METHOD_CODE == 0) revert MethodDisabled();
        EventState storage s = _state[eventId];
        if (s.codeAddress == address(0)) revert CodeClosed();
        if (block.timestamp < s.codeStart || block.timestamp > s.codeEnd) revert CodeClosed();
        bytes32 digest = keccak256(abi.encode(block.chainid, address(this), "KLUB_CODE", eventId, msg.sender));
        if (KlubSignature.recoverSigner(digest, signature) != s.codeAddress) revert BadSigner();
        _checkIn(eventId, e, msg.sender, KlubTypes.METHOD_CODE);
    }

    function checkOut(uint256 eventId, address guest) external {
        KlubTypes.EventConfig memory e = _config(eventId);
        _requireStaff(eventId, e);
        _checkOut(eventId, e, guest);
    }

    function checkOutBatch(uint256 eventId, address[] calldata guests) external {
        KlubTypes.EventConfig memory e = _config(eventId);
        _requireStaff(eventId, e);
        for (uint256 i; i < guests.length; ++i) {
            _checkOut(eventId, e, guests[i]);
        }
    }

    function checkOutWithKiosk(uint256 eventId, uint64 windowId, bytes calldata signature) external {
        KlubTypes.EventConfig memory e = _config(eventId);
        if (e.methods & KlubTypes.METHOD_KIOSK == 0) revert MethodDisabled();
        _verifyKiosk(eventId, windowId, false, signature);
        _checkOut(eventId, e, msg.sender);
    }

    function _checkIn(uint256 eventId, KlubTypes.EventConfig memory e, address guest, uint8 method) private {
        if (block.timestamp < e.startTime || block.timestamp > e.endTime) revert OutsideEventWindow();
        EventState storage s = _state[eventId];
        if (s.settled) revert AlreadySettled();
        Guest storage g = _guests[eventId][guest];
        if (g.checkInTime != 0) revert AlreadyCheckedIn();
        if (g.status != KlubTypes.GuestStatus.Approved) revert NotApproved();

        uint256 burned;
        if (e.burnAmount > 0) {
            burned = e.burnAmount;
            g.deposit -= e.burnAmount;
            s.heldDeposits -= e.burnAmount;
            IERC20(e.token).push(BURN_ADDRESS, e.burnAmount);
        }
        g.checkInTime = uint64(block.timestamp);
        s.checkedIn += 1;

        // the part of the deposit that is not burned follows the policy now
        _release(eventId, e, guest, g, e.policy.remainder);

        if (e.rewardMode == KlubTypes.RewardMode.Equal) {
            g.weight = 1;
            s.totalWeight += 1;
        }
        emit CheckedIn(eventId, guest, uint64(block.timestamp), burned, method);
    }

    function _checkOut(uint256 eventId, KlubTypes.EventConfig memory e, address guest) private {
        EventState storage s = _state[eventId];
        if (s.settled) revert AlreadySettled();
        Guest storage g = _guests[eventId][guest];
        if (g.checkInTime == 0) revert NotCheckedIn();
        if (g.checkOutTime != 0) revert AlreadyCheckedOut();

        uint64 at = uint64(block.timestamp);
        g.checkOutTime = at;
        s.checkedOut += 1;

        uint256 weight;
        if (e.rewardMode == KlubTypes.RewardMode.ByTime) {
            uint64 from = g.checkInTime < e.startTime ? e.startTime : g.checkInTime;
            uint64 to = at > e.endTime ? e.endTime : at;
            uint256 minutesAtEvent = to > from ? (to - from) / 60 : 0;
            weight = minutesAtEvent > e.minCreditMinutes ? minutesAtEvent : e.minCreditMinutes;
            g.weight = weight;
            s.totalWeight += weight;
        } else {
            weight = g.weight;
        }
        emit CheckedOut(eventId, guest, at, weight);
    }

    function _verifyKiosk(uint256 eventId, uint64 windowId, bool inbound, bytes calldata signature) private view {
        EventState storage s = _state[eventId];
        if (s.kioskKey == address(0)) revert BadSigner();
        uint64 current = uint64(block.timestamp) / KIOSK_WINDOW;
        // accept the current window and the previous one, for slow transactions
        if (windowId != current && windowId + 1 != current) revert BadWindow();
        bytes32 digest =
            keccak256(abi.encode(block.chainid, address(this), "KLUB_KIOSK", eventId, inbound, windowId));
        if (KlubSignature.recoverSigner(digest, signature) != s.kioskKey) revert BadSigner();
    }

    // --- settlement --------------------------------------------------------

    /// @notice After the event ends: add the minimum credit of guests who never
    /// checked out, and send every remaining deposit to its destination. The
    /// no-show total is handled in one transfer, so gas does not grow with the
    /// number of guests.
    function settle(uint256 eventId) public {
        KlubTypes.EventConfig memory e = _config(eventId);
        if (block.timestamp <= e.endTime) revert TooEarly();
        EventState storage s = _state[eventId];
        if (s.settled) revert AlreadySettled();
        s.settled = true;

        if (e.rewardMode == KlubTypes.RewardMode.ByTime) {
            uint256 noCheckout = uint256(s.checkedIn) - uint256(s.checkedOut);
            s.totalWeight += noCheckout * e.minCreditMinutes;
        }

        uint128 forfeited = s.heldDeposits; // only no-shows are still held here
        if (forfeited > 0) {
            s.heldDeposits = 0;
            if (e.policy.noShow == KlubTypes.Destination.Burn) {
                IERC20(e.token).push(BURN_ADDRESS, forfeited);
            } else if (e.policy.noShow == KlubTypes.Destination.RewardPool) {
                IERC20(e.token).push(address(vault), forfeited);
                vault.notifyTokenDeposit(eventId, forfeited);
            }
            // Refund: nothing to move, guests withdraw from their own balance
        }
        emit Settled(eventId, s.totalWeight, forfeited);
    }

    /// @notice Guests who never checked in take their refund from here when the
    /// no-show destination is Refund.
    function claimNoShowRefund(uint256 eventId) external {
        KlubTypes.EventConfig memory e = _config(eventId);
        EventState storage s = _state[eventId];
        if (!s.settled) revert NotSettled();
        if (e.policy.noShow != KlubTypes.Destination.Refund) revert NothingToWithdraw();
        Guest storage g = _guests[eventId][msg.sender];
        if (g.checkInTime != 0 || g.deposit == 0) revert NothingToWithdraw();
        uint128 amount = g.deposit;
        g.deposit = 0;
        g.refundable += amount;
    }

    // --- internals ---------------------------------------------------------

    function _release(
        uint256 eventId,
        KlubTypes.EventConfig memory e,
        address guest,
        Guest storage g,
        KlubTypes.Destination dest
    ) private {
        uint128 amount = g.deposit;
        if (amount == 0) return;
        g.deposit = 0;
        EventState storage s = _state[eventId];
        s.heldDeposits -= amount;

        if (dest == KlubTypes.Destination.Refund) {
            g.refundable += amount;
        } else if (dest == KlubTypes.Destination.Burn) {
            IERC20(e.token).push(BURN_ADDRESS, amount);
        } else {
            IERC20(e.token).push(address(vault), amount);
            vault.notifyTokenDeposit(eventId, amount);
        }
        guest; // referenced for clarity in events emitted by callers
    }

    function _promote(uint256 eventId, KlubTypes.EventConfig memory e, EventState storage s) private {
        if (e.capacity == 0) return;
        address[] storage queue = _waitlist[eventId];
        while (s.activeCount < e.capacity && s.waitlistHead < queue.length) {
            address next = queue[s.waitlistHead++];
            Guest storage g = _guests[eventId][next];
            if (g.status != KlubTypes.GuestStatus.Waitlisted) continue;
            g.status = (e.requireApproval && !g.invited)
                ? KlubTypes.GuestStatus.Pending
                : KlubTypes.GuestStatus.Approved;
            s.activeCount += 1;
            emit Promoted(eventId, next);
        }
    }

    function _config(uint256 eventId) private view returns (KlubTypes.EventConfig memory e) {
        e = factory.getEvent(eventId);
        if (e.organizer == address(0)) revert UnknownEvent();
    }

    function _onlyOrganizer(uint256 eventId) private view {
        if (msg.sender != factory.organizerOf(eventId)) revert NotOrganizer();
    }

    function _requireStaff(uint256 eventId, KlubTypes.EventConfig memory e) private view {
        if (msg.sender != e.organizer && !isStaff[eventId][msg.sender]) revert NotStaff();
    }

    // --- views -------------------------------------------------------------

    function guestOf(uint256 eventId, address guest) external view returns (Guest memory) {
        return _guests[eventId][guest];
    }

    function stateOf(uint256 eventId) external view returns (EventState memory) {
        return _state[eventId];
    }

    function checkedInCount(uint256 eventId) external view returns (uint256) {
        return _state[eventId].checkedIn;
    }

    function checkedOutCount(uint256 eventId) external view returns (uint256) {
        return _state[eventId].checkedOut;
    }

    function checkInTime(uint256 eventId, address guest) external view returns (uint64) {
        return _guests[eventId][guest].checkInTime;
    }

    function checkOutTime(uint256 eventId, address guest) external view returns (uint64) {
        return _guests[eventId][guest].checkOutTime;
    }

    function totalWeight(uint256 eventId) external view returns (uint256) {
        return _state[eventId].totalWeight;
    }

    function guestWeight(uint256 eventId, address guest) external view returns (uint256) {
        Guest storage g = _guests[eventId][guest];
        if (g.checkInTime == 0) return 0;
        if (g.weight != 0) return g.weight;
        // checked in, never checked out: minimum credit applies
        return factory.getEvent(eventId).minCreditMinutes;
    }

    function settled(uint256 eventId) external view returns (bool) {
        return _state[eventId].settled;
    }

    function rsvpCount(uint256 eventId) external view returns (uint256) {
        return _rsvps[eventId].length;
    }

    function rsvpAt(uint256 eventId, uint256 offset, uint256 limit) external view returns (address[] memory page) {
        address[] storage all = _rsvps[eventId];
        if (offset >= all.length) return new address[](0);
        uint256 end = offset + limit;
        if (end > all.length) end = all.length;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            page[i - offset] = all[i];
        }
    }

    function waitlistLength(uint256 eventId) external view returns (uint256) {
        return _waitlist[eventId].length - _state[eventId].waitlistHead;
    }
}
