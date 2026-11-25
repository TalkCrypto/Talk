/* ============================================================================
   Talk — curve page: live quote, buy and sell against TalkCurve
   ========================================================================== */
(function () {
  "use strict";

  const CFG = window.TALK_CONFIG || {};
  const CHAIN = Object.assign({
    id: 4663, name: "Robinhood Chain", rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com", nativeSymbol: "ETH"
  }, CFG.chain || {});

  const LS = {
    curve: () => localStorage.getItem("talk:cfg:curve") || CFG.curve || "",
    token: () => localStorage.getItem("talk:cfg:token") || CFG.token || ""
  };

  const SEL = {
    sold: "0x02c7e7af", supply: "0x047fc9aa", priceAt: "0x9dab2054",
    quoteBuy: "0x4beb394c", quoteSell: "0xa64190c4", buy: "0xd96a094a",
    sell: "0xd79875eb", token: "0xfc0c546a", remaining: "0x3a0f08b2", fee: "0xbf333f2c",
    raised: "0xf0ea4bfc"
  };
  const ERC20 = {
    approve: "0x095ea7b3", allowance: "0xdd62ed3e", balanceOf: "0x70a08231", decimals: "0x313ce567"
  };

  const $ = id => document.getElementById(id);
  const log = (m, k = "") => { const el = $("log"); el.className = k; el.textContent = m || ""; };

  const u256 = v => BigInt(v).toString(16).padStart(64, "0");
  const strip0x = h => String(h || "").replace(/^0x/i, "");
  const asAddr = a => strip0x(a).padStart(64, "0");
  const word = (hex, i) => BigInt("0x" + (strip0x(hex).slice(i * 64, i * 64 + 64) || "0"));
  const fmtEth = w => (Number(w) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 6 });
  const fmtTok = w => (Number(w) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 });

  let account = null, rpcId = 1, tab = "buy", curve = "", token = "", supply = 0n, feeBps = 100n;

  async function rpc(method, params) {
    const r = await fetch(CHAIN.rpc, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params })
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  }

  const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
  const callBig = async (to, data) => BigInt(await call(to, data) || "0x0");

  async function ensureChain() {
    const cur = await ethereum.request({ method: "eth_chainId" });
    if (parseInt(cur, 16) === CHAIN.id) return;
    const hex = "0x" + CHAIN.id.toString(16);
    try { await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
    catch (e) {
      if (e.code === 4902) {
        await ethereum.request({ method: "wallet_addEthereumChain", params: [{
          chainId: hex, chainName: CHAIN.name,
          nativeCurrency: { name: CHAIN.nativeSymbol, symbol: CHAIN.nativeSymbol, decimals: 18 },
          rpcUrls: [CHAIN.rpc], blockExplorerUrls: [CHAIN.explorer]
        }]});
      } else throw e;
    }
  }

  async function waitTx(hash) {
    for (let i = 0; i < 200; i++) {
      const r = await rpc("eth_getTransactionReceipt", [hash]);
      if (r) {
        if (r.status !== "0x1") throw new Error("the transaction reverted");
        return r;
      }
      await new Promise(z => setTimeout(z, 1200));
    }
    throw new Error("timed out waiting for confirmation");
  }

  /* ------------------------------------------------------------ read state */
  async function loadStats() {
    if (!curve) { $("status").textContent = "not configured"; return; }
    try {
      supply = await callBig(curve, SEL.supply);
      feeBps = await callBig(curve, SEL.fee);
      const sold = await callBig(curve, SEL.sold);
      const price = await callBig(curve, SEL.priceAt + u256(sold));

      $("price").textContent = fmtEth(price);
      $("raised").textContent = fmtEth(await callBig(curve, SEL.raised)) + " ETH";
      $("left").textContent = fmtTok(supply - sold) + " TALK";
      $("soldLbl").textContent = fmtTok(sold) + " sold";
      const pct = supply > 0n ? Number((sold * 10000n) / supply) / 100 : 0;
      $("pctLbl").textContent = pct.toFixed(2) + "%";
      $("progressBar").style.width = Math.min(100, pct) + "%";
      $("status").textContent = sold >= supply ? "sold out" : "live";

      if (account) {
        $("myTok").textContent = fmtTok(await callBig(token, ERC20.balanceOf + asAddr(account))) + " TALK";
        $("myEth").textContent = fmtEth(await rpc("eth_getBalance", [account, "latest"])) + " ETH";
      }
    } catch (e) {
      $("status").textContent = "read error";
      log("Could not read the curve: " + e.message, "err");
    }
  }

  /* -------------------------------------------------------------- quoting */
  let quoteTimer = null;
  function onInput() {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(quote, 250);
  }

  async function quote() {
    const raw = ($("amountIn").value || "").trim();
    if (!curve || !raw || isNaN(Number(raw))) { $("amountOut").textContent = "—"; return; }

    try {
      if (tab === "buy") {
        const wei = BigInt(Math.round(Number(raw) * 1e6)) * 10n ** 12n;
        const res = await call(curve, SEL.quoteBuy + u256(wei));
        const out = word(res, 0), cost = word(res, 1), fee = word(res, 2);
        $("amountOut").textContent = fmtTok(out) + " TALK";
        $("feeOut").textContent = fmtEth(fee) + " ETH";
        $("slipOut").textContent = fmtTok((out * BigInt(99)) / 100n) + " min";
      } else {
        const tok = BigInt(Math.round(Number(raw) * 1e6)) * 10n ** 12n;
        const res = await call(curve, SEL.quoteSell + u256(tok));
        const out = word(res, 0), gross = word(res, 1), fee = word(res, 2);
        $("amountOut").textContent = fmtEth(out) + " ETH";
        $("feeOut").textContent = fmtEth(fee) + " ETH";
        $("slipOut").textContent = fmtEth((out * BigInt(99)) / 100n) + " min";
      }
    } catch (e) {
      $("amountOut").textContent = "—";
    }
  }

  /* ------------------------------------------------------------- actions */
  async function buy() {
    const wei = BigInt(Math.round(Number($("amountIn").value) * 1e6)) * 10n ** 12n;
    const res = await call(curve, SEL.quoteBuy + u256(wei));
    const out = word(res, 0);
    const minOut = (out * BigInt(99)) / 100n;

    log("Confirm the buy in your wallet…");
    const hash = await ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: account, to: curve, value: "0x" + wei.toString(16), data: SEL.buy + u256(minOut) }]
    });
    await waitTx(hash);
    log("Bought " + fmtTok(out) + " TALK", "ok");
    await loadStats(); $("amountIn").value = ""; $("amountOut").textContent = "—";
  }

  async function sell() {
    const tok = BigInt(Math.round(Number($("amountIn").value) * 1e6)) * 10n ** 12n;
    const res = await call(curve, SEL.quoteSell + u256(tok));
    const out = word(res, 0);
    const minOut = (out * BigInt(99)) / 100n;

    const allow = await callBig(token, ERC20.allowance + asAddr(account) + asAddr(curve));
    if (allow < tok) {
      log("Approving the curve first…");
      const h1 = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: token, data: ERC20.approve + asAddr(curve) + u256(tok) }]
      });
      await waitTx(h1);
    }

    log("Confirm the sell in your wallet…");
    const hash = await ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: account, to: curve, data: SEL.sell + u256(tok) + u256(minOut) }]
    });
    await waitTx(hash);
    log("Sold for " + fmtEth(out) + " ETH", "ok");
    await loadStats(); $("amountIn").value = ""; $("amountOut").textContent = "—";
  }

  async function connect() {
    if (!window.ethereum) { log("No wallet in this browser.", "err"); return; }
    try {
      await ensureChain();
      const [acc] = await ethereum.request({ method: "eth_requestAccounts" });
      account = acc;
      $("addr").innerHTML = "<b>" + acc.slice(0, 6) + "…" + acc.slice(-4) + "</b>";
      $("btnConnect").textContent = "Connected";
      $("btnAction").disabled = !curve;
      $("btnAction").textContent = tab === "buy" ? "Buy $TALK" : "Sell $TALK";
      await loadStats();
    } catch (e) { log("Error: " + e.message, "err"); }
  }

  /* ---------------------------------------------------------------- boot */
  function setTab(next) {
    tab = next;
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
    $("inLbl").textContent = tab === "buy" ? "You send" : "You sell";
    $("inUnit").textContent = tab === "buy" ? "ETH" : "TALK";
    $("outLbl").textContent = tab === "buy" ? "You get" : "You receive";
    $("amountIn").value = "";
    $("amountOut").textContent = "—";
    $("feeOut").textContent = "—";
    if (account && curve) $("btnAction").textContent = tab === "buy" ? "Buy $TALK" : "Sell $TALK";
  }

  async function boot() {
    curve = LS.curve();
    token = LS.token();

    $("btnConnect").onclick = connect;
    $("amountIn").addEventListener("input", onInput);
    document.querySelectorAll(".tab").forEach(b => b.onclick = () => setTab(b.dataset.tab));

    $("btnAction").onclick = async () => {
      if (!account) return connect();
      const v = Number($("amountIn").value);
      if (!v || v <= 0) { log("Enter an amount first.", "err"); return; }
      try {
        $("btnAction").disabled = true;
        await (tab === "buy" ? buy() : sell());
      } catch (e) {
        log("Error: " + (e.message || e), "err");
      } finally {
        $("btnAction").disabled = false;
      }
    };

    if (!curve) {
      $("status").textContent = "not configured";
      $("curveAddr").textContent = "curve not configured";
      log("No curve address yet — deploy one and add it to config.js.", "err");
      return;
    }

    $("curveAddr").textContent = curve.slice(0, 6) + "…" + curve.slice(-4);
    setTab("buy");
    await loadStats();
    setInterval(loadStats, 15000);

    if (window.ethereum) {
      ethereum.on?.("accountsChanged", () => location.reload());
      ethereum.on?.("chainChanged", () => location.reload());
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
