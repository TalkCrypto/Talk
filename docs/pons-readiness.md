# Talk — Pons Readiness

Lo que miran los compradores de Pons antes de entrar a un proyecto serio,
medido contra los que ya crecieron (Delta $2.3M+, Thinking Cat $5.6M, Longbow $2.1M).

---

## Kit del launch — textos listos para copiar/pegar

### Formulario de Pons (día D)

| Campo | Valor |
|---|---|
| Name | `Talk` |
| Symbol | `TALK` |
| Image | logo del dashboard (negro con la T) — exportar 512×512 |
| Launch fee (creator fee) | **3%** — fee wallet dedicada (NUNCA la wallet del deploy) |
| Pair | WETH (o NVDA si se quiere el mismo ángulo que Orbio) |

**Description para Pons:**
> Encrypted messaging between wallets. A stranger pays $TALK to reach you, you reply within
> 72h and keep 95% — or it returns 90% after 72h. No accounts, no backend, no Telegram.
> Your keys derive from your own signature and never leave your device. Fee on trades: 3%
> (1% communication infrastructure, 1% dev & tooling, 1% multichain expansion — Talk goes
> cross-chain after Dec 12) — fixed at launch, on-chain, public.
> Links: website · X · (GitHub after launch)

**Links a pegar en Pons:** website (dominio propio) · X (x.com/Talkwhitall)

### Split del 3% (procedimiento semanal)

1. Los fees caen en la fee wallet dedicada.
2. Una vez por semana: 1/3 → wallet de infra, 1/3 → wallet de dev, 1/3 → wallet de
   expansión multired. Tres transfers on-chain, públicas, desde la misma wallet de origen
   (trazabilidad total).
3. Anotado en el pinned post o en la web: "weekly split, visible on-chain".
4. Cuando el volumen lo justifique: splitter automático verificado.
5. **Hito Dec 12:** actualización multired — hablar en cualquier cadena, no solo Robinhood.
   El 1% de expansión financia exactamente eso.

### Posts de X (día D)

**Post 1 (fijado):**
> Talk is live. Encrypted messaging between wallets: a stranger pays in $TALK to reach you,
> you reply within 72h and keep 95%. No accounts, no backend — everything on-chain.
> Fee on trades: 3% (1% keeps the communication infrastructure running, 1% funds dev &
> tooling, 1% takes Talk cross-chain — after Dec 12, one inbox, every network).
> Token on Pons: ponsfamily.com/launchpad/0x… · App: <dominio>

**Post 2 (producto):**
> Your inbox is a pass. Set your price. Strangers pay to get in. Reply and the payment
> clears — or it returns 90% after 72h. The 10% forfeit is the spam filter.

**Post 3 (confianza):**
> Contracts verified, source public after launch, no mint, no withdraw function, fee split
> fixed at launch. Your keys are derived from your own signature and never leave your device.

**Post 4 (visión):**
> We're building the easy communication channel for crypto chains. One wallet is your
> account. One token is the toll. One signature is your key.

### Runbook día D (orden exacto)

1. [ ] Fee wallet dedicada creada (nueva clave, fondo solo para gas)
2. [ ] Logo 512×512 exportado
3. [ ] Launch en ponsfamily.com (name/symbol/image/description/links/fee 2% + fee wallet)
4. [ ] **Slow cook** (estrategia de arranque elegida — ver abajo)
5. [ ] Redesplegar TalkInbox apuntando al token nuevo de Pons (`deploy-talk.js` con la
       dirección nueva — 2 minutos, gas casi gratis)
6. [ ] Actualizar `web/config.js` (token nuevo + inbox nuevo + fromBlock) y subir al VPS
7. [ ] Post fijado en X con la dirección del token
8. [ ] Poner la URL del dominio propio (DNS ya preparado de antelación)
9. [ ] Pegar links oficiales en la página de Pons
10. [ ] Submit a HoodScan
11. [ ] Semana 1: primer split semanal on-chain + submit a GeckoTerminal / DefiLlama
12. [ ] Mes 1: CoinGecko → CMC → (si el volumen aguanta) CEX

### Slow cook — estrategia de arranque (elegida)

Graduación = 4.2 ETH pareados en el pool (umbral fijo de Pons). El plan:

- **Hora 0:** initial buy ~0.5–1 ETH (dentro del límite anti-snipe de 5.5% por compra).
  Arranca la curva sin disparar el precio contra nosotros.
- **Día 1–2:** X activa; cada inbox activado = comprador con uso real. El creador completa
  de a 0.3–0.5 ETH por tramo solo si el volumen orgánico no avanza.
- **Objetivo:** graduación el día 2–3 (patrón HEPH) con holders reales, no comprados.
- **Regla de oro:** no lanzar sin los 4.2 ETH garantizados. El cook reparte la entrada y
  mejora el precio promedio — no reduce el capital necesario.
- **Por qué sí:** sin audiencia previa (0 followers), la graduación instantánea estilo
  NovaAI deja un pool graduado y muerto. El cook construye el holder base ANTES de
  graduarse — que es lo que sostiene el precio después (Delta 17K, Thinking Cat 95K).
- **Sin quema, sin teatro:** Talk es utilidad — el token vale porque el producto funciona.
  Nada de burns anunciados ni mecánicas deflacionarias. La oferta ya es fija y no mintea;
  eso es todo.

### Cold start (0 followers — la semana del launch)

1. **Ventaja estructural:** único producto de su tipo en la cadena. El estanque es chico
   y los traders de Pons miran la pestaña "New" a diario — el launch se ve solo.
2. **Semana previa:** 3-4 posts en X mostrando el producto andando (inbox, escrow,
   "first paid message"). Cero "comprá". El perfil no puede llegar vacío al día D.
3. **Distribución por respuestas:** con 0 followers, los posts propios no se ven — las
   respuestas sí. Comentar con algo útil en Pons, Delta, Orbio y la cuenta oficial de la
   cadena, todos los días. Es el único canal honesto de alcance inicial.
4. **El producto es el embudo:** cada inbox activado es un comprador natural (necesita
   $TALK para usarlo). El post fijado manda primero a la app, después al token.
5. **La honestidad como diferenciador, dicho explícitamente:** "Fair launch on Pons: no
   presale, no team allocation, the creator buys at the same price as everyone. Fixed 2%
   fee, public weekly split on-chain." Sin humo — el producto habla.
6. **Los primeros del cook son la comunidad:** responder a todos, tratarlos como socios.
   20-50 holders reales valen más que 5,000 bots.

### Checklist de comprador (due diligence típica en Pons)

| # | Qué miran | Estado en Talk | Acción |
|---|-----------|----------------|--------|
| 1 | **Contrato verificado en el explorer** | ✅ Token, Inbox y Curve verificados en blockscout | nada |
| 2 | **Website vivo y serio** | ✅ noxsecurity.tech/talk-7k2m9x — landing + app funcionando, copy honesto | dominio propio ANTES del launch, con sigilo (ver abajo) |
| 3 | **Supply fijo, sin mint** | ✅ 1B fijo, burn permitido, sin mint — igual que los grandes (todos 1B) | nada |
| 4 | **El contrato del token en el launchpad de Pons** | ⏳ el $TALK real se lanza con `PonsLauncherToken` vía ponsfamily.com | ejecutar el launch el día D (ver abajo) |
| 5 | **Cuenta de X activa con post fijado** | ✅ @Talkwhitall (creada, 2 posts) | poner bio + post fijado el día D (borradores abajo) |
| 6 | **Telegram/Discord oficial** | ❌ decisión: sin Telegram (obsoleto). X es el canal — así lo hacen Orbio y Delta | opcional: Discord si el día D hay comunidad; sin él también se crece (Thinking Cat: solo X) |
| 7 | **Links oficiales en la página de Pons** | ⏳ se llenan al momento del launch | website + X |
| 8 | **Documentación pública** | ⚠️ README + docs/ internos, no públicos en la web | servir `/docs` público (ver abajo) |
| 9 | **Auditoría externa** | ⚠️ solo audit.py estático + tests (114 checks). Delta pasó por Sherlock | externa si el TVL crece; hasta ahí, mostrar el código verificado |
| 10 | **Listings** (CoinGecko/CMC/DefiLlama/GeckoTerminal) | ❌ requiere volumen + pair vivo post-launch | pedir después de la semana 1 de trading |
| 11 | **HoodScan** (hoodscan.co — listado de proyectos de la cadena) | ❌ | submit del proyecto post-launch |
| 12 | **Liquidez** | ⏳ el launch de Pons crea el par WETH automático | no se necesita LP manual |

## Dominio propio sin filtrar nada (antes del launch)

Lo que filtra un dominio antes de tiempo:

1. **WHOIS** — registrar en un registrar con privacidad incluida (Cloudflare Registry o
   Namecheap con Domain Privacy activado). Nunca datos reales.
2. **Certificate Transparency** — al pedir un certificado (Let's Encrypt etc.) el dominio
   se publica en logs públicos (crt.sh) y los bots de hunters lo ven al minuto. Mitigación:
   el dominio solo filtra si se sabe que es Talk — elegir un nombre que **no contenga
   "talk"** ni nada del producto. Un dominio neutro en crt.sh no revela nada.
3. **No enlazarlo desde ninguna parte** hasta el día D: ni en la bio de @Talkwhitall, ni
   en Pons, ni en posts. La web puede estar servida y el certificado pedido con semanas de
   antelación — sin enlaces, nadie lo encuentra.
4. **El día D**: apuntar el dominio, actualizar bio de X, launch en Pons con el link,
   post fijado. Todo el tráfico converge a la vez.

## Lo que distinguió a los que crecieron (patrón Delta / Orbio / Thinking Cat)

1. **Producto real y útil desde el día 1** — Delta: gestor de liquidez que se usa. Orbio:
   gateway de IA con precio bajo los modelos ("ChatGPT privado"). Talk ya cumple:
   mensajería cifrada con escrow funcionando on-chain.
2. **El token paga el producto** — Orbio: 1.5% de cada trade se convierte en créditos de
   IA para holders (stake 35.6% del supply, liquidación horaria). Delta: 7.5% fee al
   reclamar fees de LP. El loop compra presión constante. Talk ya tiene el suyo: el token
   es el costo del mensaje (escrow 72h + fee 5%) — el uso demanda $TALK directamente.
3. **Launch Pons + graduación rápida** — Orbio se graduó en 2 horas (pair NVDA, no WETH:
   el pair es elegible). Liquidity locked automática, sin migración.
4. **Equipo anónimo pero producto hablando** — Orbio: solo emails + @orbiodotso. Nadie
   pone caras; la confianza viene del producto verificado y funcionando.
5. **Iteración visible y flywheel** — Delta: 14 versiones en 3 meses. Orbio: agent
   launchpad propio (1,397 agentes lanzados, todos paired con $ORBIO = demanda
   permanente). Para Talk: cada inbox nuevo con precio es demanda de $TALK.
6. **Visibilidad terceros** — DefiLlama adapter, CoinGecko, GeckoTerminal, CEX (LBank en
   el caso Orbio). Todas se piden con volumen post-launch, no antes.

## Proyectos estudiados (para calibrar)

| | HEPH AI | Delta | Orbio | Thinking Cat | NovaAI | Harmonic |
|---|---|---|---|---|---|---|
| Mercado | $77K (5 días) | $2.2M (3 meses) | $11M | $5.6M | **$338.8M** | $703K |
| Holders | 290 | 16,702 | n/d | 94,881 | 15,474 | 3,180 |
| Trades | 3,839 | 269,903 | 106,487 | 250,035 | 79,836 | 112,036 |
| **Creator fee ganado** | **$7.7K en 5 días** | **$77.7K en 3 meses** | 4.3M ORBIO | $56 | **$289.3K** | **$98.8K** |
| Graduación | 3 días | — | 2 horas | — | **instantánea** | 10 horas |
| Producto | DePIN pilotos | Liquidez live | IA live | Memecoin | "Grupo HK de IA" | Agente autónomo |
| Canales | Web + X | Web + X | Web + X | X | X + Telegram | X |

**Lecturas clave para Talk:**

- **El fee 2% paga incluso siendo chico:** HEPH con $90K de volumen diario generó $7.7K
  de creator fees en 5 días. A ese ritmo el split 1%/1% financia infra de sobra.
- **Graduación = volumen sostenido ~3 días** (HEPH) o 2 horas (Orbio, con audiencia previa).
  Lo que manda es el volumen, no el market cap.
- **La mayoría de tokens no llegan a grandes:** 290 holders es lo normal. Delta (17K) y
  Thinking Cat (95K) son la excepción — su diferencia: producto útil o comunidad real,
  no el arte ni el hype.
- **Lo que HEPH hace mejor que la landing de Talk hoy:** el CA del token y el link al
  explorer están en el HERO. El día D hay que añadir el CA al hero de la landing (slot en
  config.js: cuando haya dirección de Pons, una línea visible arriba con copy + explorer).
- **Honestidad como marca:** HEPH dice "PRODUCTION STAGE 1" y "apply for pilot" sin
  esconder que es pre-producto. Talk puede decir algo mejor: producto YA funcionando.
- **La advertencia de Delta: el dominio muerto.** La página de Pons de Delta todavía
  enlaza deltaliquidity.xyz (caído) — migraron a .app y olvidaron actualizar Pons. Cada
  comprador que entra desde Pons se topa con un sitio muerto. Lección: dominio elegido
  para no cambiarlo NUNCA, y actualizar el link en Pons el mismo día de cualquier
  migración. El "About" de Delta en Pons es UNA línea ("Stake, compound & earn from
  liquidity pools") — simple y claro; el fee no se explica ahí sino en su web.
- **NovaAI ($338.8M, el más grande de la cadena):** graduó en el MISMO minuto del launch —
  el arranque se estructura con el initial buy del creador alcanzando el umbral de
  graduación de golpe. Su descripción en Pons es una frase vaga ("Hong Kong Group's
  application in AI") — con ese tamaño, la página de Pons es solo el punto de entrada:
  lo que sostiene el precio es el holder base grande y el volumen constante.
  Creator fee: **$289.3K cobrados**. El techo de lo que el 2% puede llegar a valer.
- **Harmonic Agent ($703K):** el caso del fee-filtro: **$98.8K de creator fees con un
  market cap 300× menor que NovaAI**. Su truco: es un agente autónomo que reclama sus
  propios fees, compra su propio token y lo quema — el flywheel de compra es automático y
  visible. Graduó en 10 horas. Lección para el fee 2% de Talk: no necesitas $300M de cap
  para que el fee sea negocio — necesitas VELOCIDAD de volumen (112K trades con solo
  3,180 holders). Y el "burn de lo que el agente compra" es una mecánica copiable:
  Talk podría quemar un % de los TALK del tesoro cada semana (el contrato de token ya
  tiene burn).

## Nota sobre la curva interna

Se desplegó TalkCurve de prueba (`0x33e6…DEDE`) con 100M TALK dentro, y quedó fuera de la
app (`config.js: curve: ""`). El contrato no tiene withdraw (por diseño), así que esos
100M duermen ahí y no vuelven a circular. No afecta el launch de Pons: el token real será
otro contrato.
