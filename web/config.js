// Talk — configuración del despliegue.
// Lo puede pisar deploy.html o el panel "Ajustes del despliegue" (localStorage).
window.TALK_CONFIG = {
  chain: {
    id: 4663,
    name: "Robinhood Chain",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robin.etherscan.io",
    nativeSymbol: "ETH"
  },

  // Direcciones del despliegue (vacías hasta que deployes).
  token: "",      // $TALK (ERC-20)
  inbox: "",      // TalkInbox
  fromBlock: 0,   // bloque donde se desplegó TalkInbox

  symbol: "TALK",
  decimals: 18,

  // Parámetros del protocolo (informativos: los reales están en el contrato).
  feeBps: 500,
  ttlHours: 72,

  /* Redes del banner. Pegá tus URLs: las que queden vacías se muestran
     apagadas (sin link). Opcional: xHandle para mostrar "@tuusuario". */
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
