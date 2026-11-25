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
  token: "0x29a248ebb20570f0730f7f2595b7abf1b9c8f0b2",      // $TALK (ERC-20)
  inbox: "0x94afd1714c018e2d193ae5e83e5265cbeb1020a9",
  inboxAbi: 2,   // 1 = deployed send(address,bytes) · 2 = send(address,uint256,bytes) with maxPrice      // TalkInbox
  curve: "",      // TalkCurve (primary sale) — TALK lanza por Pons, sin curva propia
  fromBlock: 122910582,   // block where TalkInbox was deployed

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
