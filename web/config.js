// Talk — deployment config.
// deploy.html and the "Deployment settings" panel override these via localStorage.
window.TALK_CONFIG = {
  chain: {
    id: 4663,
    name: "Robinhood Chain",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robin.etherscan.io",
    nativeSymbol: "ETH"
  },

  // Deployment addresses (empty until you deploy).
  token: "",      // $TALK (ERC-20)
  inbox: "",      // TalkInbox
  fromBlock: 0,   // block where TalkInbox was deployed

  symbol: "TALK",
  decimals: 18,

  // Protocol parameters (informational: the real ones live in the contract).
  feeBps: 500,
  ttlHours: 72,

  /* Banner social links. Paste your URLs: empty ones render dimmed and
     unclickable. Optional xHandle to show "@youruser". */
  socials: {
    x: "",
    xHandle: "",
    telegram: "",
    discord: "",
    github: "",
    site: "",
    label: "web"
  }
};
