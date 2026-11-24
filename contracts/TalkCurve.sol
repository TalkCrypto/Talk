// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IERC20C {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/**
 * @title TalkCurve
 * @notice Primary distribution of $TALK along a linear bonding curve, priced in ETH.
 *
 *  - The price of the token rises linearly with the amount already sold:
 *        p(s) = p0 + (p1 - p0) * s / S
 *    where S is the supply offered on the curve.
 *  - Buying costs the integral of that price between the old and the new position:
 *        cost(a,b) = p0*(b-a) + (p1-p0)*(b^2 - a^2) / (2S)
 *  - Selling walks the same curve backwards, so the contract always holds exactly the reserve
 *    that backs the outstanding supply. It cannot be drained: there is no withdraw.
 *  - A 1% fee is taken on every buy and sell and forwarded to the treasury immediately.
 *
 *  Everything is integers: amounts are token wei (18 decimals), prices are wei per whole token.
 *  The inverse (how many tokens a given ETH amount buys) is solved with a bounded binary search
 *  instead of a quadratic formula, which keeps the rounding conservative and the code auditable.
 */
contract TalkCurve {
    /* ------------------------------------------------------------------ config */

    IERC20C public immutable token;
    address public immutable treasury;

    /// @notice Supply offered on the curve, in token wei.
    uint256 public immutable supply;

    /// @notice Price at s = 0, in wei per whole token (1e18 token wei).
    uint256 public immutable priceStart;
    /// @notice Price at s = supply, in wei per whole token.
    uint256 public immutable priceEnd;

    uint256 public constant FEE_BPS = 100;          // 1%
    uint256 public constant BPS = 10_000;
    uint256 public constant WAD = 1e18;

    /// @notice Upper bound so the integral can never overflow uint256.
    uint256 public constant MAX_SUPPLY = 1e30;
    uint256 public constant MAX_PRICE = 1e18;       // 1 ETH per token

    /* ------------------------------------------------------------------- state */

    /// @notice Tokens sold so far (in token wei). The curve position.
    uint256 public sold;
    /// @notice ETH paid into the curve, net of nothing (gross). Informational.
    uint256 public raised;

    bool private locked;
    modifier nonReentrant() {
        if (locked) revert Reentrancy();
        locked = true;
        _;
        locked = false;
    }

    /* ------------------------------------------------------------------ events */

    event Buy(address indexed who, uint256 tokensOut, uint256 cost, uint256 fee, uint256 sold_);
    event Sell(address indexed who, uint256 tokensIn, uint256 refund, uint256 fee, uint256 sold_);

    /* ------------------------------------------------------------------ errors */

    error ZeroAddress();
    error ZeroAmount();
    error BadConfig();
    error SoldOut();
    error NotEnough(uint256 available, uint256 requested);
    error TooLittle(uint256 got, uint256 min);
    error Reentrancy();
    error TransferFailed();

    constructor(address token_, address treasury_, uint256 supply_, uint256 priceStart_, uint256 priceEnd_) {
        if (token_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (supply_ == 0 || supply_ > MAX_SUPPLY) revert BadConfig();
        if (priceStart_ == 0 || priceStart_ > MAX_PRICE) revert BadConfig();
        if (priceEnd_ < priceStart_ || priceEnd_ > MAX_PRICE) revert BadConfig();

        token = IERC20C(token_);
        treasury = treasury_;
        supply = supply_;
        priceStart = priceStart_;
        priceEnd = priceEnd_;
    }

    /* -------------------------------------------------------------------- math */

    /// @notice Spot price at a given curve position.
    function priceAt(uint256 s) public view returns (uint256) {
        if (s > supply) s = supply;
        return priceStart + ((priceEnd - priceStart) * s) / supply;
    }

    /// @notice Cost in wei to move the curve from `a` to `b`.
    function cost(uint256 a, uint256 b) public view returns (uint256) {
        if (b <= a) return 0;
        uint256 linear = priceStart * (b - a);
        uint256 quadratic = ((priceEnd - priceStart) * (b * b - a * a)) / (2 * supply);
        return (linear + quadratic) / WAD;
    }

    /// @notice ETH actually needed to buy the whole remaining supply.
    function remainingCost() external view returns (uint256) {
        return cost(sold, supply);
    }

    /// @notice What the buyer actually pays for a move from `a` to `b`, fee included.
    function costWithFee(uint256 a, uint256 b) public view returns (uint256) {
        uint256 c = cost(a, b);
        return c + (c * FEE_BPS) / BPS;
    }

    /// @notice How many tokens a gross budget of `budget` wei buys right now, fee included.
    function tokensFor(uint256 budget) public view returns (uint256) {
        uint256 remaining = supply - sold;
        if (remaining == 0 || budget == 0) return 0;
        if (budget >= costWithFee(sold, supply)) return remaining;

        uint256 lo = 0;
        uint256 hi = remaining;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            if (costWithFee(sold, sold + mid) <= budget) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    }

    /* ------------------------------------------------------------------- views */

    /// @notice What a buy of `ethIn` wei would return right now.
    function quoteBuy(uint256 ethIn) external view returns (uint256 tokensOut, uint256 cost_, uint256 fee) {
        tokensOut = tokensFor(ethIn);
        if (tokensOut == 0) return (0, 0, 0);
        cost_ = cost(sold, sold + tokensOut);
        fee = costWithFee(sold, sold + tokensOut) - cost_;
    }

    /// @notice What selling `amount` token wei would return right now.
    function quoteSell(uint256 amount) external view returns (uint256 ethOut, uint256 gross, uint256 fee) {
        if (amount == 0 || amount > sold) return (0, 0, 0);
        gross = cost(sold - amount, sold);
        fee = (gross * FEE_BPS) / BPS;
        ethOut = gross - fee;
    }

    /* ---------------------------------------------------------------- buy / sell */

    /**
     * @notice Buy tokens along the curve. Send ETH, receive $TALK.
     * @param minOut Minimum tokens accepted (slippage guard).
     */
    function buy(uint256 minOut) external payable nonReentrant returns (uint256 tokensOut) {
        if (msg.value == 0) revert ZeroAmount();

        uint256 remaining = supply - sold;
        if (remaining == 0) revert SoldOut();

        uint256 allIn = costWithFee(sold, supply);
        if (msg.value >= allIn) {
            tokensOut = remaining;      // sweep the rest of the curve
        } else {
            tokensOut = tokensFor(msg.value);
        }
        if (tokensOut == 0) revert ZeroAmount();
        if (tokensOut < minOut) revert TooLittle(tokensOut, minOut);

        uint256 paid = cost(sold, sold + tokensOut);
        uint256 fee = costWithFee(sold, sold + tokensOut) - paid;
        uint256 total = paid + fee;

        sold += tokensOut;
        raised += paid;

        _send(token, msg.sender, tokensOut);

        // whatever wasn't spent goes straight back, including the sweep surplus
        if (msg.value > total) _sendEth(msg.sender, msg.value - total);
        if (fee > 0) _sendEth(treasury, fee);

        emit Buy(msg.sender, tokensOut, paid, fee, sold);
    }

    /**
     * @notice Sell tokens back into the curve. Requires an ERC-20 approval.
     * @param amount Token wei to sell.
     * @param minOut Minimum ETH accepted (slippage guard).
     */
    function sell(uint256 amount, uint256 minOut) external nonReentrant returns (uint256 ethOut) {
        if (amount == 0) revert ZeroAmount();
        if (amount > sold) revert NotEnough(sold, amount);

        uint256 gross = cost(sold - amount, sold);
        if (gross == 0) revert ZeroAmount();

        uint256 fee = (gross * FEE_BPS) / BPS;
        ethOut = gross - fee;
        if (ethOut < minOut) revert TooLittle(ethOut, minOut);

        sold -= amount;

        _sendFrom(token, msg.sender, amount);

        if (fee > 0) _sendEth(treasury, fee);
        _sendEth(msg.sender, ethOut);

        emit Sell(msg.sender, amount, ethOut, fee, sold);
    }

    /* ----------------------------------------------------------------- internal */

    function _send(IERC20C t, address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(t).call(
            abi.encodeWithSelector(IERC20C.transfer.selector, to, amount)
        );
        if (!ok || (data.length > 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _sendFrom(IERC20C t, address from, uint256 amount) private {
        (bool ok, bytes memory data) = address(t).call(
            abi.encodeWithSelector(IERC20C.transferFrom.selector, from, address(this), amount)
        );
        if (!ok || (data.length > 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _sendEth(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
