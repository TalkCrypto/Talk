// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IERC20T {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/**
 * @title TalkInbox
 * @notice Paid messaging between wallets, charged in one token ($TALK).
 *
 *  One price, two outcomes:
 *
 *   - They reply within 72h -> the recipient keeps the price minus 5%, Talk takes 5%.
 *   - Nobody replies        -> the sender gets 90% back, Talk keeps 10%.
 *
 *  The 10% forfeit is what makes the price a filter instead of a deposit: if every unanswered
 *  message came back in full, sending would be free and an inbox would be flooded.
 *
 *  Message text is encrypted by the client (NaCl box). This contract only stores opaque bytes.
 */
contract TalkInbox {
    enum Status { None, Pending, Settled, Refunded }

    struct Inbox {
        bool registered;
        bool open;      // true = anyone writes for free
        bytes32 encKey; // owner's X25519 public key
        uint256 price;  // price for strangers, in $TALK (wei)
    }

    struct Payment {
        address from;
        address to;
        uint256 amount;
        uint64 expiresAt;
        Status status;
    }

    IERC20T public immutable token;
    address public immutable treasury;

    uint256 public constant TTL = 72 hours;
    uint256 public constant FEE_BPS = 500;      // 5% of the price when the recipient replies
    uint256 public constant FORFEIT_BPS = 1000; // 10% kept by Talk when nobody replies
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_CIPHERTEXT = 4096;

    uint256 public nextId = 1;
    uint256 public messageCount;   // monotonic message id, independent of payments

    mapping(address => Inbox) public inboxes;
    mapping(uint256 => Payment) public payments;
    mapping(address => mapping(address => bool)) public isContact;

    bool private locked;
    modifier nonReentrant() {
        if (locked) revert Reentrancy();
        locked = true;
        _;
        locked = false;
    }

    event InboxSet(address indexed owner, bool open, bytes32 encKey);
    event PriceSet(address indexed owner, uint256 price);
    event Message(uint256 indexed id, address indexed from, address indexed to, uint256 paymentId, bytes ciphertext);
    event MessagePaid(uint256 indexed paymentId, address indexed from, address indexed to, uint256 amount, uint64 expiresAt);
    event Settled(uint256 indexed paymentId, uint256 toRecipient, uint256 toTalk);
    event Returned(uint256 indexed paymentId, uint256 toSender, uint256 toTalk);

    error ZeroAddress();
    error NotRegistered();
    error AlreadyRegistered();
    error SelfMessage();
    error NotPending();
    error Expired();
    error NotExpired();
    error NotRecipient();
    error BadPrice();
    error TooLong();
    error WrongPayment();
    error PriceAboveLimit(uint256 price, uint256 maxPrice);
    error TransferFailed();
    error Reentrancy();

    constructor(address token_, address treasury_) {
        if (token_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        token = IERC20T(token_);
        treasury = treasury_;
    }

    /* ------------------------------------------------------------------ config */

    /// @notice Open or close the inbox, publish the encryption key and set the price.
    function configure(bool open, bytes32 encKey, uint256 price) external {
        if (encKey == bytes32(0)) revert BadPrice();
        Inbox storage box = inboxes[msg.sender];
        box.registered = true;
        box.open = open;
        box.encKey = encKey;
        box.price = price;
        emit InboxSet(msg.sender, open, encKey);
        emit PriceSet(msg.sender, price);
    }

    function setPrice(uint256 price) external {
        if (!inboxes[msg.sender].registered) revert NotRegistered();
        inboxes[msg.sender].price = price;
        emit PriceSet(msg.sender, price);
    }

    /* -------------------------------------------------------------------- send */

    /**
     * @notice Send an encrypted message to `to`. `maxPrice` is the most the sender is willing
     *         to pay: if the recipient raised their price, the call reverts instead of overcharging.
     * @return paymentId 0 when the message was free, otherwise the id of the held payment.
     */
    function send(address to, uint256 maxPrice, bytes calldata ciphertext) external nonReentrant returns (uint256 paymentId) {
        if (to == msg.sender) revert SelfMessage();
        if (ciphertext.length > MAX_CIPHERTEXT) revert TooLong();
        if (!inboxes[to].registered) revert NotRegistered();

        uint256 price = quote(msg.sender, to);
        if (price > maxPrice) revert PriceAboveLimit(price, maxPrice);

        if (price == 0) {
            emit Message(++messageCount, msg.sender, to, 0, ciphertext);
            return 0;
        }

        _pullExact(msg.sender, price);
        paymentId = nextId++;
        payments[paymentId] = Payment({
            from: msg.sender,
            to: to,
            amount: price,
            expiresAt: uint64(block.timestamp + TTL),
            status: Status.Pending
        });

        emit Message(++messageCount, msg.sender, to, paymentId, ciphertext);
        emit MessagePaid(paymentId, msg.sender, to, price, uint64(block.timestamp + TTL));
    }

    /* ------------------------------------------------------------------- reply */

    /// @notice Reply to a held payment: 95% to you, 5% to Talk. Recipient only, before expiry.
    function reply(uint256 paymentId, bytes calldata ciphertext) external nonReentrant {
        if (ciphertext.length > MAX_CIPHERTEXT) revert TooLong();

        Payment storage p = payments[paymentId];
        if (p.status != Status.Pending) revert NotPending();
        if (p.to != msg.sender) revert NotRecipient();
        if (block.timestamp >= p.expiresAt) revert Expired();

        p.status = Status.Settled;

        uint256 fee = (p.amount * FEE_BPS) / BPS;
        uint256 toRecipient = p.amount - fee;

        _sendToken(msg.sender, toRecipient);
        if (fee > 0) _sendToken(treasury, fee);

        // both directions become contacts: writing between them is free from now on
        isContact[msg.sender][p.from] = true;
        isContact[p.from][msg.sender] = true;

        emit Message(++messageCount, msg.sender, p.from, paymentId, ciphertext);
        emit Settled(paymentId, toRecipient, fee);
    }

    /* ------------------------------------------------------------------ refund */

    /// @notice After expiry anyone can settle it: 90% to the sender, 10% to Talk.
    function refund(uint256 paymentId) external nonReentrant {
        Payment storage p = payments[paymentId];
        if (p.status != Status.Pending) revert NotPending();
        if (block.timestamp < p.expiresAt) revert NotExpired();

        p.status = Status.Refunded;

        uint256 forfeit = (p.amount * FORFEIT_BPS) / BPS;
        uint256 toSender = p.amount - forfeit;

        _sendToken(p.from, toSender);
        if (forfeit > 0) _sendToken(treasury, forfeit);

        emit Returned(paymentId, toSender, forfeit);
    }

    /* ------------------------------------------------------------------- views */

    /// @notice What it costs to write from `from` to `to` (0 = free).
    function quote(address from, address to) public view returns (uint256) {
        if (from == to) return 0;
        Inbox storage box = inboxes[to];
        if (!box.registered) return 0;
        if (box.open) return 0;
        if (isContact[to][from]) return 0;
        return box.price;
    }

    function isExpired(uint256 paymentId) external view returns (bool) {
        Payment storage p = payments[paymentId];
        return p.status == Status.Pending && block.timestamp >= p.expiresAt;
    }

    /// @notice Pending payments past their deadline that anyone can settle.
    function refundable(uint256 paymentId) external view returns (bool) {
        Payment storage p = payments[paymentId];
        return p.status == Status.Pending && block.timestamp >= p.expiresAt;
    }

    /* ---------------------------------------------------------------- internal */

    /// @dev Pulls exactly `amount` and checks it arrived (fee-on-transfer safety).
    function _pullExact(address from, uint256 amount) private {
        uint256 before = token.balanceOf(address(this));
        _call(address(token), abi.encodeWithSelector(IERC20T.transferFrom.selector, from, address(this), amount));
        if (token.balanceOf(address(this)) - before != amount) revert WrongPayment();
    }

    function _sendToken(address to, uint256 amount) private {
        _call(address(token), abi.encodeWithSelector(IERC20T.transfer.selector, to, amount));
    }

    /// @dev Accepts tokens that return bool and tokens that return nothing (USDT-like).
    function _call(address target, bytes memory data) private {
        (bool ok, bytes memory res) = target.call(data);
        if (!ok || (res.length > 0 && !abi.decode(res, (bool)))) revert TransferFailed();
    }
}
