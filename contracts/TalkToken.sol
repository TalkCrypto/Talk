// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title Talk Token ($TALK)
 * @notice Token interno de Talk. ERC-20 de suministro fijo, sin mint posterior.
 *         Se mintea entero al despliegue al destinatario indicado.
 */
contract TalkToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();

    constructor(string memory name_, string memory symbol_, uint256 supply_, address to_) {
        if (to_ == address(0)) revert ZeroAddress();
        name = name_;
        symbol = symbol_;
        totalSupply = supply_;
        balanceOf[to_] = supply_;
        emit Transfer(address(0), to_, supply_);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    /// @notice Quema tokens propios (opcional, no afecta al inbox).
    function burn(uint256 value) external {
        uint256 bal = balanceOf[msg.sender];
        if (bal < value) revert InsufficientBalance();
        unchecked { balanceOf[msg.sender] = bal - value; }
        totalSupply -= value;
        emit Transfer(msg.sender, address(0), value);
    }

    function _transfer(address from, address to, uint256 value) internal {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = balanceOf[from];
        if (bal < value) revert InsufficientBalance();
        unchecked { balanceOf[from] = bal - value; }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
