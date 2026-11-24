// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title MohallaPools
/// @notice All-or-nothing group-buying escrow for neighbourhood merchants.
///         - If a pool reaches its target quantity before the deadline it becomes Funded,
///           and each merchant's money is released to the supplier only when that merchant
///           confirms delivery.
///         - If the target isn't reached, everyone is refunded in full.
///         - Commits and deliveries need the merchant's EIP-712 signature, so the operator
///           (Paytm) can relay them and pay gas, but can't move a merchant's money on its own.
contract MohallaPools is AccessControl, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant COMMIT_TYPEHASH = keccak256("Commit(bytes32 poolId,uint32 qty,uint256 nonce)");
    bytes32 public constant DELIVERY_TYPEHASH = keccak256("Delivery(bytes32 poolId,uint256 nonce)");
    uint16 public constant MAX_FEE_BPS = 500; // 5%

    enum Status {
        None,
        Open,
        Funded,
        Failed
    }

    struct Pool {
        address supplier;
        uint128 unitPrice; // paise per case
        uint32 targetQty; // cases
        uint32 committedQty;
        uint64 deadline;
        uint64 deliveryDeadline;
        Status status;
    }

    struct Member {
        uint32 qty;
        bool settled; // paid to supplier or refunded
    }

    IERC20 public immutable token;
    address public treasury;
    uint16 public feeBps;

    mapping(bytes32 => Pool) public pools;
    mapping(bytes32 => mapping(address => Member)) public members;
    mapping(address => uint256) public nonces;

    event PoolCreated(bytes32 indexed id, address indexed supplier, uint128 unitPrice, uint32 targetQty, uint64 deadline, uint64 deliveryDeadline);
    event Committed(bytes32 indexed id, address indexed merchant, uint32 qty, uint256 amount);
    event PoolFunded(bytes32 indexed id);
    event PoolFailed(bytes32 indexed id);
    event Delivered(bytes32 indexed id, address indexed merchant, uint256 toSupplier, uint256 fee);
    event Refunded(bytes32 indexed id, address indexed merchant, uint256 amount);
    event FeeUpdated(address treasury, uint16 feeBps);

    error PoolExists();
    error BadParams();
    error NotOpen();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error ExceedsTarget();
    error AlreadyCommitted();
    error BadSignature();
    error NotFunded();
    error NotMember();
    error AlreadySettled();
    error NotRefundable();

    constructor(IERC20 token_, address admin, address operator, address treasury_, uint16 feeBps_)
        EIP712("MohallaPools", "1")
    {
        if (address(token_) == address(0) || treasury_ == address(0) || feeBps_ > MAX_FEE_BPS) revert BadParams();
        token = token_;
        treasury = treasury_;
        feeBps = feeBps_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
    }

    // ---------------------------------------------------------------- admin

    function setFee(address treasury_, uint16 feeBps_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasury_ == address(0) || feeBps_ > MAX_FEE_BPS) revert BadParams();
        treasury = treasury_;
        feeBps = feeBps_;
        emit FeeUpdated(treasury_, feeBps_);
    }

    function createPool(
        bytes32 id,
        address supplier,
        uint128 unitPrice,
        uint32 targetQty,
        uint64 deadline,
        uint64 deliveryDeadline
    ) external onlyRole(OPERATOR_ROLE) {
        if (pools[id].status != Status.None) revert PoolExists();
        if (
            supplier == address(0) || unitPrice == 0 || targetQty == 0 || deadline <= block.timestamp
                || deliveryDeadline <= deadline
        ) revert BadParams();
        pools[id] = Pool(supplier, unitPrice, targetQty, 0, deadline, deliveryDeadline, Status.Open);
        emit PoolCreated(id, supplier, unitPrice, targetQty, deadline, deliveryDeadline);
    }

    // ---------------------------------------------------------------- merchants (relayed)

    /// @notice Lock `qty` cases worth of tINR from `merchant` into pool `id`.
    ///         Anyone may relay; the merchant's signature authorises it.
    function commitFor(bytes32 id, address merchant, uint32 qty, bytes calldata sig) external nonReentrant {
        Pool storage p = pools[id];
        if (p.status != Status.Open) revert NotOpen();
        if (block.timestamp > p.deadline) revert DeadlinePassed();
        if (qty == 0 || p.committedQty + qty > p.targetQty) revert ExceedsTarget();
        if (members[id][merchant].qty != 0) revert AlreadyCommitted();

        uint256 nonce = nonces[merchant]++;
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(COMMIT_TYPEHASH, id, qty, nonce)));
        if (!SignatureChecker.isValidSignatureNow(merchant, digest, sig)) revert BadSignature();

        uint256 amount = uint256(qty) * p.unitPrice;
        members[id][merchant] = Member(qty, false);
        p.committedQty += qty;
        token.safeTransferFrom(merchant, address(this), amount);
        emit Committed(id, merchant, qty, amount);

        if (p.committedQty == p.targetQty) {
            p.status = Status.Funded;
            emit PoolFunded(id);
        }
    }

    /// @notice Mark an unfilled pool as failed once its deadline has passed. Anyone may call.
    function markFailed(bytes32 id) external {
        Pool storage p = pools[id];
        if (p.status != Status.Open) revert NotOpen();
        if (block.timestamp <= p.deadline) revert DeadlineNotPassed();
        p.status = Status.Failed;
        emit PoolFailed(id);
    }

    /// @notice Refund a merchant: always possible for a Failed pool; for a Funded pool only
    ///         after the delivery deadline if that merchant never confirmed delivery. Anyone may call;
    ///         money always goes back to the merchant.
    function refund(bytes32 id, address merchant) external nonReentrant {
        Pool storage p = pools[id];
        Member storage m = members[id][merchant];
        if (m.qty == 0) revert NotMember();
        if (m.settled) revert AlreadySettled();
        bool ok = p.status == Status.Failed || (p.status == Status.Funded && block.timestamp > p.deliveryDeadline);
        if (!ok) revert NotRefundable();

        m.settled = true;
        uint256 amount = uint256(m.qty) * p.unitPrice;
        token.safeTransfer(merchant, amount);
        emit Refunded(id, merchant, amount);
    }

    /// @notice Release a merchant's share to the supplier after the merchant confirms delivery.
    function confirmDelivery(bytes32 id, address merchant, bytes calldata sig) external nonReentrant {
        Pool storage p = pools[id];
        if (p.status != Status.Funded) revert NotFunded();
        Member storage m = members[id][merchant];
        if (m.qty == 0) revert NotMember();
        if (m.settled) revert AlreadySettled();

        uint256 nonce = nonces[merchant]++;
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(DELIVERY_TYPEHASH, id, nonce)));
        if (!SignatureChecker.isValidSignatureNow(merchant, digest, sig)) revert BadSignature();

        m.settled = true;
        uint256 amount = uint256(m.qty) * p.unitPrice;
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 toSupplier = amount - fee;
        token.safeTransfer(p.supplier, toSupplier);
        if (fee > 0) token.safeTransfer(treasury, fee);
        emit Delivered(id, merchant, toSupplier, fee);
    }

    // ---------------------------------------------------------------- views

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getPool(bytes32 id) external view returns (Pool memory) {
        return pools[id];
    }
}
