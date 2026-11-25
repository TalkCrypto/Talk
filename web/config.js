// Talk — deployment config.
// deploy.html and the "Deployment settings" panel override these via localStorage.
window.TALK_CONFIG = {
  chain: {
    id: 4663,
    name: "Robinhood Chain",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    nativeSymbol: "ETH"
  },

  // Deployment addresses (empty until you deploy).
  token: "0x3476AFfa0f73aED50dc8bA0645965f992656f176",      // $TALK (ERC-20)
  inbox: "0x09CbF9B06881630b681eCca7Df7fD54A0D45F80a",
  inboxAbi: 1,   // 1 = deployed send(address,bytes) · 2 = send(address,uint256,bytes) with maxPrice      // TalkInbox
  curve: "",      // TalkCurve (primary sale) — TALK lanza por Pons, sin curva propia
  fromBlock: 122633004,   // block where TalkInbox was deployed

  symbol: "TALK",
  decimals: 18,

  // Protocol parameters (informational: the real ones live in the contract).
  feeBps: 500,
  ttlHours: 72,

  /* Banner social links. Paste your URLs: empty ones render dimmed and
     unclickable. Optional xHandle to show "@youruser". */
  socials: {
    x: "https://x.com/Talkwhitall",
    xHandle: "@Talkwhitall",
    github: "https://github.com/TalkCrypto/Talk",
    discord: "",
    site: "",
    label: "web"
  }
};
