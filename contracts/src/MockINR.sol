// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title MockINR (tINR)
/// @notice Test rupee token for the Mohalla demo. 1 tINR = ₹1, 2 decimals (amounts are in paise).
///         In production the rupees sit in a regulated escrow bank account; this token only mirrors them.
contract MockINR is ERC20, ERC20Permit, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address admin) ERC20("Mohalla Test Rupee", "tINR") ERC20Permit("Mohalla Test Rupee") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function decimals() public pure override returns (uint8) {
        return 2;
    }

    function mint(address to, uint256 amountPaise) external onlyRole(MINTER_ROLE) {
        _mint(to, amountPaise);
    }
}
