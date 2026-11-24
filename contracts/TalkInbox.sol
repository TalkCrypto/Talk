// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/**
 * @title TalkInbox
 * @notice Paid mail/chat between wallets, charged in a single token ($TALK).
 *
 *  - Each wallet activates its inbox with an encryption public key and a price.
 *  - Writing to someone who charges leaves the payment in escrow inside the contract.
 *  - If they reply within 72h, the payment splits per their rule (refund / keep / 50-50).
 *  - If they don't reply, anyone can refund the sender (100%).
 *  - After the first reply they are contacts, and writing is free from then on.
 *  - Talk fee: 5% of what the recipient keeps. Nothing on refunds or free messages.
 *
 *  Message text is encrypted by the client (NaCl box): this contract only stores
 *  opaque bytes and can never read them.
 */
contract TalkInbox {
    enum Rule { Refund, Keep, Split }
    enum Status { None, Pending, Settled, Refunded }

    struct Inbox {
        bool registered;
        bool open;      // true = anyone writes for free
        Rule rule;      // what happens to the payment on reply
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

    IERC20 public immutable token;
    address public immutable treasury;

    uint256 public constant TTL = 72 hours;
    uint256 public constant FEE_BPS = 500;      // 5%
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_CIPHERTEXT = 4096;

    uint256 public nextId = 1;
    uint256 public messageCount;

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

    event InboxSet(address indexed owner, bool open, uint8 rule, bytes32 encKey);
    event PriceSet(address indexed owner, uint256 price);
    event Message(uint256 indexed id, address indexed from, address indexed to, uint256 paymentId, bytes ciphertext);
    event MessagePaid(uint256 indexed paymentId, address indexed from, address indexed to, uint256 amount, uint64 expiresAt);
    event Settled(uint256 indexed paymentId, uint256 toRecipient, uint256 toSender, uint256 fee);
    event Refunded(uint256 indexed paymentId, uint256 amount);

    error ZeroAddress();
    error NotRegistered();
    error SelfMessage();
    error InvalidRule();
    error EmptyKey();
    error TooLong();
    error NotPending();
    error NotRecipient();
    error Expired();
    error NotExpired();
    error TransferFailed();
    error WrongPayment(uint256 required, uint256 received);
    error Reentrancy();

    constructor(address token_, address treasury_) {
        if (token_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        treasury = treasury_;
    }

    /* ------------------------------------------------------------------ */
    /*                              config                                 */
    /* ------------------------------------------------------------------ */

    function configure(bool open, uint8 rule, bytes32 encKey, uint256 price) external {
        if (rule > uint8(Rule.Split)) revert InvalidRule();
        if (encKey == bytes32(0)) revert EmptyKey();

        Inbox storage box = inboxes[msg.sender];
        box.registered = true;
        box.open = open;
        box.rule = Rule(rule);
        box.encKey = encKey;

        emit InboxSet(msg.sender, open, rule, encKey);

        if (box.price != price) {
            box.price = price;
            emit PriceSet(msg.sender, price);
        }
    }

    function setPrice(uint256 price) external {
        if (!inboxes[msg.sender].registered) revert NotRegistered();
        inboxes[msg.sender].price = price;
        emit PriceSet(msg.sender, price);
    }

    /* ------------------------------------------------------------------ */
    /*                               send                                  */
    /* ------------------------------------------------------------------ */

    /// @notice Sends an encrypted message to `to`. Charges per the recipient's inbox.
    /// @return paymentId 0 when free, otherwise the id of the escrowed payment.
    function send(address to, bytes calldata ciphertext) external nonReentrant returns (uint256 paymentId) {
        if (to == msg.sender) revert SelfMessage();
        if (!inboxes[to].registered) revert NotRegistered();
        if (ciphertext.length > MAX_CIPHERTEXT) revert TooLong();

        uint256 price = quote(msg.sender, to);

        if (price > 0) {
            _pullExact(msg.sender, price);
            paymentId = nextId++;
            payments[paymentId] = Payment({
                from: msg.sender,
                to: to,
                amount: price,
                expiresAt: uint64(block.timestamp + TTL),
                status: Status.Pending
            });
            emit MessagePaid(paymentId, msg.sender, to, price, uint64(block.timestamp + TTL));
        }

        unchecked { ++messageCount; }
        emit Message(messageCount, msg.sender, to, paymentId, ciphertext);
    }

    /* ------------------------------------------------------------------ */
    /*                              reply                                  */
    /* ------------------------------------------------------------------ */

    /// @notice Replies to a pending payment and settles it. Recipient only, before expiry.
    function reply(uint256 paymentId, bytes calldata ciphertext) external nonReentrant {
        if (ciphertext.length > MAX_CIPHERTEXT) revert TooLong();

        Payment storage p = payments[paymentId];
        if (p.status != Status.Pending) revert NotPending();
        if (p.to != msg.sender) revert NotRecipient();
        if (block.timestamp > p.expiresAt) revert Expired();

        p.status = Status.Settled;

        // the replier's rule
        Rule rule = inboxes[p.to].rule;
        uint256 amount = p.amount;
        uint256 toRecipient;
        uint256 toSender;
        uint256 fee;

        if (rule == Rule.Refund) {
            toSender = amount;
        } else if (rule == Rule.Keep) {
            fee = (amount * FEE_BPS) / BPS;
            toRecipient = amount - fee;
        } else {
            toSender = amount / 2;
            uint256 rest = amount - toSender;
            fee = (rest * FEE_BPS) / BPS;
            toRecipient = rest - fee;
        }

        if (toSender > 0) _push(p.from, toSender);
        if (toRecipient > 0) _push(p.to, toRecipient);
        if (fee > 0) _push(treasury, fee);

        // they become contacts: writing between them is free from now on
        isContact[p.from][p.to] = true;
        isContact[p.to][p.from] = true;

        emit Settled(paymentId, toRecipient, toSender, fee);

        unchecked { ++messageCount; }
        emit Message(messageCount, msg.sender, p.from, paymentId, ciphertext);
    }

    /* ------------------------------------------------------------------ */
    /*                             refund                                  */
    /* ------------------------------------------------------------------ */

    /// @notice Returns 100% to the sender if the deadline passed with no reply.
    function refund(uint256 paymentId) external nonReentrant {
        Payment storage p = payments[paymentId];
        if (p.status != Status.Pending) revert NotPending();
        if (block.timestamp <= p.expiresAt) revert NotExpired();

        p.status = Status.Refunded;
        _push(p.from, p.amount);

        emit Refunded(paymentId, p.amount);
    }

    /* ------------------------------------------------------------------ */
    /*                               views                                 */
    /* ------------------------------------------------------------------ */

    /// @notice What it costs to write from `from` to `to` (0 = free).
    function quote(address from, address to) public view returns (uint256) {
        Inbox storage box = inboxes[to];
        if (!box.registered) return 0;
        if (box.open) return 0;
        if (isContact[from][to] || isContact[to][from]) return 0;
        return box.price;
    }

    /// @notice Pending payments past their deadline that can be refunded.
    function isExpired(uint256 paymentId) external view returns (bool) {
        Payment storage p = payments[paymentId];
        return p.status == Status.Pending && block.timestamp > p.expiresAt;
    }

    /* ------------------------------------------------------------------ */
    /*                            internal                                 */
    /* ------------------------------------------------------------------ */

    /// @dev Pulls exactly `amount` into the contract and verifies it arrived (fee-on-transfer safety).
    function _pullExact(address from, uint256 amount) private {
        uint256 before = token.balanceOf(address(this));
        _safeCall(address(token), abi.encodeCall(IERC20.transferFrom, (from, address(this), amount)));
        uint256 afterBal = token.balanceOf(address(this));
        if (afterBal < before || afterBal - before != amount) {
            revert WrongPayment(amount, afterBal > before ? afterBal - before : 0);
        }
    }

    function _push(address to, uint256 amount) private {
        _safeCall(address(token), abi.encodeCall(IERC20.transfer, (to, amount)));
    }

    /// @dev Accepts tokens that return bool or return nothing at all (USDT-like).
    function _safeCall(address target, bytes memory data) private {
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) revert TransferFailed();
        if (ret.length > 0 && !abi.decode(ret, (bool))) revert TransferFailed();
    }
}
