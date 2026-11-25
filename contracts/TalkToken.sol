// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title TalkToken
 * @notice $TALK — fixed supply ERC-20 with EIP-2612 permit.
 *
 *  The permit is what makes paying for a message a single action: the wallet signs an approval
 *  off-chain and the inbox pulls the tokens in the same transaction, so the sender never has to
 *  send an "approve" transaction first.
 */
contract TalkToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public nonces;

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();
    error Expired();
    error BadSignature();

    constructor(string memory name_, string memory symbol_, uint256 supply_, address to_) {
        if (to_ == address(0)) revert ZeroAddress();
        name = name_;
        symbol = symbol_;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name_)),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );

        totalSupply = supply_;
        balanceOf[to_] = supply_;
        emit Transfer(address(0), to_, supply_);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - amount;
        }
        _move(from, to, amount);
        return true;
    }

    /// @notice Approve by signature: one off-chain signature instead of a transaction.
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        if (block.timestamp > deadline) revert Expired();

        // reject the malleable half of the curve, so one signature cannot become two
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadSignature();

        uint256 nonce = nonces[owner];
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonce, deadline))
            )
        );

        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0) || signer != owner) revert BadSignature();

        // only now the nonce is spent: a forged signature can no longer burn it
        nonces[owner] = nonce + 1;
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    /// @notice Burn your own tokens. Supply only ever goes down.
    function burn(uint256 amount) external {
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    function _move(address from, address to, uint256 amount) private {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
