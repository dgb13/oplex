# Plan de implementación — Integración Mercado Pago (Cobro) + Patrón de Conectores cifrados

> **Para:** Claude Code trabajando sobre el monorepo OPLEX (Nx · NestJS/Fastify `apps/api` · Next.js/React `apps/web` · PostgreSQL/Prisma · RLS multi-tenant).
> **Objetivo de este entregable:** que un tenant vincule su cuenta de Mercado Pago (OAuth), genere un **link de pago / QR** desde una factura o cotización, y que cuando el cliente pague, OPLEX **registre el cobro automáticamente y postee el asiento contable**, sin intervención manual.
> **Decisión de arquitectura confirmada:** el dinero va a la cuenta de **cada tenant** (flujo marketplace / OAuth Authorization Code). Las credenciales se guardan **cifradas por tenant, reutilizando el mismo mecanismo que ya usa el certificado de AFIP.**
> **Principio rector:** todo lo que se construya acá debe quedar como **patrón `Connector` reutilizable**, para que Tiendanube, Mercado Libre y futuras integraciones se enchufen sin reinventar cifrado, OAuth, refresh de tokens ni webhooks.

---

## 0. Cómo usar este documento

Está dividido en **fases**. Cada fase es un bloque de trabajo cerrado, testeable y mergeable por separado. No avanzar a la fase siguiente sin que la anterior compile, pase tests y tenga sus migraciones aplicadas.

**Orden de ejecución:**
1. Fase 1 — Fundaciones: el patrón `Connector` genérico + cripto reutilizada de AFIP.
2. Fase 2 — OAuth de Mercado Pago (vincular/desvincular cuenta del tenant).
3. Fase 3 — Generar link de pago / QR desde factura o cotización.
4. Fase 4 — Webhook de cobro: recibir, validar, conciliar, asentar.
5. Fase 5 — UI/UX (vinculación, botón de cobro, estados en la factura).
6. Fase 6 — Hardening: refresh de tokens, reintentos, observabilidad, tests e2e.

**Antes de escribir código, Claude Code debe (paso de reconocimiento obligatorio):**
- Localizar en `apps/api` cómo está implementado hoy el **cifrado del certificado AFIP** (buscar por `afip`, `certificate`, `encrypt`, `cipher`, `kms`, `crypto`). Documentar en un comentario del PR: qué algoritmo usa (esperado: AES-256-GCM u similar), de dónde sale la clave (variable de entorno / KMS), y qué formato tiene el registro cifrado.
- Localizar el patrón de **guards de rol** y de **RLS por tenant** (cómo se inyecta el `tenantId` / `companyId` en las queries de Prisma) para respetarlo en todas las tablas nuevas.
- Localizar el módulo de **cobros existente** y el que **postea asientos contables** (el resumen menciona: cobro → asiento débito Caja / crédito Deudores por Ventas). El nuevo flujo de MP debe **reutilizar ese servicio de cobro**, no crear uno paralelo.
- **No duplicar lógica.** Si algo ya existe (cifrado, cobro, asiento), se envuelve y se reusa.

---

## 1. FASE 1 — Fundaciones: patrón `Connector` + cripto reutilizable

### 1.1 Meta
Crear la capa genérica sobre la que se montan **todas** las integraciones externas por tenant. Mercado Pago será el primer consumidor; Tiendanube y ML vendrán después sin tocar esta base.

### 1.2 Modelo de datos (Prisma)

Crear una tabla genérica de conexiones de terceros. **Toda credencial sensible va cifrada en reposo**, nunca en texto plano.

```prisma
enum ConnectorProvider {
  MERCADO_PAGO
  TIENDANUBE      // reservado para futuro
  MERCADO_LIBRE   // reservado para futuro
}

enum ConnectorStatus {
  PENDING        // se inició OAuth, falta callback
  CONNECTED      // activo y usable
  EXPIRED        // token venció y no se pudo refrescar
  REVOKED        // el vendedor desautorizó desde MP
  ERROR          // fallo repetido
  DISCONNECTED   // el usuario lo desconectó desde OPLEX
}

model Connector {
  id            String            @id @default(cuid())
  tenantId      String            // FK a la empresa/tenant — RLS aplica acá
  provider      ConnectorProvider
  status        ConnectorStatus   @default(PENDING)

  // Identidad de la cuenta externa (NO sensible, sirve para mostrar en UI)
  externalAccountId String?       // ej. user_id de MP (collector id)
  externalNickname  String?       // ej. nombre de la cuenta MP, para mostrar
  scopes            String?       // scopes concedidos

  // Credenciales: SIEMPRE cifradas. Ver ConnectorSecret abajo.
  // No guardar tokens en columnas planas.

  connectedByUserId String?       // quién la vinculó
  connectedAt       DateTime?
  lastRefreshAt     DateTime?
  lastErrorAt       DateTime?
  lastErrorMessage  String?

  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  secrets       ConnectorSecret[]

  @@unique([tenantId, provider])   // un tenant, una conexión por proveedor (por ahora)
  @@index([tenantId, provider, status])
}

model ConnectorSecret {
  id           String   @id @default(cuid())
  connectorId  String
  connector    Connector @relation(fields: [connectorId], references: [id], onDelete: Cascade)

  key          String   // ej. "access_token", "refresh_token", "webhook_secret"
  // Valor cifrado con AES-256-GCM (mismo mecanismo que AFIP).
  ciphertext   Bytes
  iv           Bytes
  authTag      Bytes
  keyVersion   Int      @default(1)   // para rotación de clave maestra

  expiresAt    DateTime?              // para access_token (180d) y refresh (6m)

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([connectorId, key])
}
```

> **Importante RLS:** aplicar Row Level Security a `Connector` y `ConnectorSecret` igual que al resto de tablas sensibles, filtrando por `tenantId`. `ConnectorSecret` no tiene `tenantId` directo: o bien se lo agrega denormalizado para la policy RLS, o la policy se define vía join a `Connector`. **Preferir `tenantId` denormalizado en `ConnectorSecret`** para que la policy sea simple y no dependa de joins. Ajustar el modelo en consecuencia.

### 1.3 Servicio de cifrado reutilizable

Crear `CryptoService` (o extender el existente de AFIP) en un módulo compartido `libs` o `apps/api/src/common/crypto`:

- **Reusar exactamente** el algoritmo y la derivación de clave del certificado AFIP. Si AFIP usa AES-256-GCM con clave desde `ENV`/KMS, esto usa lo mismo.
- API mínima:
  - `encrypt(plaintext: string | Buffer): { ciphertext, iv, authTag, keyVersion }`
  - `decrypt({ ciphertext, iv, authTag, keyVersion }): Buffer`
- **Soportar `keyVersion`** para permitir rotación de la clave maestra sin re-cifrar todo de golpe.
- **Nunca loguear** plaintext ni claves. Agregar un test que verifique que un token cifrado no aparece en logs.

### 1.4 `ConnectorService` (fachada genérica)

Servicio que las integraciones concretas usan. Responsabilidades:
- `getConnector(tenantId, provider)` → estado + metadatos (sin exponer secretos).
- `saveSecret(connectorId, key, plaintext, expiresAt?)` → cifra y persiste.
- `getSecret(connectorId, key)` → descifra en memoria, **devuelve y no persiste en claro**.
- `setStatus(connectorId, status, errorMessage?)`.
- `disconnect(tenantId, provider)` → marca `DISCONNECTED`, borra secretos.

### 1.5 Contrato `ProviderConnector` (interfaz)

Definir una interfaz que cada proveedor implementa. Esto es lo que hace el patrón extensible:

```typescript
interface ProviderConnector {
  provider: ConnectorProvider;
  getAuthorizationUrl(tenantId: string, state: string): string;
  handleOAuthCallback(tenantId: string, code: string): Promise<void>;
  refreshIfNeeded(connectorId: string): Promise<void>;
  disconnect(tenantId: string): Promise<void>;
}
```

`MercadoPagoConnector` será la primera implementación. Registrarlas en un `ConnectorRegistry` indexado por `provider`, de modo que agregar Tiendanube mañana sea "implementar la interfaz + registrar".

### 1.6 Entregable de la fase
- Migración Prisma aplicada (con RLS en las tablas nuevas).
- `CryptoService` con tests unitarios (round-trip encrypt/decrypt, rotación de keyVersion, no-leak en logs).
- `ConnectorService` + interfaz + registry, con tests.
- **Sin** lógica de Mercado Pago todavía.

---

## 2. FASE 2 — OAuth de Mercado Pago (vincular la cuenta del tenant)

### 2.1 Contexto técnico (verificado contra la doc oficial de MP, ago-2026)

- Flujo: **Authorization Code** (redirección + consentimiento del vendedor). Es el flujo correcto para operar en nombre de un tercero (el tenant).
- La URL de autorización tiene la forma:
  `https://auth.mercadopago.com/authorization?client_id=APP_ID&response_type=code&platform_id=mp&state=RANDOM_ID&redirect_uri=REDIRECT`
- El `code` que vuelve por el `redirect_uri` **dura 10 minutos y es de un solo uso**.
- Se intercambia el `code` en `POST /oauth/token` por `access_token` + `refresh_token`.
- **`access_token` dura 180 días (6 meses).** El `refresh_token` también dura ~6 meses.
- Para obtener `refresh_token` hay que pedir **scope `offline_access`**.
- **Cada refresh ROTA el refresh_token**: la respuesta trae un `refresh_token` nuevo que hay que volver a guardar (cifrado). No reutilizar el viejo.
- Usar **PKCE** (`code_verifier`/`code_challenge`) como recomienda MP para el flujo OAuth.
- MP puede notificar por webhook cuando un vendedor **autoriza o desautoriza** la app. Manejar la desautorización → marcar `REVOKED`.
- Eventos que revocan tokens del lado de MP (hay que tolerarlos): el vendedor cambia contraseña, revoca la autorización, limpieza de sesión, o acción antifraude. Ante 401/403 repetidos, marcar el connector `EXPIRED`/`REVOKED` y pedir re-vinculación.

### 2.2 Configuración (variables de entorno, NO hardcodear)
```
MP_CLIENT_ID=...            # App ID de la aplicación OPLEX en MP
MP_CLIENT_SECRET=...        # secreto de la app OPLEX
MP_OAUTH_REDIRECT_URI=https://app.oplex.../api/connectors/mercadopago/callback
MP_WEBHOOK_SECRET=...       # clave secreta de webhooks (se define en el panel de MP)
```
> El `MP_CLIENT_ID/SECRET` son de la **aplicación OPLEX** (una sola, a nivel plataforma). Lo que es **por tenant** es el `access_token`/`refresh_token` que devuelve el OAuth de cada vendedor.

### 2.3 Endpoints (NestJS, bajo el módulo `connectors/mercadopago`)

- `GET /api/connectors/mercadopago/authorize`
  - Requiere sesión + rol con permiso (OWNER/ADMIN; verificar contra los guards existentes).
  - Genera `state` aleatorio (firmado o guardado con TTL corto, atado al `tenantId` para prevenir CSRF) y `code_verifier` (guardado temporalmente).
  - Crea/actualiza el `Connector` en estado `PENDING`.
  - Devuelve (o redirige a) la `authorization_url`.

- `GET /api/connectors/mercadopago/callback`
  - Recibe `code` + `state`.
  - Valida `state` (que exista, no expiró, corresponde a este tenant). Si falla → error, no continuar.
  - Intercambia `code` por tokens en `POST /oauth/token` (con `code_verifier` PKCE).
  - Guarda `access_token`, `refresh_token`, `expiresAt`, `externalAccountId` (collector id), `externalNickname`, `scopes` — **todo vía `ConnectorService.saveSecret` (cifrado)**.
  - Marca `Connector` como `CONNECTED`, setea `connectedAt`, `connectedByUserId`.
  - Redirige al front a la pantalla de integraciones con estado de éxito.

- `POST /api/connectors/mercadopago/disconnect`
  - Marca `DISCONNECTED`, borra secretos. (Opcional: llamar a MP para revocar del lado de ellos.)

- `GET /api/connectors/mercadopago/status`
  - Devuelve estado + nickname de la cuenta (sin secretos) para pintar la UI.

### 2.4 Seguridad del `state` (CSRF)
- `state` = valor aleatorio de alta entropía, guardado server-side (o JWT firmado de vida corta) con `tenantId` + `userId` + `codeVerifier` + expiración (10 min).
- Rechazar callbacks con `state` inválido o expirado. Nunca confiar en el `tenantId` que venga del cliente en el callback: sacarlo del `state`.

### 2.5 Entregable de la fase
- `MercadoPagoConnector.getAuthorizationUrl` + `handleOAuthCallback` funcionando.
- Un tenant puede vincular y desvincular su cuenta MP end-to-end contra el **entorno de prueba de MP** (usuarios de test).
- Tokens guardados **cifrados**; verificado que no hay tokens en texto plano en DB ni en logs.
- Tests: callback con `state` inválido rechazado; round-trip de vinculación con mock del endpoint `/oauth/token`.

---

## 3. FASE 3 — Generar link de pago / QR desde factura o cotización

### 3.1 Meta
Desde una factura (o cotización) del tenant, generar un cobro Mercado Pago y obtener un **link** (y su **QR**) para enviar al cliente por email o WhatsApp (OPLEX ya tiene ambos canales).

### 3.2 Modelo de datos (Prisma) — el cobro pendiente

```prisma
enum PaymentIntentStatus {
  PENDING     // link creado, esperando pago
  PAID        // pagado y conciliado
  EXPIRED     // venció sin pagarse
  CANCELLED   // anulado por el usuario
  REFUNDED
  ERROR
}

model PaymentIntent {
  id             String   @id @default(cuid())
  tenantId       String
  connectorId    String

  // A qué documento de OPLEX corresponde (factura o cotización)
  documentType   String   // "INVOICE" | "QUOTE"
  documentId     String

  provider       ConnectorProvider  @default(MERCADO_PAGO)

  // Datos que devuelve MP al crear la preferencia
  externalId     String?  // preference_id de MP
  initPoint      String?  // URL de pago (link)
  qrCodeBase64   String?  // QR renderizable (opcional, si se usa QR)

  amount         Decimal  @db.Decimal(18, 2)
  currency       String   @default("ARS")

  status         PaymentIntentStatus @default(PENDING)

  // Trazabilidad del pago real cuando llega
  externalPaymentId String?          // payment id de MP
  paidAt            DateTime?
  paymentRaw        Json?            // payload crudo del pago para auditoría

  // Idempotencia: clave única de creación
  idempotencyKey String  @unique

  createdByUserId String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([tenantId, status])
  @@index([tenantId, documentType, documentId])
  @@index([externalPaymentId])
}
```

### 3.3 Servicio `MercadoPagoPaymentService`

- `createPaymentLink({ tenantId, documentType, documentId })`:
  1. Cargar el documento (factura/cotización) respetando RLS. Validar que pertenece al tenant, que tiene saldo pendiente, y su importe/moneda.
  2. Obtener el `access_token` del connector (descifrado en memoria, `refreshIfNeeded` primero).
  3. Construir la **preferencia de pago** (Checkout Pro / preference) con:
     - `items` (descripción legible: nº de factura, cliente).
     - `external_reference` = `paymentIntentId` de OPLEX (clave para conciliar después).
     - `notification_url` = URL del webhook de OPLEX (ver Fase 4), con `?client=<tenantId>` para identificar al vendedor.
     - `back_urls` (opcional) para UX de retorno.
     - `expires` / `expiration_date_to` si se quiere caducidad.
  4. Enviar header `X-Idempotency-Key` (usar `idempotencyKey`) para no crear preferencias duplicadas ante reintentos.
  5. Persistir `PaymentIntent` con `externalId` (preference_id) e `initPoint`.
  6. Devolver `{ initPoint, qrCodeBase64? }`.

> **Idempotencia de creación:** derivar `idempotencyKey` de `(documentId + amount)` o generarla y guardarla antes de llamar a MP. Si ya existe un `PaymentIntent` PENDING para ese documento con el mismo importe, **devolver el existente** en vez de crear otro.

### 3.4 Endpoints
- `POST /api/connectors/mercadopago/payment-links` → body `{ documentType, documentId }` → crea y devuelve link+QR.
- `GET  /api/connectors/mercadopago/payment-links/:id` → estado del intent (para polling opcional en UI).
- `POST /api/connectors/mercadopago/payment-links/:id/cancel` → cancela el intent.

### 3.5 Entregable de la fase
- Generar un link real de pago contra el sandbox de MP desde una factura de prueba.
- QR disponible para el mismo intent.
- `PaymentIntent` persistido y consultable, con idempotencia probada (dos llamadas = un solo intent).

---

## 4. FASE 4 — Webhook de cobro: recibir, validar, conciliar, asentar

Esta es la fase de **más valor y más cuidado**: es lo que hace que el cobro se registre solo.

### 4.1 Contexto técnico (verificado, ago-2026)
- MP envía un **HTTP POST** a la `notification_url` cuando hay novedades de pago.
- Trae header **`x-signature`** con formato `ts=<timestamp>,v1=<hmac>` y un header `x-request-id`.
- La **validación de firma**: se arma un `manifest` string con el `id` del recurso (data.id de la query/body), el `x-request-id` y el `ts`, y se calcula **HMAC-SHA256** con la **clave secreta de webhooks** de la app; debe coincidir con `v1`. (Reproducir el algoritmo exacto de la doc oficial de MP; no inventar el formato del manifest.)
- El body/query trae `type` (ej. `payment`) y `data.id` (el id del pago). **El webhook NO trae el estado final confiable**: hay que **consultar el pago** con `GET /v1/payments/:id` usando el `access_token` del vendedor para conocer `status` (`approved`, etc.) y el `external_reference`.

### 4.2 Endpoint del webhook
- `POST /api/webhooks/mercadopago`
  - **Responder 200 rápido.** MP reintenta si no recibe 2xx pronto; el procesamiento pesado va a una cola/tarea async, no en el request.
  - Pasos:
    1. **Validar `x-signature`** (HMAC-SHA256 con `MP_WEBHOOK_SECRET`). Si no valida → responder 401 y no procesar. Loguear intento.
    2. Identificar el tenant por el parámetro `?client=<tenantId>` (o mapeando el collector id). Cargar su connector.
    3. **Idempotencia de recepción:** registrar `x-request-id` / `data.id` en una tabla `WebhookEvent` con unique; si ya se procesó, responder 200 y salir.
    4. Encolar procesamiento async (o procesar y devolver 200).
- `GET /api/webhooks/mercadopago` (health/verificación si MP lo requiere).

### 4.3 Tabla de eventos (idempotencia + auditoría)
```prisma
model WebhookEvent {
  id            String   @id @default(cuid())
  provider      ConnectorProvider
  tenantId      String?
  externalId    String   // data.id (id del pago) o request id
  requestId     String?  // x-request-id
  type          String   // "payment", etc.
  signatureOk   Boolean
  processed     Boolean  @default(false)
  payload       Json
  receivedAt    DateTime @default(now())
  processedAt   DateTime?
  error         String?

  @@unique([provider, externalId, type])
  @@index([tenantId, processed])
}
```

### 4.4 Procesamiento del pago (el corazón de la conciliación)
Worker/handler que, dado un evento `payment`:
1. `refreshIfNeeded` del connector del tenant, obtener `access_token`.
2. `GET /v1/payments/:data.id` en MP → traer `status`, `transaction_amount`, `external_reference`, `date_approved`.
3. Buscar el `PaymentIntent` por `external_reference` (= `paymentIntentId`) **dentro del tenant** (respetar RLS). Si no existe → loguear y marcar el evento como huérfano (posible pago manual no originado en OPLEX; no romper).
4. Si `status === 'approved'` y el intent está `PENDING`:
   - **Verificar importe y moneda** contra el `PaymentIntent` (defensa contra montos alterados). Si no coinciden → marcar `ERROR`, no asentar, alertar.
   - Marcar `PaymentIntent` como `PAID`, guardar `externalPaymentId`, `paidAt`, `paymentRaw`.
   - **Reutilizar el servicio de cobros existente de OPLEX** para:
     - registrar el cobro contra la factura (imputación),
     - **postear el asiento contable** (débito Caja/Banco Mercado Pago / crédito Deudores por Ventas) — el mismo que ya hace el cobro manual. **No** escribir un asiento nuevo a mano acá; llamar al servicio que ya existe.
     - actualizar el saldo de la cuenta corriente del cliente.
   - Registrar en el **log de actividad** de OPLEX (la app ya audita acciones mutantes) que el cobro entró por Mercado Pago.
   - Emitir por **WebSocket** (OPLEX ya tiene salas por tenant) el evento de "factura pagada" para que el dashboard y la vista de la factura se actualicen en vivo.
5. Marcar `WebhookEvent.processed = true`.
6. Manejar otros estados: `pending`/`in_process` → dejar el intent como está; `rejected`/`cancelled` → opcionalmente reflejar; `refunded` → status `REFUNDED` (y, si aplica, revertir el asiento vía el mecanismo de reversión que ya existe en Contabilidad).

### 4.5 Idempotencia (crítico)
- Un mismo pago puede notificarse **varias veces**. La conciliación debe ser idempotente: si el `PaymentIntent` ya está `PAID` con ese `externalPaymentId`, no volver a asentar. El unique en `WebhookEvent` + el check de estado del intent garantizan que el asiento se postea **una sola vez**.

### 4.6 Entregable de la fase
- Webhook que valida firma, es idempotente y responde 200 rápido.
- Un pago aprobado en sandbox concilia la factura y postea el asiento **automáticamente**, reutilizando el servicio de cobro existente.
- Dashboard y factura se actualizan en vivo por WebSocket.
- Tests: firma inválida rechazada; doble notificación = un solo asiento; importe alterado = no asienta.

---

## 5. FASE 5 — UI/UX (que se sienta mejor que la competencia)

> La ventaja no es solo tener la integración, sino que sea **más simple y clara** que en Colppy/Xubio/Tango. Objetivo: vincular en 2 clics, cobrar desde la factura en 1, y ver el estado del cobro en vivo.

### 5.1 Pantalla de Integraciones / Conectores (nueva)
- Ubicación: dentro de Configuración de la empresa (o un nuevo item "Integraciones" en el menú).
- Card de Mercado Pago con estado claro: **No conectado** / **Conectado como `<nickname>`** / **Necesita reconexión** (si `EXPIRED`/`REVOKED`).
- Botón **"Conectar Mercado Pago"** → dispara el OAuth (abre `authorize`, vuelve al callback, refresca el estado).
- Botón **"Desconectar"** con confirmación.
- Mostrar cuándo se conectó y quién.
- Diseñada como **grilla de conectores** desde el día uno (aunque hoy haya uno solo), para que Tiendanube/ML aparezcan como cards nuevas sin rediseñar. Usar el skill de diseño frontend del repo para respetar tokens visuales.

### 5.2 En la factura / cotización
- Botón **"Cobrar con Mercado Pago"** (visible solo si el connector está `CONNECTED` y el documento tiene saldo).
- Al generar: modal con el **link copiable**, el **QR** para mostrar/descargar, y botones **"Enviar por email"** y **"Enviar por WhatsApp"** (reusar los canales existentes; el mensaje incluye el link).
- **Estado del cobro en vivo** en la factura: badge que pasa de "Link enviado — esperando pago" a "Pagado ✓" **sin recargar**, vía el WebSocket de la Fase 4. Este detalle de tiempo real es un diferenciador directo frente a los competidores desktop.
- Si el intent expira o se cancela, reflejarlo y permitir generar uno nuevo.

### 5.3 Dashboard
- Los cobros que entran por MP ya impactan "Cobrado hoy" (porque reusan el servicio de cobro). Verificar que el widget en vivo los tome.
- Opcional: mini-indicador de "links de pago pendientes" (facturas con `PaymentIntent` PENDING).

### 5.4 Estados de error legibles
- Nunca mostrar el error crudo de MP. Traducir a mensajes accionables: "Tu conexión con Mercado Pago venció, reconectala desde Integraciones", etc. (mismo espíritu que ya se hizo con los errores SOAP de AFIP).

### 5.5 Entregable de la fase
- Flujo completo usable por un no-técnico: conectar → cobrar desde factura → ver "Pagado" en vivo.
- Responsive (la base de usuarios pyme usa mucho el celular; Colppy hace bandera de lo móvil).

---

## 6. FASE 6 — Hardening (producción de verdad)

### 6.1 Refresh de tokens
- Job programado (o `refreshIfNeeded` perezoso antes de cada uso) que renueva `access_token` usando el `refresh_token` **antes** de que venza, y **guarda el nuevo refresh_token rotado** (cifrado). Registrar `lastRefreshAt`.
- Ante fallo de refresh (401/invalid_grant): marcar `EXPIRED`/`REVOKED`, notificar al tenant para reconectar, y deshabilitar el botón de cobro con mensaje claro.

### 6.2 Manejo de desautorización
- Escuchar el webhook de autorización/desautorización de MP (o detectar 401 sistemáticos) → marcar `REVOKED` y limpiar secretos.

### 6.3 Reintentos y colas
- Procesamiento de webhooks en cola con reintentos exponenciales ante fallos transitorios de la API de MP.
- Dead-letter para eventos que fallan repetidamente → visibles en el Backoffice SuperAdmin (OPLEX ya tiene visor de errores 5xx; sumar los eventos de conector fallidos ahí).

### 6.4 Observabilidad
- Métricas: links creados, pagos conciliados, latencia webhook→asiento, tasa de firmas inválidas, refresh fallidos.
- Logs estructurados **sin secretos**.
- Alertas si la tasa de conciliación cae o si hay pico de firmas inválidas (posible ataque).

### 6.5 Seguridad — checklist
- [ ] Tokens y webhook secret **cifrados en reposo** (AES-256-GCM, mismo mecanismo AFIP).
- [ ] `keyVersion` para rotación de clave maestra.
- [ ] Validación de firma `x-signature` obligatoria; sin firma válida no se procesa.
- [ ] `state` CSRF firmado/con TTL en OAuth.
- [ ] Idempotencia en creación (X-Idempotency-Key) y en recepción (WebhookEvent unique).
- [ ] Verificación de importe/moneda antes de asentar.
- [ ] RLS en todas las tablas nuevas (`Connector`, `ConnectorSecret`, `PaymentIntent`, `WebhookEvent`).
- [ ] Guards de rol: solo OWNER/ADMIN conecta/desconecta; permisos de cobro respetan el rol.
- [ ] Ningún secreto en logs (test que lo verifique).
- [ ] Webhook responde 200 en <X ms; trabajo pesado async.

### 6.6 Tests
- Unitarios: crypto, firma de webhook, idempotencia, refresh con rotación.
- Integración: OAuth callback (mock `/oauth/token`), creación de preferencia (mock), webhook → conciliación → asiento (mock `/v1/payments/:id`).
- E2E contra **sandbox de MP** con usuarios de test: vincular, cobrar, pagar, ver conciliado.
- Caso multi-tenant: un tenant **no** puede ver ni conciliar el `PaymentIntent` de otro (test explícito de aislamiento).

---

## 7. Definición de "Terminado" (para el primer release de MP Cobro)

1. Un tenant conecta su cuenta MP en 2 clics; el estado se ve en Integraciones.
2. Desde una factura con saldo, genera link + QR y lo manda por email/WhatsApp en 1 clic.
3. Cuando el cliente paga, la factura queda **conciliada y asentada automáticamente**, y el estado cambia a "Pagado" **en vivo**.
4. Todo el mecanismo (cifrado, OAuth, refresh, webhook, idempotencia) quedó como **patrón `Connector` reutilizable**, con la interfaz `ProviderConnector` lista para que Tiendanube sea "implementar + registrar".
5. Pasa el checklist de seguridad y los tests, incluido el de aislamiento multi-tenant.

---

## 8. Roadmap posterior (mismo patrón, NO en este entregable)

- **MP — traer cobros entrantes** (QR presencial / transferencias) y ofrecer generar factura con 1 clic (el flujo inverso, estilo Colppy). Reusa el mismo connector.
- **Tiendanube:** órdenes → venta/factura, sincronización de stock y catálogo por SKU. Implementa `ProviderConnector`.
- **Mercado Libre:** el más pesado (publicaciones, preguntas, tokens de vida corta). Último.

Cada uno se enchufa sobre la Fase 1 sin tocar el cifrado ni el modelo base.

---

## 9. Notas finales para Claude Code

- **No inventes formatos de API de MP.** Cuando llegues a firmar el webhook o armar la preferencia, seguí la doc oficial vigente de Mercado Pago Developers (Argentina). Si el SDK oficial de Node de MP simplifica algo (firma, tokens), preferilo antes que reimplementar a mano.
- **Reusá, no dupliques:** cifrado (AFIP), servicio de cobro, asientos contables, envío email/WhatsApp, WebSockets por tenant, log de actividad, visor de errores del Backoffice. Todo eso ya existe en OPLEX; este trabajo se **enchufa**, no crea paralelos.
- **Commits por fase**, con migraciones incluidas y tests verdes antes de avanzar.
- Documentá en el PR el resultado del **paso de reconocimiento** (sección 0): cómo está hecho el cifrado de AFIP y el servicio de cobro, para que la revisión confirme que se reusó bien.
