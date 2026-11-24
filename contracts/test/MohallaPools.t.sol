// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockINR} from "../src/MockINR.sol";
import {MohallaPools} from "../src/MohallaPools.sol";

contract MohallaPoolsTest is Test {
    MockINR token;
    MohallaPools pools;

    address admin = address(0xA11CE);
    address operator = address(0x0909);
    address treasury = address(0x7EA5);
    address supplier = address(0x5099);

    uint256 constant PK1 = 0x1111;
    uint256 constant PK2 = 0x2222;
    uint256 constant PK3 = 0x3333;
    address m1;
    address m2;
    address m3;

    bytes32 constant ID = keccak256("pool-1");
    uint128 constant PRICE = 150_000; // ₹1,500.00 per case in paise
    uint16 constant FEE = 100; // 1%

    function setUp() public {
        m1 = vm.addr(PK1);
        m2 = vm.addr(PK2);
        m3 = vm.addr(PK3);
        token = new MockINR(admin);
        pools = new MohallaPools(token, admin, operator, treasury, FEE);

        address[3] memory ms = [m1, m2, m3];
        for (uint256 i; i < 3; i++) {
            vm.prank(admin);
            token.mint(ms[i], 10_000_000); // ₹1,00,000
            vm.prank(ms[i]);
            token.approve(address(pools), type(uint256).max);
        }

        vm.prank(operator);
        pools.createPool(ID, supplier, PRICE, 10, uint64(block.timestamp + 1 hours), uint64(block.timestamp + 2 days));
    }

    // ---------------------------------------------------------------- helpers

    function _commitSig(uint256 pk, bytes32 id, uint32 qty, uint256 nonce) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(pools.COMMIT_TYPEHASH(), id, qty, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", pools.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _deliverySig(uint256 pk, bytes32 id, uint256 nonce) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(pools.DELIVERY_TYPEHASH(), id, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", pools.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _commit(uint256 pk, address m, uint32 qty) internal {
        pools.commitFor(ID, m, qty, _commitSig(pk, ID, qty, pools.nonces(m)));
    }

    function _fillPool() internal {
        _commit(PK1, m1, 4);
        _commit(PK2, m2, 3);
        _commit(PK3, m3, 3);
    }

    // ---------------------------------------------------------------- tests

    function test_HappyPath_FundAndDeliver() public {
        _fillPool();
        assertEq(uint8(pools.getPool(ID).status), uint8(MohallaPools.Status.Funded));
        assertEq(token.balanceOf(address(pools)), 10 * uint256(PRICE));

        pools.confirmDelivery(ID, m1, _deliverySig(PK1, ID, pools.nonces(m1)));

        uint256 amount = 4 * uint256(PRICE);
        uint256 fee = amount * FEE / 10_000;
        assertEq(token.balanceOf(supplier), amount - fee);
        assertEq(token.balanceOf(treasury), fee);
        assertEq(token.balanceOf(address(pools)), 6 * uint256(PRICE));
    }

    function test_AllDeliveries_NoPaiseLost() public {
        _fillPool();
        pools.confirmDelivery(ID, m1, _deliverySig(PK1, ID, pools.nonces(m1)));
        pools.confirmDelivery(ID, m2, _deliverySig(PK2, ID, pools.nonces(m2)));
        pools.confirmDelivery(ID, m3, _deliverySig(PK3, ID, pools.nonces(m3)));
        assertEq(token.balanceOf(address(pools)), 0);
        assertEq(token.balanceOf(supplier) + token.balanceOf(treasury), 10 * uint256(PRICE));
    }

    function test_FailedPool_RefundsEveryone() public {
        _commit(PK1, m1, 4);
        _commit(PK2, m2, 3);
        uint256 before1 = token.balanceOf(m1);

        vm.expectRevert(MohallaPools.DeadlineNotPassed.selector);
        pools.markFailed(ID);

        vm.warp(block.timestamp + 1 hours + 1);
        pools.markFailed(ID);
        pools.refund(ID, m1);
        pools.refund(ID, m2);
        assertEq(token.balanceOf(m1), before1 + 4 * uint256(PRICE));
        assertEq(token.balanceOf(address(pools)), 0);

        vm.expectRevert(MohallaPools.AlreadySettled.selector);
        pools.refund(ID, m1);
    }

    function test_UndeliveredRefund_OnlyAfterDeliveryDeadline() public {
        _fillPool();
        pools.confirmDelivery(ID, m1, _deliverySig(PK1, ID, pools.nonces(m1)));

        vm.expectRevert(MohallaPools.NotRefundable.selector);
        pools.refund(ID, m2);

        vm.warp(block.timestamp + 2 days + 1);
        pools.refund(ID, m2);
        assertEq(token.balanceOf(m2), 10_000_000);

        // already delivered member can't be refunded
        vm.expectRevert(MohallaPools.AlreadySettled.selector);
        pools.refund(ID, m1);
    }

    function test_RevertWhen_BadSignature() public {
        bytes memory sig = _commitSig(PK2, ID, 4, pools.nonces(m1)); // signed by the wrong key
        vm.expectRevert(MohallaPools.BadSignature.selector);
        pools.commitFor(ID, m1, 4, sig);
    }

    function test_RevertWhen_SignatureReplayedOnAnotherPool() public {
        bytes32 id2 = keccak256("pool-2");
        vm.prank(operator);
        pools.createPool(id2, supplier, PRICE, 10, uint64(block.timestamp + 1 hours), uint64(block.timestamp + 2 days));

        bytes memory sig = _commitSig(PK1, ID, 2, pools.nonces(m1));
        pools.commitFor(ID, m1, 2, sig);
        vm.expectRevert(MohallaPools.BadSignature.selector);
        pools.commitFor(id2, m1, 2, sig);
    }

    function test_RevertWhen_QtyChangedFromSigned() public {
        bytes memory sig = _commitSig(PK1, ID, 1, pools.nonces(m1));
        vm.expectRevert(MohallaPools.BadSignature.selector);
        pools.commitFor(ID, m1, 9, sig);
    }

    function test_RevertWhen_ExceedsTarget() public {
        _commit(PK1, m1, 8);
        bytes memory sig = _commitSig(PK2, ID, 3, pools.nonces(m2));
        vm.expectRevert(MohallaPools.ExceedsTarget.selector);
        pools.commitFor(ID, m2, 3, sig);
    }

    function test_RevertWhen_CommitAfterDeadline() public {
        vm.warp(block.timestamp + 1 hours + 1);
        bytes memory sig = _commitSig(PK1, ID, 2, pools.nonces(m1));
        vm.expectRevert(MohallaPools.DeadlinePassed.selector);
        pools.commitFor(ID, m1, 2, sig);
    }

    function test_RevertWhen_CommitTwice() public {
        _commit(PK1, m1, 2);
        bytes memory sig = _commitSig(PK1, ID, 2, pools.nonces(m1));
        vm.expectRevert(MohallaPools.AlreadyCommitted.selector);
        pools.commitFor(ID, m1, 2, sig);
    }

    function test_RevertWhen_DoubleDelivery() public {
        _fillPool();
        pools.confirmDelivery(ID, m1, _deliverySig(PK1, ID, pools.nonces(m1)));
        bytes memory sig = _deliverySig(PK1, ID, pools.nonces(m1));
        vm.expectRevert(MohallaPools.AlreadySettled.selector);
        pools.confirmDelivery(ID, m1, sig);
    }

    function test_RevertWhen_DeliveryBeforeFunded() public {
        _commit(PK1, m1, 2);
        bytes memory sig = _deliverySig(PK1, ID, pools.nonces(m1));
        vm.expectRevert(MohallaPools.NotFunded.selector);
        pools.confirmDelivery(ID, m1, sig);
    }

    function test_RevertWhen_NonOperatorCreatesPool() public {
        vm.expectRevert();
        pools.createPool(keccak256("x"), supplier, PRICE, 10, uint64(block.timestamp + 1 hours), uint64(block.timestamp + 2 days));
    }

    function test_PermitThenCommit_Gasless() public {
        uint256 pk = 0x4444;
        address m = vm.addr(pk);
        vm.prank(admin);
        token.mint(m, 1_000_000);

        // merchant signs an ERC-2612 permit off-chain; the operator submits it
        bytes32 permitHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                m,
                address(pools),
                type(uint256).max,
                token.nonces(m),
                block.timestamp + 1 days
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), permitHash)));
        vm.prank(operator);
        token.permit(m, address(pools), type(uint256).max, block.timestamp + 1 days, v, r, s);

        vm.prank(operator);
        pools.commitFor(ID, m, 2, _commitSig(pk, ID, 2, pools.nonces(m)));
        assertEq(token.balanceOf(m), 1_000_000 - 2 * uint256(PRICE));
    }

    function testFuzz_FeeMath(uint32 qty, uint128 price) public {
        qty = uint32(bound(qty, 1, 10));
        price = uint128(bound(price, 1, 1e12));
        bytes32 id = keccak256(abi.encode(qty, price));
        vm.prank(operator);
        pools.createPool(id, supplier, price, qty, uint64(block.timestamp + 1 hours), uint64(block.timestamp + 2 days));
        vm.prank(admin);
        token.mint(m1, uint256(qty) * price);
        pools.commitFor(id, m1, qty, _commitSig(PK1, id, qty, pools.nonces(m1)));
        pools.confirmDelivery(id, m1, _deliverySig(PK1, id, pools.nonces(m1)));
        assertEq(token.balanceOf(address(pools)), 0);
    }
}
