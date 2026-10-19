# Plan — Asistente IA, fase 2: gestión y acciones

Fecha: 2026-10-19 · Mockup: https://claude.ai/artifact/QeR9gMYFxGWgAFPnNcGqCu
Sigue a `plan-asistente-ia-conversacional.md` (fases 0–5b, ya implementadas).

## 1. Qué hay hoy (punto de partida)

- `apps/api/src/app/assistant/`: router de intención (ayuda/datos), servicio de ayuda,
  orquestador con tool use (`chatStream`), historial por usuario, cupo por plan y
  rate limit (`PlatformSettings`), feedback 👍/👎, reporte de "sin responder" en /admin.
- 4 herramientas de sólo lectura (`assistant-tools.catalog.ts`): `ventas_por_articulo`,
  `deuda_por_cliente`, `saldo_caja`, `stock_articulo`. Cada una valida rol/módulo con
  reglas fijas en código (`RECEIVABLES_READ_ROLES`, `POS_READ_ROLES`, módulo `reports-sales`).
- WhatsApp: `WhatsAppWebhookService` resuelve el usuario por teléfono y usa el mismo
  pipeline que la web. `WhatsAppCloudApiClient` sólo sabe `sendText` (texto libre).
- `AssistantMessage` **no guarda el canal** (web/WhatsApp) ni si una consulta se bloqueó.
- El tenant no tiene ninguna configuración propia del asistente: todo es de plataforma.

## 2. Lo que vale la pena saber antes de arrancar (cambios respecto al mockup)

Esto sale de revisar el código. Cada punto es un desvío del mockup o un dato del mundo real
que hay que confirmar, así que va primero para decidirlo antes de implementar.

1. **No hay listas de precios por cliente.** El mockup dice "lista Mayorista del cliente";
   en Oplex la cotización usa el precio de venta del artículo. La acción "Crear cotización"
   va a usar ese precio. Si se quieren listas, es un módulo aparte.
2. **Roles: el sistema tiene 7, el mockup muestra 5 columnas.** Propuesta:
   Dueño = OWNER + ADMIN (siempre todo, celda bloqueada), Ventas = SALES, Compras = PURCHASES,
   Depósito = INVENTORY, Contable = ACCOUNTANT, **y una 6.ª columna "Consulta" (VIEWER)**,
   que arranca sólo con "Ayuda de uso".
3. **La matriz no puede dar más permiso que el rol.** Ejemplo: hoy Contable no puede ver
   caja (`saldo_caja` exige OWNER/ADMIN/SALES) y el mockup lo muestra prendido. Esas celdas
   se ven grises con el motivo ("el rol Contable no tiene acceso a Caja").
4. **Correos: hoy sólo existe "enviar cotización por correo".** Reenviar una factura o mandar
   un resumen de cuenta por correo no existen todavía (el resumen de cuenta sólo sale en Excel).
   La acción "Enviar un correo" arranca sólo con cotizaciones; factura y resumen de cuenta
   quedan para una etapa posterior.
5. **"Preparar factura" no guarda un borrador en la base.** Hoy una factura se emite al crearla
   (no se usa el estado DRAFT). El asistente arma los datos y devuelve un link a
   *Nueva factura* con todo precargado; la persona revisa y emite desde la web. ARCA nunca
   se llama desde el asistente.
6. **WhatsApp a terceros y avisos programados (A CONFIRMAR con la cuenta de Meta).**
   El número de WhatsApp es el de Oplex, no el de cada empresa. Hasta donde sé, WhatsApp
   sólo permite texto libre dentro de las 24 h desde el último mensaje de esa persona. Fuera
   de esa ventana exige plantillas aprobadas por Meta. Consecuencias:
   - **Link de pago "por WhatsApp al cliente"**: le escribiría al cliente el número de Oplex.
     Propuesta: el link sale por **correo**, o el asistente le devuelve el link a quien lo
     pidió (como hace hoy el botón de WhatsApp de cotizaciones) para que lo reenvíe.
   - **Resumen de la mañana**: necesita una plantilla aprobada en Meta. Hasta tenerla,
     sólo llega a quien le escribió al asistente en las últimas 24 h, o por correo.
7. **Retención del historial: 12 meses** (como dice el mockup). A confirmar.

## 3. Modelo de datos (una migración)

```prisma
enum AssistantChannel { WEB WHATSAPP }   // SCHEDULED vuelve con el resumen de la mañana

model AssistantMessage {           // + 2 columnas
  channel        AssistantChannel?  // null = mensajes de antes de esta fase
  blockedTopic   String?            // tema que se negó por permisos (Historial › Bloqueadas)
}

// Configuración del asistente por empresa. Una fila por tenant, get-or-create con
// defaults explícitos en código (los mismos que muestra la pantalla).
model AssistantTenantConfig {
  id                    String  @id @default(uuid())
  tenantId              String  @unique
  webEnabled            Boolean @default(true)
  whatsappEnabled       Boolean @default(true)
  dailySummaryEnabled   Boolean @default(false)
  salesOwnDataOnly      Boolean @default(true)
  topicsByRole          Json    // { ventas: ["SALES","ACCOUNTANT"], ... }
  actionLevels          Json    // { quote: "DRAFT", reminder: "DIRECT", ... }
  actionRoles           Json    // { quote: ["SALES"], ... }  (OWNER/ADMIN siempre)
  maxQuoteAmountWhatsapp Decimal? @db.Decimal(14, 2)
  maxActionsPerDay      Int     @default(40)
  confirmExpiryMinutes  Int     @default(10)
  updatedAt             DateTime @updatedAt
  @@map("assistant_tenant_config")
}

enum AssistantActionKind   { QUOTE_CREATE QUOTE_EMAIL PAYMENT_LINK INVOICE_PREPARE REMINDER_CREATE CUSTOMER_CREATE }
enum AssistantActionStatus { PENDING_CONFIRMATION DONE EXPIRED CANCELLED UNDONE FAILED }

// Una fila por acción propuesta o hecha: es lo que muestra el Historial y lo que se deshace.
model AssistantAction {
  id             String  @id @default(uuid())
  tenantId       String
  conversationId String
  messageId      String?           // respuesta del asistente que la propuso
  userId         String            // quién la pidió
  channel        AssistantChannel
  kind           AssistantActionKind
  level          String            // DRAFT | DIRECT, el que regía al proponerla
  status         AssistantActionStatus
  payload        Json              // qué se va a hacer (cliente, líneas, fecha...)
  summary        String            // "Cotización a Delta por $ 128.400" (para la tabla)
  entityType     String?           // lo que se creó: "quote", "company", "calendar_event"...
  entityId       String?
  expiresAt      DateTime?
  confirmedAt    DateTime?
  undoneAt       DateTime?
  undoneByUserId String?
  errorMessage   String?
  createdAt      DateTime @default(now())
  @@index([tenantId, createdAt])
  @@index([tenantId, userId, status])
  @@map("assistant_actions")
}
```

Las tres tablas llevan la política RLS por `tenant_id`, como el resto.
JSON y no tablas normalizadas para la matriz: son ~7 temas × 6 roles; se validan con un
esquema en el servicio y las claves desconocidas se descartan.

## 4. Etapas

Rama: `feat/asistente-gestion-acciones`. Cada etapa se puede mergear y desplegar sola.

### Etapa 1: Historial (sólo lectura + canal)

- **API**
  - Guardar `channel` en `appendMessage`: el controller pasa `WEB` y el webhook `WHATSAPP`.
  - `GET /assistant/admin/history?filter=todo|wa|web|acciones|bloq&cursor=` (OWNER/ADMIN):
    une mensajes y acciones de **todos los usuarios del tenant**, con quién, rol, canal,
    pedido, qué hizo y estado. El detalle trae la conversación de ese turno y las herramientas usadas.
  - `GET /assistant/admin/stats-today`: consultas hoy, acciones hechas, esperando "SÍ", bloqueadas.
  - Scheduler: borra mensajes y acciones de más de 12 meses (en `apps/api/src/app/scheduler/`).
- **Web**
  - Ruta nueva `/preferences/assistant`, con tarjeta de acceso desde Preferencias y el
    mismo permiso que Preferencias (OWNER/ADMIN).
  - Pestaña Historial igual al mockup: contadores, chips de filtro, tabla, "Ver detalle".
    "Deshacer" aparece desde la etapa 3.

### Etapa 2: Temas por rol + canales

- **Temas → herramientas** (en código, no configurable):

  | Tema | Herramientas |
  |---|---|
  | Ventas y facturación | `ventas_por_articulo` |
  | Deudas de clientes | `deuda_por_cliente` |
  | Caja y bancos | `saldo_caja` |
  | Stock y precios | `stock_articulo` |
  | Costos y márgenes | **nueva** `costo_articulo` (costo, precio, margen) |
  | Compras y proveedores | **nueva** `compras_resumen` (OC abiertas + deuda con proveedores, de payables) |
  | Ayuda de uso | servicio de ayuda (si está apagado, el router responde "no tenés permiso") |

- **El filtro va en el servidor**: `chatStream` recibe la lista de tools ya filtrada para
  el usuario (tema permitido por la empresa **y** permiso real del rol). Si un rol no tiene
  el tema, el modelo ni siquiera recibe esa herramienta. `executeAssistantTool` vuelve a
  validar por si acaso.
- **Consultas bloqueadas**: si la pregunta cae en un tema apagado, se contesta
  "No tenés permiso para ver X…" y se guarda `blockedTopic` para el Historial. Se detecta
  sumándole `topic` al clasificador de intención que ya existe (misma llamada a Haiku).
- **"Ventas ve sólo sus propias ventas"**: `ventas_por_articulo` filtra por
  `Invoice.issuedByUserId`, que ya existe; hace falta un parámetro opcional en
  `ReportsSalesService.getSalesByProduct`. `deuda_por_cliente` se limita a los clientes
  con facturas emitidas por ese usuario.
- **Canales**: con la web apagada se oculta el widget (el endpoint devuelve 403). Con
  WhatsApp apagado, el webhook contesta "El asistente por WhatsApp está desactivado en tu empresa".
- **API**: `GET/PATCH /assistant/config` (OWNER/ADMIN). Devuelve la matriz más, por celda,
  si el rol *puede* tenerla y, si no puede, el motivo.
- **Web**: pestaña "Temas por rol" igual al mockup, con la columna Consulta agregada
  (punto 2.2) y las celdas grises (punto 2.3).

### Etapa 3: Motor de acciones

La regla central: **el modelo propone, el servidor ejecuta**. Una herramienta de acción
nunca crea nada por su cuenta; llama a `AssistantActionsService.propose(kind, input)`, que:

1. Valida, en este orden: acción no apagada, rol habilitado para la acción, permiso real del
   rol (los mismos `@Roles` del endpoint HTTP equivalente), topes (monto por WhatsApp,
   acciones por día de la empresa).
2. Resuelve las entidades por nombre (cliente, artículos). Si hay más de una coincidencia,
   devuelve las opciones al modelo para que pregunte. Nunca elige solo.
3. Arma la vista previa con números calculados por el servidor, no por el modelo.
4. Si la acción está en **Borrador**: crea la `AssistantAction` en `PENDING_CONFIRMATION`
   con `expiresAt` y le dice al modelo que pida "SÍ". Si está en **Directa**: ejecuta, deja
   la acción en `DONE` y la marca como deshacible.

**Confirmación determinística**:
- WhatsApp: si el mensaje que entra es "sí / si / dale / ok / confirmo" y ese usuario tiene
  una acción pendiente sin vencer, se ejecuta **sin pasar por Claude**. Así el modelo nunca
  puede autoconfirmarse. "No / cancelar" la cancela.
- Web: el widget muestra los botones **Confirmar / Cancelar** (endpoint
  `POST /assistant/actions/:id/confirm|cancel`).
- Hay una sola acción pendiente por usuario: una propuesta nueva cancela la anterior.
  Al vencer pasa a `EXPIRED`, sin enviar nada.

**Ejecución**: reusa los servicios existentes dentro del contexto del tenant y del usuario
(igual que hoy):

| Acción | Niveles posibles | Ejecuta con | Deshacer |
|---|---|---|---|
| Agendar recordatorio o tarea | Apagada / Borrador / Directa | `CalendarEventService.create` (TASK si se asigna a otro) | borra el evento |
| Cargar cliente nuevo | Apagada / Borrador / Directa | `CompaniesService.lookupAfip` + `createCompany` | borra el cliente si no tiene documentos |
| Crear cotización | Apagada / Borrador | `QuoteService.create` (precio de venta del artículo, punto 2.1) | `QuoteService.cancel` |
| Enviar cotización por correo | Apagada / Borrador | `QuoteService.sendEmail` | no se puede (ya salió) |
| Link de pago | Apagada / Borrador | `MercadoPagoPaymentService.createPaymentLink` (+ correo, punto 2.6) | `cancelPaymentLink` si no se pagó |
| Preparar factura | Apagada / Borrador | link a *Nueva factura* precargada desde `payload` (punto 2.5) | no aplica |

- Cada acción hecha se anota en **Actividad** ("Cotización 0045 creada por el Asistente a
  pedido de Martín Ruiz"). `ActivityLogService` hoy no tiene un método para escribir
  directo (lo hace el interceptor HTTP), así que se le agrega `record()`.
- `POST /assistant/actions/:id/undo` (OWNER/ADMIN, o quien la pidió) para las acciones
  deshacibles.
- Pestaña **Acciones** de la web igual al mockup: niveles, roles por acción, topes y la
  vista previa de WhatsApp. Los niveles que una acción no admite se ven deshabilitados,
  con el motivo.
- Defaults: todo **Apagado**, salvo recordatorio en Borrador. Cada empresa lo prende a
  propósito; nada se activa solo.

Orden interno: recordatorio y cliente primero (internos, fáciles de probar), después
cotización y correo, después link de pago y al final preparar factura.

### Etapa 4: Resumen de la mañana (EN PAUSA, decisión 2026-10-19)

- Cron diario 08:00 (hora de Argentina) en `apps/api/src/app/scheduler/`.
- Destinatarios: usuarios OWNER/ADMIN/ACCOUNTANT con WhatsApp vinculado y con los temas
  correspondientes permitidos.
- El texto se arma **sin modelo**, con las mismas herramientas (ventas de ayer, facturas
  vencidas, stock bajo mínimo): cero costo de IA y cero riesgo de inventar números.
- Se guarda con `channel = SCHEDULED`.
- Depende de la plantilla de Meta (punto 2.6): esta etapa queda frenada hasta resolver eso.

### Etapa 5: Manual y pruebas

- Tests: `propose` (cada validación), confirmación determinística (incluido "un SÍ sin
  pendiente no hace nada"), vencimiento, undo, filtro de tools por rol y aislamiento entre
  tenants en historial y acciones.
- Manual: capítulo "Asistente: historial, permisos y acciones" + regenerar el PDF.
- `docs/ayuda/asistente-ia.md`: qué puede hacer y cómo pedirlo.

## 5. Seguridad (no negociable, igual que la fase 1)

- `tenantId` y `userId` salen siempre de la sesión o del teléfono vinculado; ninguna tool
  los recibe del modelo.
- Cada acción valida el permiso real del rol en el servidor, aunque la matriz diga que sí.
- Nada sale hacia un cliente (correo, link) sin un "SÍ" explícito de una persona.
- ARCA nunca se llama desde el asistente.
- Topes por empresa y rate limit actual, antes de gastar en Claude.

## 6. Decisiones del usuario (2026-10-19)

1. Columna "Consulta" (VIEWER): **sí**.
2. Link de pago: **se le manda al cliente** para que lo pague él. Como WhatsApp no deja
   escribirle desde el número de Oplex, sale **por correo** al email del cliente.
3. Resumen de la mañana: **fuera por ahora** (la etapa 4 queda en pausa).
4. Historial: **se queda, 12 meses**. No depende de Meta: es una tabla interna; las
   plantillas sólo hacen falta para *iniciar* mensajes de WhatsApp.
