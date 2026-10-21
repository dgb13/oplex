# Plan — Sección Mercado Pago

Fecha: 2026-10-20 · Mockup: https://claude.ai/artifact/6q3hBtvw9xAH52o3kyKRvG
Sigue a `PLAN_MERCADOPAGO.md` (fases 1–6: conector, OAuth, links, webhook, QR, ya implementadas).

Motivo (pedido del usuario): los clientes no encuentran dónde "Conectar" Mercado Pago, y todo
lo de Mercado Pago está repartido en cinco pantallas. Se junta en una sección propia del menú
que además muestra los cobros con comisiones, neto y fecha de liberación.

## 1. Qué hay hoy (punto de partida)

- **Conexión**: tarjeta "Integraciones" en Preferencias (`apps/web/src/app/preferences/MercadoPagoCard.tsx`).
  El callback de OAuth vuelve a `/preferences?connector=mercadopago&status=...`.
  Conectar/desconectar: OWNER/ADMIN (`mercadopago.controller.ts`). Refresh diario a las 03:00 +
  refresh perezoso a 14 días del vencimiento.
- **Links de pago** (`PaymentIntent` con `documentType` INVOICE/QUOTE): botón "Cobrar con
  Mercado Pago" en Facturación › Gestión (sólo si está conectado), y la acción del asistente.
  Cancelar un link es sólo local (no avisa a MP).
- **QR por caja** (`documentType` POS_QR, API de Orders): activación en Configuración de cajas
  (`RegisterQrModal`), cobro en Caja, "cobros sin venta" (asignar o devolver, devolución total
  por `POST /v1/orders/{id}/refund`).
- **Webhook** (`mercadopago-webhook.service.ts`): pago aprobado de un link de factura →
  `SalesService.recordReceipt` (recibo + asiento + movimiento en la cuenta de dinero).
  Un link de cotización sólo queda PAID, sin recibo.
- **Cuenta de dinero**: los cobros caen siempre en la primera cuenta con proveedor MERCADOPAGO
  (`getOrCreateSystemFinancialAccount`). No hay forma de elegirla.
- **Datos que no tenemos**: comisión, neto y fecha de liberación no se guardan en columnas
  (sólo dentro del JSON `paymentRaw`, y para QR ahí está la orden, no el pago). Nunca se llama
  a `GET /v1/payments/search`, así que hoy no vemos pagos que no nacieron en Oplex.
- **Excel**: patrón con `exceljs` + `StreamableFile` (ej. `pos.controller.ts` › `sessions/export`).

## 2. Cambios respecto al mockup (decidir antes de arrancar)

1. **La tienda online no cobra con Mercado Pago todavía.** El manual lo dice
   (`ayuda/ventas/tienda-online.md`). El mockup muestra "Tienda online" como origen, filtro y
   canal. Propuesta: en esta sección la tienda aparece como **"Próximamente"** y el cobro online
   en la tienda queda como proyecto aparte.
2. **Interruptores de "Dónde cobrás".** Sólo los links de pago necesitan un interruptor nuevo.
   El QR ya se prende y apaga por caja, y el asistente tiene su propio nivel en Preferencias ›
   Asistente › Acciones. Propuesta: el QR muestra la lista de cajas (como en el mockup) y el
   asistente muestra su estado con un acceso a su configuración, para no tener dos
   interruptores del mismo permiso.
3. **"Saldo disponible" no se muestra.** Mercado Pago no tiene consulta de saldo en tiempo
   real (sólo reportes que tardan en generarse). Se muestra "Por liberarse": la suma de los
   cobros aprobados con fecha de liberación futura.
4. **Movimientos que no nacieron en Oplex.** La búsqueda de pagos trae todo lo que entró a esa
   cuenta de Mercado Pago, también lo cobrado fuera de Oplex. Propuesta: se listan con el
   estado "Fuera de Oplex" (no se pueden asignar ni devolver desde acá) y se pueden ocultar
   con un filtro.
5. **Devolver un cobro que ya está en una factura cambia la contabilidad.** Hoy no existe
   "anular un cobro". Devolverlo en Mercado Pago tiene que dejar la factura otra vez con saldo,
   con un asiento y un movimiento de dinero que lo revierta. Si además se devuelve la mercadería,
   la nota de crédito se hace aparte, como hoy. Es la etapa con más riesgo y va última.
6. **Datos del pagador.** Mercado Pago puede devolver nombre y correo de quien pagó. Se guardan
   sólo para mostrarlos en Movimientos (no se cruzan con Empresas). Revisar que el texto de
   Privacidad lo cubra (ver `project-legal-contract`).

## 3. Modelo de datos (una migración)

```prisma
// Copia local de cada pago de la cuenta de MP del tenant (GET /v1/payments/search).
// Sirve para Resumen, Movimientos y Excel sin pegarle a MP en cada pantalla.
model MercadoPagoPayment {
  id                 String    @id @default(uuid())
  tenantId           String
  mpPaymentId        String               // id del pago en MP
  status             String               // approved, refunded, charged_back, ...
  statusDetail       String?
  dateCreated        DateTime
  dateApproved       DateTime?
  paymentMethodId    String?              // visa, account_money, debmaster...
  paymentTypeId      String?              // credit_card, debit_card, account_money...
  installments       Int?
  currency           String
  grossAmount        Decimal  @db.Decimal(14, 2)   // transaction_amount
  feeAmount          Decimal  @db.Decimal(14, 2)   // suma de fee_details
  netAmount          Decimal? @db.Decimal(14, 2)   // transaction_details.net_received_amount
  refundedAmount     Decimal  @db.Decimal(14, 2) @default(0)
  moneyReleaseDate   DateTime?
  moneyReleaseStatus String?
  externalReference  String?
  payerName          String?
  payerEmail         String?
  paymentIntentId    String?              // cruce con nuestro cobro (null = fuera de Oplex)
  raw                Json
  syncedAt           DateTime  @updatedAt

  @@unique([tenantId, mpPaymentId])
  @@index([tenantId, dateCreated])
  @@index([tenantId, moneyReleaseDate])
  @@map("mercadopago_payments")
}

model TenantSettings {                    // + 3 columnas
  mercadoPagoFinancialAccountId String?   // cuenta de dinero para los cobros (null = la de hoy)
  mercadoPagoLinksEnabled       Boolean @default(true)
  mercadoPagoLastSyncAt         DateTime?
}
```

Igual que siempre: SQL a mano, política RLS `tenant_isolation` y `GRANT` a `plexo_app`.

## 4. Permisos

| | Dueño / Admin | Contador | Ventas | Resto |
|---|---|---|---|---|
| Ver la sección en el menú | sí | sí | — | — |
| Resumen y Movimientos, Excel | sí | sí (sólo lectura) | — | — |
| Links de pago (ver, reenviar, cancelar) | sí | — | — | — |
| Configuración, conectar, desconectar | sí | — | — | — |
| Asignar / devolver cobros | sí | — | — | — |

Ventas sigue cobrando como hoy (botón en facturas, QR en Caja) sin ver la sección. Si Ventas
toca un cobro con QR sin conexión, el mensaje dice que le avise al dueño o administrador.

## 5. Etapas

### Etapa 1: Sección y conexión (sin migración)
- Ruta `/mercadopago` y entrada "Mercado Pago" en `NAV_ENTRIES` (OWNER/ADMIN/ACCOUNTANT), con
  la etiqueta "Conectar" cuando no está conectado o "Reconectar" si venció.
- Pantalla sin conectar (mockup 2): botón grande, 3 pasos, aviso de cuenta del negocio, mensaje
  si volvió sin autorizar o hubo error.
- Encabezado con estado y aviso "La conexión venció" con Reconectar.
- El callback de OAuth vuelve a `/mercadopago` en vez de `/preferences`.
- Pestaña Configuración (parte 1): cuenta conectada (quién y cuándo), desconectar, QR por caja
  (lista de cajas con estado; "Crear QR" abre el `RegisterQrModal` de siempre).
- Accesos (mockup 3): la tarjeta de Preferencias pasa a ser un acceso; aviso en el Tablero para
  dueño/admin (se puede ocultar); en Facturación el botón aparece aunque no esté conectado y
  lleva a la sección; en Caja, al elegir QR sin conexión, explica qué falta.

### Etapa 2: Movimientos (migración + sincronización)
- `MercadoPagoPaymentsSyncService`: `GET /v1/payments/search` con el token del tenant, ordenado
  por fecha, paginado (`limit`/`offset`), desde `mercadoPagoLastSyncAt` (la primera vez, 90 días
  hacia atrás). Se dispara con el botón "Actualizar movimientos", cada vez que llega un webhook
  de pago u orden (upsert de ese pago) y una vez por noche para todos los tenants conectados.
  **A confirmar con la cuenta real**: el tope de `offset` de la búsqueda y si los pagos de QR
  (API de Orders) traen `external_reference` = id del `PaymentIntent`, como lo mandamos.
  *Hecho (2026-10-21)*: con la cuenta de prueba de la empresa demo, los pagos de QR sí traen el
  `external_reference` y se cruzan. El tope de `offset` sigue sin confirmar: la sincronización corre
  la ventana de fechas cada 1.000 resultados para no depender de él. La búsqueda no trae el nombre
  de quien pagó, sólo el correo: `payerName` no se guarda.
- Cruce con `PaymentIntent` por `external_reference` / `externalPaymentId` → origen (factura,
  cotización, caja) y estado "En Oplex": Asignado (link al documento o venta), Sin asignar
  (QR pagado sin venta), Devuelto, Fuera de Oplex.
- Pestaña Movimientos: filtros por origen, "Sin asignar" y período; detalle de cada cobro.
  "Asignar a venta" lleva a Caja con el modal de cobros sin venta de esa caja (la asignación
  necesita el borrador de venta guardado, no se rehace acá).
- Exportar a Excel (`exceljs`, mismo patrón que `sessions/export`) con las columnas de la tabla.

### Etapa 3: Resumen
- Cobrado, comisiones, neto y "por liberarse" del período, calculados sobre `MercadoPagoPayment`.
- De dónde vinieron los cobros (caja / links / fuera de Oplex), próximas liberaciones agrupadas
  por día, aviso de cobros con QR sin asignar.
- Todo en moneda del cobro (MP Argentina cobra en ARS; si aparece otra moneda se muestra aparte).

### Etapa 4: Links de pago + Configuración (migración chica)
- Pestaña Links: `PaymentIntent` INVOICE/QUOTE con estado (esperando pago, pagado, vencido,
  cancelado), copiar link, reenviar por correo (reusa `InvoicingService.emailPaymentLink`; para
  cotizaciones hay que agregar el envío), cancelar, generar uno nuevo si venció.
- Cancelar un link también lo invalida en Mercado Pago (hoy es sólo local). **A confirmar** qué
  permite la API de preferencias (vencerla o desactivarla).
- Configuración (parte 2): interruptor de links de pago (`mercadoPagoLinksEnabled`, lo respetan
  el botón de Facturación y la acción del asistente), cuenta de dinero para los cobros
  (`mercadoPagoFinancialAccountId`, la usa `recordReceipt` cuando el método es MERCADOPAGO),
  estado del asistente con acceso a su configuración, tienda "Próximamente".

### Etapa 5: Devoluciones desde Movimientos
- Cobro con QR sin asignar: lo de hoy (`refundCharge`), ahora también desde Movimientos.
- Cobro de un link o de una venta de Caja ya asignado: `POST /v1/payments/{id}/refunds` (total),
  y en Oplex un "cobro devuelto" que revierte el recibo: asiento inverso, movimiento de salida en
  la cuenta de dinero y la factura vuelve a tener saldo. Confirmación con el monto y la
  aclaración de que la nota de crédito, si corresponde, se hace aparte.
- Idempotencia con clave `refund-<mpPaymentId>` y bloqueo de fila, como `refundCharge`.
- Pagos fuera de Oplex: no se devuelven desde acá (se hace desde Mercado Pago).
- Devolución parcial: no en esta etapa.

### Etapa 6: Manual y pruebas
- Artículo nuevo `ayuda/ventas/mercado-pago.md` (sección completa) y actualizar
  `cuenta/preferencias.md`, `ventas/cobrar.md`, `caja/qr-mercado-pago.md`,
  `caja/cobros-qr-sin-venta.md`, `docs/ayuda/mercado-pago.md` (corpus del asistente). Regenerar PDF.
- Pruebas: unitarias del sync (paginado, upsert, cruce), Resumen, permisos por rol y la
  devolución con su asiento. En prod: conectar desde cero con una empresa de prueba, un cobro
  real chico con link y con QR, y su devolución.

## 6. Decisiones del usuario (2026-10-20)

1. Quién ve la sección: Dueño y Administrador completa; Contador sólo Resumen y Movimientos.
2. Devolver cobros desde Movimientos: sí (etapa 5).
3. Exportar Movimientos a Excel: sí (etapa 2).
