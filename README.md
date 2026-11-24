# Talk

Mensajes cifrados entre wallets. Se cobra en **$TALK**, tu token interno.
El pago queda en escrow 72 h: si el destinatario responde se libera, si no vuelve entero.

Proyecto autocontenido: contratos propios + web estática. Sin dependencias de terceros,
sin backend, sin base de datos.

---

## Estado

| | |
|---|---|
| Contratos | compilan con `solc 0.8.26` (optimizer 200 runs) |
| Auditoría estática | **30/30** (`tools/audit.py`: selectores, topics, ABI, ids, artefactos) |
| Tests de contrato | **47/47** sobre un nodo EVM local (anvil), con dinero real de prueba |
| Tests de frontend | **37/37** (cripto, ABI, decodificación de eventos) |
| Auditoría externa | **no** — usalo con montos chicos |

Lo que los tests cubren de punta a punta: activar buzón, enviar pagando, liquidar con las
3 reglas, contactos gratis, expiración + reembolso tras 72 h, buzón abierto, y los 8 errores
esperados (auto-mensaje, wallet sin buzón, doble respuesta, reembolso antes de tiempo, etc.).

---

## Cómo funciona

```
desconocido ──paga X TALK──▶ contrato (escrow)
                                 │
                    ┌────────────┴────────────┐
              responde <72h                no responde
                    │                        │
        se reparte según su regla      cualquiera reembolsa
        (devolver / quedar / 50-50)     → vuelve el 100%
                    │
              son contactos: gratis para siempre
```

- **Comisión:** 5 % de lo que se queda el receptor, va a la tesorería. Reembolsos y
  mensajes gratis no pagan nada.
- **Estados del pago:** `1` en escrow · `2` liquidado · `3` reembolsado.
- **Reglas al responder:** `0` devolver todo · `1` quedármelo (menos 5 %) · `2` mitad y mitad.

### Cifrado

Todo pasa en el navegador. El contrato solo guarda bytes opacos.

```
firma   = personal_sign("Talk\n\nSign to unlock…")   // gratis, no es transacción
semilla = SHA-256(bytes de la firma)                  // 32 B
llaves  = nacl.box.keyPair.fromSecretKey(semilla)     // X25519
```

- La pública (32 B) se publica en el contrato como `encKey` al activar el buzón.
- La privada queda en `localStorage` (`talk:enc:<wallet>`), **nunca sale del dispositivo**.
- Por eso la misma wallet abre el mismo buzón en cualquier equipo: la llave sale de la firma.

Sobre del mensaje (va en el evento):

```
[ 0x01 ][ pubkey emisor 32 B ][ nonce 24 B ][ nacl.box (texto + tag 16 B) ]
```

`nacl.box` = X25519 + XSalsa20-Poly1305. El receptor usa el emisor embebido si no es él mismo.

---

## Estructura

```
Talk/
  contracts/
    TalkToken.sol      ERC-20 de suministro fijo (sin mint)
    TalkInbox.sol      buzón + escrow + contactos
    build/             combined.json de solc
  web/
    index.html         dashboard
    app.js             lógica + cripto + asistente
    styles.css         negro/blanco minimalista
    config.js          direcciones y redes sociales
    deploy.html        asistente de despliegue
    artifacts.js       ABI + bytecode generados
    abi/               ABI en JSON
  tools/
    build-artifacts.mjs   solc → artifacts.js
    audit.py              auditoría estática (ABI ↔ selectores ↔ topics ↔ HTML)
    serve-web.mjs         servidor estático (dev)
    test-contract.py      suite end-to-end contra anvil
    test-web.mjs          suite de la lógica del frontend
    setup-local.mjs       siembra estado de prueba en anvil
    solc/solc.exe         compilador
    foundry/anvil.exe     nodo EVM local
```

### Auditoría

`python tools/audit.py` verifica que nada se haya desincronizado:

- cada selector de `app.js` contra `keccak256` de la firma en la ABI compilada;
- los `topic0` de los eventos (`Message`, `Settled`);
- que `web/abi/*.json` y el bytecode de `artifacts.js` sean exactamente lo que produjo solc;
- que cada `id` que el JS busca exista en el HTML, y que no queden referencias al formulario viejo;
- que `deploy.html` guarde las tres claves de configuración y use los artefactos;
- que el contrato no tenga `withdraw`, que use guard de reentrancy y exponga la superficie esperada.

Corre en CI sin red ni nodos: es solo lectura de archivos.

---

## Desplegar

### Opción A — asistente incluido

Serví `web/` y abrí `deploy.html` con tu wallet en **Robinhood Chain**:

1. **Desplegar $TALK** — nombre, símbolo, suministro y destinatario.
2. **Desplegar TalkInbox** — token de pago + tesorería (recibe el 5 %).
3. Las direcciones quedan guardadas en el navegador; el paso 3 te muestra el snippet
   para `web/config.js` y te lleva al dashboard.

Necesitás ETH en la cadena para el gas (dos deploys: ~1.5 M y ~4 M de gas).

### Opción B — Remix / forge

Abrí `contracts/TalkToken.sol` y `contracts/TalkInbox.sol`, compilá con 0.8.26 y desplegá.
Después pegá las direcciones en `web/config.js` (o en el panel *Ajustes del despliegue*).

```js
// web/config.js
token: "0x…",      // $TALK
inbox: "0x…",      // TalkInbox
fromBlock: 122000000
```

`fromBlock` importa: `eth_getLogs` barre desde ahí. Si lo dejás en 0 y la cadena es larga,
el RPC puede rechazar el rango.

### Redes del banner

En `web/config.js`:

```js
socials: {
  x: "https://x.com/tuUsuario", xHandle: "@tuUsuario",
  telegram: "https://t.me/…", discord: "https://discord.gg/…",
  github: "https://github.com/…", site: "https://…"
}
```

Las que dejes vacías se muestran apagadas (sin link).

---

## Correr local

```bash
# web
node tools/serve-web.mjs          # http://127.0.0.1:8100
# con datos de ejemplo, sin wallet:
#   http://127.0.0.1:8100/?demo=1          → dashboard poblado
#   http://127.0.0.1:8100/?demo=wizard     → asistente de buzón

# tests
node tools/setup-local.mjs        # requiere anvil en 8546
python tools/test-contract.py
node tools/test-web.mjs
```

Para la suite de contratos, `anvil --port 8546` en otra terminal.

---

## Dashboard

**Lenguaje visual:** papel sobre negro. Instrument Serif para titulares y números, Geist para
la interfaz, Geist Mono sólo para datos (direcciones, hashes, sellos). Sin tarjetas genéricas en
la columna del buzón: reglas de 1px, listas y un objeto impreso.

- **Banner:** titular serif con la segunda línea en cursiva, dos CTA y las redes como sellos.
- **Cuatro métricas** en banda: saldo, mensajes, en escrow, cobrado. Se calculan de los eventos
  (`Message` y `Settled`), no de una API.
- **El buzón es un pase.** No un formulario: un ticket blanco con la perforación, el precio
  en número grande, las condiciones con puntos guía, y en el talón el precio, un código de barras
  generado a partir de la `encKey` y el serial. Si no está emitido se muestra como **borrador**.
- **Asistente de 3 pasos** para emitir el pase: cada elección actualiza el ticket en vivo
  (precio, regla, quién entra), con la simulación del reparto exacto.
- **Conversaciones** como lista con reglas; la activa se marca con una barra blanca a la izquierda.
- **Hilo:** agrupado por emisor, separador de día, hora real de cada bloque, chips de pago por
  estado y burbujas propias en blanco.

---

## Decisiones de diseño

- **Un solo token.** `TalkInbox` cobra en un token inmutable (el del constructor). Más simple
  y más barato que el multi-asset; si el token cambia, se despliega otro inbox.
- **Estado derivado.** `isContact` se marca al liquidar, en ambos sentidos. No hay lista
  editable: los contactos son un hecho económico, no una preferencia.
- **Contabilidad estricta.** `send` verifica que llegó exactamente el monto pedido
  (`WrongPayment`), para no romperse con tokens que cobran comisión al transferir.
- **Sin rescate de fondos.** El contrato no tiene `withdraw`: lo único que puede salir es
  lo que el escrow dicta. No hay backdoor.
- **Reentrancy guard** en `send`, `reply` y `refund`.

### Límites conocidos

- El texto va en el evento: cualquiera lo ve (cifrado) y paga gas por su tamaño.
  `MAX_CIPHERTEXT` = 4096 B (~4 KB de texto).
- Si el token fuera fee-on-transfer, el receptor recibe menos de lo nominal aunque la
  contabilidad sea exacta al entrar.
- El buzón no se puede borrar (el `encKey` queda). Perder la wallet = perder el buzón.
- Sin auditoría externa.

---

## Comparación con el Mail de Nexus

Mismo protocolo de mensajería (está documentado en `../sobre-mail/README.md`), pero:

| | Nexus Mail | Talk |
|---|---|---|
| Contrato | de terceros, ya desplegado | tuyo |
| Moneda | PONS o ETH | **solo $TALK** |
| Comisión 5 % | va a la tesorería de Nexus | **va a tu tesorería** |
| Lógica de pagos | multi-asset | un token, menos gas |
| Interfaz | app completa con radar | dashboard enfocado en el buzón |
