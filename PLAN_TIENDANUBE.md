# Plan de implementación — Integración Tiendanube (e-commerce, sincronización completa)

> **Para:** Claude Code sobre el monorepo OPLEX (Nx · NestJS/Fastify `apps/api` · Next.js/React `apps/web` · PostgreSQL/Prisma · RLS multi-tenant).
> **Objetivo:** que un tenant vincule su tienda de Tiendanube y OPLEX sincronice en los **tres sentidos**: (1) las **órdenes** de la tienda entran a OPLEX como ventas/facturas, (2) el **stock** se mantiene consistente entre OPLEX y la tienda, y (3) el **catálogo y precios** se publican desde OPLEX hacia la tienda. Todo sin doble carga.
> **Base ya construida:** el patrón `Connector` (cifrado `ConnectorSecret`, OAuth, `ConnectorRegistry`, interfaz `ProviderConnector`, validación de webhook HMAC) del trabajo de Mercado Pago. **Tiendanube se enchufa sobre eso — NO se reinventa nada de cifrado, OAuth ni webhooks.**

---

## 0. Diferencias clave con Mercado Pago (leer antes de diseñar)

Verificado contra la doc oficial de Tiendanube/Nuvemshop (ago-2026). Cuatro diferencias que cambian el diseño respecto de MP:

1. **El token NO expira.** El OAuth de Tiendanube (Authorization Code) entrega un **bearer token de larga duración sin vencimiento**. → **No hay refresh de tokens, ni cron de refresh, ni distinción EXPIRED por tiempo.** El token se guarda cifrado en `ConnectorSecret` y se usa tal cual. La única invalidación es por revocación (merchant desinstala la app) → se detecta por 401 → `REVOKED`. Esto SIMPLIFICA la parte de conexión respecto de MP (toda la Fase 6 de refresh de MP acá no aplica).
2. **Webhooks firmados con HMAC-SHA256.** Igual concepto que MP: hay que validar la firma del webhook. **Reutilizar el patrón de `verifyWebhookSignature` de MP**, adaptando el manifest al formato de Tiendanube (seguir su doc oficial, no inventar).
3. **Rate limit "leaky bucket".** La API limita llamadas con un balde que drena a ritmo constante. **Central para catálogo/stock:** sincronizar cientos de productos NO se puede disparar de golpe. Hay que implementar un cliente HTTP que respete el rate limit (encolar/espaciar llamadas, y respetar el header de límite restante que devuelve la API). Esto es trabajo nuevo que MP no requería.
4. **`store_id` en la URL.** Todas las llamadas son a `https://api.tiendanube.com/v1/{store_id}/...`. El `store_id` es parte de la identidad de la conexión → se guarda en `Connector.externalAccountId` (como el collector id de MP).

Además, dos particularidades del OAuth de Tiendanube:
- La URL de autorización es `https://www.tiendanube.com/apps/{app_id}/authorize` y el intercambio de code por token es un POST a `https://www.tiendanube.com/apps/authorize/token`.
- Requiere **`state` para CSRF** (mismo patrón que ya hiciste en MP).
- Requiere header `User-Agent` con nombre de la app + email en TODAS las llamadas (si falta, la API rechaza).
- Los **scopes** se definen al crear la app (read/write products, orders, etc.). Pedir solo los necesarios.

---

## 1. Principio rector y paso de reconocimiento

**Reusar el patrón `Connector` tal cual.** Tiendanube es "otro provider del `ConnectorRegistry`" + "una implementación de `ProviderConnector`". Si algo del cifrado, del guardado de secretos o del `state` CSRF necesita reescribirse, el diseño está mal: se reutiliza.

**El desacople también aplica acá:** la sincronización de stock y catálogo debe evitar **bucles infinitos** (OPLEX actualiza la tienda → la tienda dispara webhook → OPLEX se actualiza → dispara de nuevo...). Diseñar desde el día uno con marca de origen para cortar el eco (ver Fase 4).

**Paso de reconocimiento obligatorio (antes de codear):**
- Releer el patrón `Connector` de MP: `Connector`, `ConnectorSecret`, `CryptoService`, `ConnectorRegistry`, la interfaz `ProviderConnector`, y `verifyWebhookSignature`. Documentar qué se reutiliza literal y qué necesita un punto de extensión.
- Localizar el modelo de **artículos/productos** de OPLEX: cómo se identifican (¿SKU?, ¿código interno?), variantes (talle/color), precios, imágenes, stock por depósito. El mapeo con Tiendanube es por **SKU** — confirmar que los artículos de OPLEX tienen SKU utilizable.
- Localizar cómo se crea una **venta/factura** en OPLEX programáticamente (el equivalente a lo que hace la UI de Facturación) — las órdenes de Tiendanube van a crear ventas por ese camino, reutilizándolo.
- Localizar el modelo de **movimientos de stock** y cómo se descuenta stock hoy (para reflejar ventas de la tienda y sincronizar).
- Localizar el modelo de **clientes** (las órdenes traen datos del comprador → crear/matchear cliente).
- Confirmar el patrón de webhooks entrantes ya montado en MP (`apps/api/src/app/webhooks/`) para montar el de Tiendanube al lado.

---

## 2. FASE 1 — Conexión OAuth (corta, reusa casi todo)

### 2.1 Registrar el provider
- Agregar `TIENDANUBE` al enum `ConnectorProvider` (ya existe con `MERCADO_PAGO` reservado + `TIENDANUBE` reservado según el plan de MP).
- Implementar `TiendanubeConnector implements ProviderConnector` y registrarlo en `ConnectorRegistry`.

### 2.2 Configuración (env, no hardcodear)
```
TIENDANUBE_APP_ID=...
TIENDANUBE_CLIENT_SECRET=...
TIENDANUBE_OAUTH_REDIRECT_URI=https://app.oplex.../api/connectors/tiendanube/callback
TIENDANUBE_APP_USER_AGENT=OPLEX (soporte@oplex.com.ar)   # requerido en cada request
```

### 2.3 Flujo OAuth (sin refresh)
- `GET /api/connectors/tiendanube/authorize` → genera `state` CSRF (mismo mecanismo que MP), redirige a `https://www.tiendanube.com/apps/{app_id}/authorize`.
- `GET /api/connectors/tiendanube/callback` → valida `state`, hace POST a `.../apps/authorize/token` con `client_id`/`client_secret`/`grant_type=authorization_code`/`code` (en el body, no query). La respuesta trae `access_token` + `user_id` (= `store_id`) + `scope`.
  - Guardar `access_token` en `ConnectorSecret` (cifrado). Guardar `store_id` en `Connector.externalAccountId`, `scope` en scopes. Status `CONNECTED`. **Sin `expiresAt` — el token no vence.**
- `POST /api/connectors/tiendanube/disconnect` → status `DISCONNECTED`, borrar secretos. (Opcional: registrar el webhook de `app/uninstalled` para detectar desinstalación desde el lado de Tiendanube.)
- `GET /api/connectors/tiendanube/status` → estado + nombre de la tienda para la UI.

### 2.4 Cliente HTTP con rate limit (nuevo, clave)
- Crear un `TiendanubeApiClient` que:
  - Inyecta el `Authorization: Bearer` (token descifrado en memoria) y el `User-Agent` obligatorio en cada request.
  - Respeta el **leaky bucket**: lee los headers de rate limit que devuelve la API y **espacia/encola** las llamadas para no exceder. Ante 429, espera y reintenta con backoff.
  - Base URL con `store_id` incrustado.
- Este cliente lo usan las tres sincronizaciones. Es la pieza de infraestructura nueva de Tiendanube.

### 2.5 Entregable
- Vincular y desvincular una tienda real de prueba end-to-end.
- Token guardado cifrado; `store_id` persistido.
- `TiendanubeApiClient` haciendo una llamada real de lectura (ej. datos de la tienda) respetando rate limit.

---

## 3. FASE 2 — Flujo 1: Órdenes → Venta/Factura en OPLEX

> El de mayor valor inmediato: que las ventas online entren solas.

### 3.1 Webhooks de órdenes
- Registrar (vía API, al conectar) los webhooks: `order/created`, `order/paid`, `order/cancelled` (nombres exactos según doc de Tiendanube).
- Endpoint `POST /api/webhooks/tiendanube` (`@Public()`), al lado del de MP:
  1. **Validar firma HMAC-SHA256** (reutilizar patrón de MP, manifest de Tiendanube). Firma inválida → 401.
  2. Identificar el tenant por el `store_id` del payload → buscar el `Connector` con ese `externalAccountId`.
  3. Idempotencia de recepción (reutilizar tabla `WebhookEvent`: unique por provider+externalId+type).
  4. Responder 200 rápido; procesar (el volumen de órdenes es bajo, se puede procesar inline con cuidado, pero mantener el patrón de MP).

### 3.2 Convertir orden en venta
- Al recibir `order/created` (o `order/paid`, decidir cuál dispara la venta — **recomendado `order/paid`** para no facturar órdenes no pagadas):
  - `GET /v1/{store_id}/orders/{id}` para traer la orden completa.
  - **Matchear/crear cliente:** buscar por CUIT/email; si no existe, crear con los datos del comprador.
  - **Mapear líneas:** cada producto de la orden → artículo de OPLEX por **SKU**. Si un SKU no existe en OPLEX → decidir política (crear artículo, o marcar la orden para revisión manual — **recomendado: revisión manual**, no crear artículos silenciosamente).
  - **Crear la venta** por el mismo camino programático que usa Facturación (reconocido en el paso 1). Decisión de alcance: ¿generar factura AFIP automática o dejar la venta en borrador para que el usuario facture? → **Recomendado: crear la venta/orden en OPLEX y dejar que el usuario decida facturar** (evita emitir CAE automáticamente sobre datos que quizás requieren revisión). Documentar esta decisión.
  - Descontar stock (ver Fase 3, para no duplicar el descuento).
  - Log de actividad + evento WebSocket (aparece en vivo en Ventas).

### 3.3 Entregable
- Una orden de prueba en la tienda aparece como venta en OPLEX, con cliente y líneas mapeadas por SKU, sin doble carga.
- SKU desconocido → va a revisión, no rompe.
- Idempotencia: la misma orden notificada dos veces no crea dos ventas.

---

## 4. FASE 3 — Flujo 2: Sincronización de stock (bidireccional, la más delicada)

> Acá está el riesgo real: bucles de eco y descuentos duplicados. Diseñar con cuidado.

### 4.1 Fuente de verdad del stock
- **Decisión de diseño (confirmar con el usuario):** ¿quién manda en el stock? Recomendado: **OPLEX es la fuente de verdad.** OPLEX empuja el stock disponible hacia Tiendanube; las ventas de la tienda descuentan en OPLEX y OPLEX vuelve a empujar el nuevo disponible. Esto evita la ambigüedad de dos sistemas editando el mismo número.

### 4.2 OPLEX → Tiendanube (empujar stock)
- Cuando cambia el stock de un artículo publicado en OPLEX (venta, compra, ajuste, recepción), empujar el nuevo disponible a la variante correspondiente en Tiendanube (`PUT` a la variante por SKU).
- Respetar rate limit (leaky bucket): encolar las actualizaciones, no una llamada sincrónica por cada movimiento. Un **debounce/batch** por artículo evita ráfagas.

### 4.3 Tiendanube → OPLEX (ventas de la tienda)
- La venta de la tienda ya llega por el webhook de orden (Fase 2) y descuenta stock en OPLEX. **Cuidado de no descontar dos veces:** el descuento ocurre UNA vez, al crear la venta desde la orden. No descontar además por un eventual webhook de `product/updated`.

### 4.4 Cortar el bucle de eco (crítico)
- Problema: OPLEX empuja stock → Tiendanube dispara `product/updated` → OPLEX lo recibe → ¿vuelve a empujar? = bucle infinito.
- Solución: **marca de origen.** Cuando OPLEX empuja un cambio, registrar (por artículo + valor + timestamp) que ese cambio lo originó OPLEX. Al recibir un `product/updated` de Tiendanube, si el valor coincide con lo que OPLEX acaba de empujar → **ignorar** (es el eco de nuestro propio cambio). Solo procesar cambios que se originaron en la tienda.
- Alternativamente/además: no suscribir `product/updated` para stock si OPLEX es la única fuente de verdad de stock, y confiar solo en las órdenes para los cambios entrantes. **Recomendado: empezar así (más simple y sin bucles), y solo sumar `product/updated` si hace falta.**

### 4.5 Entregable
- Cambiar stock en OPLEX se refleja en la tienda (respetando rate limit).
- Vender en la tienda descuenta stock en OPLEX una sola vez.
- Sin bucles de eco (test explícito del escenario).

---

## 5. FASE 4 — Flujo 3: Catálogo y precios (OPLEX → Tiendanube)

### 5.1 Publicar/actualizar productos
- Desde un artículo de OPLEX marcado como "publicado", crear/actualizar el producto en Tiendanube: nombre, descripción, precio, imágenes, variantes (talle/color mapeadas a variantes de TN), SKU.
- Mapeo persistente OPLEX↔Tiendanube: guardar el `tiendanube_product_id`/`variant_id` por artículo/variante (tabla de mapeo o campos en el artículo) para saber si es alta o update.
- **Precios:** empujar el precio de OPLEX hacia la tienda. Decidir si es one-way (OPLEX manda) — **recomendado one-way**, OPLEX es la fuente de verdad del precio, para evitar la misma ambigüedad que con el stock.

### 5.2 Sincronización inicial y masiva (rate limit crítico)
- Al conectar por primera vez, o al publicar en lote: **cientos de productos** = respetar el leaky bucket sí o sí. Encolar y espaciar; mostrar progreso en la UI ("sincronizando 45/300").
- Idempotencia: re-sincronizar no duplica productos (usar el mapeo de IDs).

### 5.3 Entregable
- Publicar un artículo de OPLEX lo crea en la tienda con variantes, imágenes y precio.
- Editar el artículo lo actualiza (no duplica).
- Sincronización masiva respeta rate limit y muestra progreso.

---

## 6. FASE 5 — UI/UX

### 6.1 Card de Tiendanube en Integraciones
- Junto a la de Mercado Pago (la grilla de conectores ya existe de MP): conectar/desconectar/estado, nombre de la tienda conectada.

### 6.2 Panel de sincronización
- Estado de sincronización: cuántos productos publicados/sincronizados, últimas órdenes importadas, SKUs sin mapear que requieren atención.
- Acción "Sincronizar catálogo ahora" con barra de progreso (respeta rate limit por detrás).
- Lista de **órdenes en revisión** (las que tuvieron SKU desconocido) para resolverlas a mano.
- Errores legibles (no stacktraces): "3 productos no se sincronizaron porque les falta SKU".

### 6.3 En vivo y responsive
- Las órdenes entrantes aparecen en Ventas en vivo (WebSocket, reusar gateway).

### 6.4 Entregable
- Flujo completo usable por un no-técnico: conectar tienda → sincronizar catálogo → ver órdenes entrar solas → stock consistente.

---

## 7. FASE 6 — Hardening

### 7.1 Robustez
- Rate limit respetado en todos los flujos; backoff ante 429.
- Reintentos livianos a mano en llamadas salientes (mismo criterio que MP: no tragarse el fallo).
- Manejo de desinstalación de la app (webhook `app/uninstalled` o 401 sistemático) → `REVOKED`, limpiar secretos.
- Webhooks obligatorios de protección de datos (`store/redact`, `customers/redact`, `customers/data_request`) que Tiendanube exige para apps — implementarlos aunque sea el mínimo de compliance.

### 7.2 Checklist de seguridad
- [ ] Token cifrado en `ConnectorSecret` (reutiliza cripto de AFIP/MP).
- [ ] `state` CSRF en OAuth.
- [ ] Firma HMAC validada en webhooks; sin firma no se procesa.
- [ ] Idempotencia de órdenes (no duplicar ventas).
- [ ] Sin bucles de eco en stock (test).
- [ ] RLS en las tablas de mapeo nuevas.
- [ ] Guards de rol: quién conecta y sincroniza.
- [ ] User-Agent presente en todas las llamadas.
- [ ] Rate limit respetado (test de sincronización masiva).

---

## 8. Definición de "Terminado"

1. El tenant vincula su tienda de Tiendanube en 2 clics (reutiliza el patrón Connector, sin refresh porque el token no vence).
2. Las órdenes pagadas de la tienda entran como ventas en OPLEX, con cliente y líneas mapeadas por SKU; los SKU desconocidos van a revisión.
3. El stock se mantiene consistente (OPLEX fuente de verdad), sin bucles de eco ni descuentos dobles.
4. El catálogo y los precios se publican desde OPLEX a la tienda, con sincronización masiva que respeta el rate limit.
5. Todo el patrón `Connector` se reutilizó — se confirma que agregar el 2º conector NO obligó a tocar el cifrado, OAuth base ni `verifyWebhookSignature`.
6. Pasa el checklist de seguridad y los tests, incluido multi-tenant y el de no-bucle.

---

## 9. Notas finales para Claude Code

- **Reusá el patrón Connector, no lo reinventes.** Si tocás el cifrado o el core de OAuth/webhook, algo está mal. Tiendanube es "un provider más".
- **El token de Tiendanube NO vence:** no armes cron de refresh ni lógica de expiración por tiempo. Solo revocación por 401.
- **El rate limit (leaky bucket) es la pieza nueva más importante:** todo el catálogo/stock depende de respetarlo. No dispares llamadas masivas sin encolar.
- **Los bucles de eco en stock son el riesgo #1:** empezá con el diseño más simple (OPLEX fuente de verdad, sin suscribir product/updated para stock) y solo complejizá si hace falta.
- **No factures AFIP automáticamente** sobre órdenes entrantes sin decisión del usuario — creá la venta y dejá que facture. (Confirmar con el usuario.)
- No inventes formatos de la API de Tiendanube (manifest de firma, nombres de webhooks, endpoints): seguí la doc oficial vigente. Si hay SDK oficial (nube-sdk) que ayude, evaluarlo.
- Commits por fase, migraciones y tests verdes antes de avanzar.
- Documentá el resultado del paso de reconocimiento en el PR.

---

## 10. Decisiones que conviene confirmar con el usuario antes o durante

1. **Órdenes:** ¿crear venta en borrador para que el usuario facture (recomendado), o emitir factura AFIP automática?
2. **Stock:** ¿OPLEX como única fuente de verdad (recomendado), o sincronización bidireccional real?
3. **SKU desconocido en una orden:** ¿revisión manual (recomendado) o crear artículo automático?
4. **Precios:** ¿one-way OPLEX→tienda (recomendado) o editable en ambos lados?
