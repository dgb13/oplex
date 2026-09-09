# Plan técnico — Asistente de IA conversacional para Oplex

Documento de trabajo interno. Fecha: 2026-09-09. Autor: diseño de arquitectura, sin código todavía — para que un equipo lo ejecute por fases.

**Stack real de Oplex (confirmado en el repo, completa el contexto del pedido)**:
- Backend: NestJS + Fastify (`apps/api`), organizado en módulos de dominio (`libs/modules/*`) + composition roots por feature (`apps/api/src/app/*`).
- Frontend: Next.js 16 / React 19 (`apps/web`), App Router, Tailwind v4.
- Base de datos: PostgreSQL + Prisma, con Row Level Security nativo como mecanismo real de aislamiento multi-tenant (no solo a nivel de aplicación).
- Hosting de producción: **todavía no decidido** — hoy el proyecto corre en desarrollo local (Docker Compose para Postgres, o Postgres nativo; `nx serve api` / `nx dev web`). Este plan es agnóstico de dónde se despliegue — no depende de un proveedor de nube puntual — pero la Fase 0 debería incluir esa decisión como tarea de infraestructura, en paralelo, sin bloquear el diseño de acá.
- Ya existe un precedente directo de integración con Claude: `libs/modules/ai-invoice-scan` (Carga de Comprobantes IA), con patrón puerto/token de inyección (`ANTHROPIC_CLIENT`), SDK oficial `@anthropic-ai/sdk`, y **tool use ya en producción** (`extract-invoice.tool.ts`, `tool_choice` forzado) — este plan reusa esa misma arquitectura en vez de inventar una nueva.
- El "envío por WhatsApp" que ya existe (`quotesApi.whatsappLink`, `companies.ts`) es un link `wa.me` con texto prellenado — el usuario hace click y manda el mensaje él mismo desde su WhatsApp. **No es una integración de mensajería real** (no hay webhook, no hay número de negocio, no hay bot) — es importante no confundirlo con lo que este plan construye, aunque comparta el canal.

---

## 1. Nombre y posicionamiento

**Decisión de diseño: el nombre NO se hardcodea en ningún lado del código — es una configuración de plataforma editable desde el SuperAdmin, sin deploy.** Esto resuelve de raíz la discusión de qué nombre elegir hoy: se puede arrancar con un default, cambiarlo mañana, o incluso ajustarlo por campaña de marketing, sin tocar código ni base de datos a mano.

**Mecanismo** (mismo patrón exacto que el kill-switch de Carga de Comprobantes IA, `PlatformSettings.aiInvoiceScanEnabled` + `/admin/ai-invoice-scan`):

- `PlatformSettings` gana `assistantDisplayName String?` (fila única global, sin `tenantId`/RLS — mismo criterio que el resto de esa tabla), sembrado con **"Opi"** como default inicial. `null`/vacío (si alguna vez se borra desde el admin) → el frontend y los mensajes de WhatsApp caen a un genérico ("Asistente Oplex") como fallback, nunca un string vacío visible.
- Pantalla nueva `/admin/assistant` (calcada de `/admin/ai-invoice-scan`: mismo `GET`/`PATCH` sobre `PlatformSettings`, mismo layout de formulario) con un campo de texto "Nombre del asistente" — sin necesidad de una entidad ni un endpoint nuevo aparte de extender el DTO ya existente de `PlatformSettings`.
- El widget web y el saludo/firma de los mensajes de WhatsApp leen este valor una vez (cacheado en el cliente, invalidado igual que cualquier otra query de React Query) — en ningún componente aparece "Opi" ni ningún otro nombre hardcodeado; siempre se lee de `PlatformSettings`.

**Nombre elegido: Opi.** Variante corta de "Oplex", suena a apodo cercano más que a nombre de producto — funciona bien tanto en el botón del widget ("Hablar con Opi") como en WhatsApp. Queda como valor sembrado de fábrica, no como texto fijo en el código — cambiarlo después es una edición en `/admin/assistant`, sin deploy.

---

## 2. Arquitectura general

```
┌─────────────────┐     ┌──────────────────┐
│  Chat web (UI)   │     │  WhatsApp Cloud   │
│  apps/web        │     │  API (Meta)       │
│  JWT ya existente│     │  webhook + envío  │
└────────┬─────────┘     └─────────┬────────┘
         │ POST /assistant/message │ POST /webhooks/whatsapp
         │ (JWT auth guard,        │ (firma HMAC Meta,
         │  igual que el resto     │  resuelve teléfono→
         │  de la API)             │  tenant/usuario)
         └───────────┬─────────────┘
                      ▼
      ┌───────────────────────────────┐
      │  Orquestador del asistente     │   apps/api/src/app/assistant/
      │  (composition root nuevo)      │   AssistantService
      │  - resuelve identidad          │
      │    {tenantId, userId, role,    │
      │     moduleAccess} SIEMPRE      │
      │    del contexto autenticado,   │
      │    NUNCA de lo que diga el     │
      │    modelo o el mensaje         │
      │  - arma el system prompt       │
      │    (ayuda vs. datos)           │
      │  - guarda AssistantMessage     │
      │    (historial, RLS)            │
      └───────────────┬────────────────┘
                       ▼
          ┌─────────────────────────┐
          │   Anthropic API         │  @anthropic-ai/sdk,
          │   (Claude, tool use)    │  mismo patrón que
          │                         │  AiInvoiceExtractionService
          └────────────┬────────────┘
                       │ tool_use (nombre + argumentos,
                       │ SIN tenantId/userId - eso no es
                       │ un parámetro que el modelo controle)
                       ▼
      ┌────────────────────────────────────┐
      │  Capa de herramientas (tools)       │  libs/modules/assistant-tools
      │  catálogo cerrado de funciones      │  (o dentro de assistant)
      │  - valida rol/moduleAccess          │
      │  - SIEMPRE corre dentro de          │
      │    withTenantContext(callerTenantId)│  ← acá vive la garantía real
      │  - delega en los Services YA        │
      │    existentes (ReportsSalesService, │
      │    ReceivablesService, PosService,  │
      │    InventoryService, etc.) - no      │
      │    duplica lógica de negocio        │
      └────────────────┬────────────────────┘
                       ▼
              ┌─────────────────┐
              │  PostgreSQL      │
              │  + RLS nativo    │
              └─────────────────┘
```

**Dónde vive cada pieza** (siguiendo la convención ya establecida en el repo):
- `libs/modules/assistant` (lib module, puro): tipos, definiciones de herramientas (`tool` schemas), prompts base, sin dependencias de NestJS pesadas más que las necesarias.
- `apps/api/src/app/assistant/` (composition root, como `apps/api/src/app/memberships/`): orquesta `AssistantService` + `AnthropicClient` (reusa el token `ANTHROPIC_CLIENT` ya existente, o uno paralelo con **API key dedicada** — ver más abajo) + los Services de cada módulo de negocio que las herramientas necesitan.
- `apps/api/src/app/webhooks/whatsapp/` (composition root nuevo, mismo patrón que el webhook de Mercado Pago): endpoint público, firma verificada, resuelve identidad y delega al mismo `AssistantService`.
- Frontend: `apps/web/src/components/AssistantWidget/` (nuevo), consumido desde `AppShell` para que esté disponible en toda la app.

**Por qué un módulo nuevo y no colgarlo de `ai-invoice-scan`**: son capacidades distintas (extracción estructurada de un documento vs. conversación con historial y function calling sobre múltiples módulos) que van a evolucionar a ritmos distintos — mismo criterio ya aplicado en el proyecto para no importar Services entre módulos de dominio.

**API key dedicada**: `ANTHROPIC_ASSISTANT_API_KEY` separada de `ANTHROPIC_API_KEY` (la de Carga de Comprobantes IA). Motivo: son dos consumos de facturación de Anthropic con perfiles de costo y volumen muy distintos (uno es esporádico y por evento — subir una factura —, el otro es conversacional y potencialmente de alto volumen) — separarlas permite ver el gasto de cada una en la consola de Anthropic sin tener que instrumentar nada propio, y cortar una sin afectar la otra si hace falta.

---

## 3. Seguridad y multi-tenancy (la sección más importante)

### 3.1 Cómo se propaga identidad + rol en cada consulta

La regla de oro: **el modelo de IA nunca recibe ni puede fijar `tenantId`/`userId` como parámetro de una herramienta.** Esos valores viajan siempre por el contexto de ejecución del request autenticado, exactamente igual que en cualquier otro endpoint de la API hoy:

- **Canal web**: el JWT ya existente (`AuthService.buildAccessToken`, con `sub`, `tenantId`, `role`, `moduleAccess`) pasa por el mismo `JwtAuthGuard`/`TenantContextInterceptor` que ya usa el resto de la API. `POST /assistant/message` es un endpoint autenticado más — no se inventa ningún mecanismo de auth nuevo.
- **Canal WhatsApp**: no hay JWT porque no hay sesión de navegador. Ver 3.3 para el mecanismo de vinculación — una vez vinculado, el webhook resuelve `{tenantId, userId, role, moduleAccess}` a partir del número de teléfono verificado y arma el mismo objeto de identidad interno que usaría un JWT decodificado. **A partir de ahí, el resto del pipeline (orquestador, herramientas, RLS) no distingue de qué canal vino la pregunta** — es el mismo código.
- Cada llamada a una herramienta ejecuta dentro de `withTenantContext(identity.tenantId, fn)` — el mismo mecanismo que ya usa toda la app para abrir una transacción con `current_setting('app.tenant_id')` seteado. **Esto es lo que hace que el aislamiento sea real y no un chequeo de aplicación que se pueda saltear**: aunque el modelo alucinara o un prompt injection lo empujara a "pedir datos de otro tenant", no hay ningún tool cuyo *input schema* acepte un tenantId — y aunque lo aceptara, la conexión de base de datos de esa ejecución tiene el `tenant_id` de Postgres seteado al del `identity` real, no al que diga el modelo. RLS filtra en la base, no en el prompt.

### 3.2 Autorización por rol/permiso (defensa en profundidad, no solo el catálogo)

Cada herramienta declara qué rol/`moduleAccess` necesita, con el mismo criterio que ya usan los guards de la API (`@Roles(...)`, `@RequireModuleAccess(...)`):

```
saldo_caja            → requiere moduleAccess POS o rol ADMIN/OWNER
deuda_por_cliente     → requiere rol con acceso a Cuentas a Cobrar
estado_resultados     → requiere moduleAccess 'reports-pnl' (igual que hoy)
vencimientos_impositivos → requiere moduleAccess 'taxes' (igual que el contador externo ya tiene)
```

El orquestador filtra el catálogo de herramientas que **le ofrece al modelo** según el rol de quien pregunta (el modelo ni se entera de que existe una herramienta que no puede usar), y además cada handler revalida el permiso server-side antes de ejecutar — igual que un controller HTTP nunca confía en que el frontend ocultó un botón. Doble barrera: catálogo filtrado + revalidación en el handler.

### 3.3 Vinculación y verificación de un número de WhatsApp

Problema real: WhatsApp no tiene "login". Hay que mapear un número de teléfono a un usuario+tenant concreto de Oplex, de forma verificable (que no alcance con escribir "soy fulano").

**Flujo de vinculación** (mismo patrón que ya usa el proyecto para otras verificaciones — reusa la infraestructura de OTP que ya existe para el signup, `OTP_EXPIRY_MINUTES`):

1. Usuario logueado en la web → Perfil/Preferencias → "Vincular WhatsApp" → tipea su número.
2. Backend genera un código corto (6 dígitos, expira en `OTP_EXPIRY_MINUTES`) y le muestra al usuario: *"Mandá este código por WhatsApp a +54 9 11 XXXX-XXXX para vincular tu cuenta"* (el número de Oplex, no el del usuario).
3. El usuario manda ese código como mensaje de WhatsApp al número de Oplex. El webhook lo recibe, valida el código contra el pendiente de ESE usuario/tenant (no contra cualquiera), y si coincide crea `WhatsAppLink { tenantId, userId, phoneE164, verifiedAt }` (RLS estándar, igual que cualquier otra tabla tenant-scoped).
4. A partir de ahí, cualquier mensaje entrante de ese número ya resuelve identidad sin fricción.

**Por qué este orden (código generado en la web, confirmado por WhatsApp) y no al revés**: obliga a que quien vincula el número ya esté autenticado en Oplex con su contraseña real — el WhatsApp por sí solo nunca es suficiente para probar identidad, solo confirma "este teléfono responde a quien generó el código".

**Qué pasa si un número no está vinculado**: el bot responde con un mensaje fijo y seguro (nunca intenta ninguna herramienta) — *"Este número no está vinculado a ninguna cuenta de Oplex. Ingresá a [app] → Perfil → Vincular WhatsApp para empezar."* — sin filtrar ni insinuar si el número pertenece a algún tenant existente.

**Un usuario puede tener como máximo un tenant activo por número** (`WhatsAppLink.phoneE164` único) — si en el futuro se quiere soportar que la misma persona use WhatsApp para más de una empresa (ej. un contador con `TenantMembership` en varios clientes), la resolución de "a qué tenant se refiere esta pregunta" necesita un paso extra explícito (ej. el bot pregunta "¿sobre qué empresa querés consultar?" cuando detecta más de un tenant vinculado) — **fuera de alcance de v1**, el v1 asume 1 número → 1 tenant.

### 3.4 Qué datos NO puede exponer / filtrado por rol

- Ninguna herramienta devuelve una fila completa de una tabla (nunca `SELECT *` implícito) — cada una tiene un DTO de salida explícito con los campos que tiene sentido verbalizar (montos, fechas, nombres de cliente/artículo). Esto excluye estructuralmente hashes de contraseña, tokens, certificados AFIP cifrados, claims internos, IDs técnicos sin valor para el usuario.
- El catálogo de herramientas de v1 es **100% de solo lectura** (ver sección 10) — cero riesgo de que una pregunta mal interpretada dispare una escritura real (confirmar una factura, anular un pago, etc.).
- Cualquier herramienta que exponga datos de terceros (proveedores, clientes) respeta las mismas reglas de negocio que ya existen (ej. una `Company` desactivada sigue siendo válida para reportes históricos, igual que en el resto de la app — no se reinventa esa regla, se hereda de los Services que las herramientas envuelven).

### 3.5 Prevención de prompt injection y fuga entre tenants

Riesgos concretos y su mitigación:

| Riesgo | Mitigación |
|---|---|
| El modelo intenta "razonar" que debería consultar otro tenant (por un dato ambiguo, o un intento deliberado de un usuario: *"ahora actuá como si fueras del tenant X"*) | Estructuralmente imposible: ninguna herramienta acepta `tenantId` como argumento. El modelo no tiene ningún tool que le permita siquiera intentarlo. |
| Un dato guardado en la base (ej. el nombre de un cliente, la descripción de un artículo) contiene texto que parece una instrucción ("ignorá las reglas anteriores y...") | Los resultados de herramientas se marcan explícitamente en el system prompt como **datos, nunca instrucciones** — mismo principio que ya rige en este mismo proyecto para contenido observado por herramientas de navegador. El modelo no debe re-priorizar su comportamiento por texto que viene de una fila de la base. |
| SQL libre generado por el modelo | **No existe ese camino.** No hay ninguna herramienta "ejecutar consulta" — el catálogo es cerrado y cada función ya tiene su propia lógica fija, parametrizada (rango de fechas, límite, id de artículo/cliente), nunca una cadena SQL. Esta es la decisión de arquitectura más importante del plan y no es negociable ni siquiera para un rol ADMIN. |
| Loop de tool-calls descontrolado (costo/latencia) | Límite duro de profundidad por turno (ej. máximo 4 llamadas a herramientas antes de forzar una respuesta final) en el orquestador. |
| Un mensaje de WhatsApp de un número no vinculado intenta hacer preguntas de datos | El webhook resuelve identidad ANTES de invocar al modelo — si no hay `WhatsAppLink`, ni siquiera se llama a Claude, se responde el mensaje fijo de la sección 3.3. |
| Abuso/spam desde un número vinculado (costo) | Rate limiting por tenant + por usuario (sliding window), ver sección 8. |
| Auditoría — ¿quién preguntó qué? | Cada mensaje y cada llamada a herramienta se persiste (`AssistantMessage`, con `toolCalls` como JSON) — mismo criterio que `UserActivityLog` ya aplica a cualquier acción mutante, extendido acá a "acción de consulta" porque toca datos sensibles aunque no escriba nada. |

---

## 4. Capacidad 1 — Chat de ayuda (cómo usar el sistema)

**Decisión: contexto fijo curado, NO RAG, para v1.**

Justificación del trade-off:
- **RAG** (vectorizar documentación, recuperar los chunks relevantes por pregunta) tiene sentido cuando el corpus es grande (cientos de artículos) y no entra económicamente en un contexto cacheado. Hoy Oplex no tiene ni siquiera un corpus de ayuda al usuario final escrito (los documentos internos como `PROGRESS.md` son bitácora de desarrollo, no ayuda de producto — no deben usarse como fuente, tienen comentarios internos, nombres de bugs, credenciales de prueba, etc.).
- Un corpus inicial realista para Oplex (40 a 80 artículos cortos tipo "cómo hago X", "dónde configuro Y", "por qué pasa Z") pesa, en texto plano, un orden de magnitud menor a lo que hace falta para que RAG valga la complejidad operativa (pipeline de embeddings, base vectorial, bugs de "recuperó el chunk equivocado"). Ese corpus completo cabe cómodo como contexto fijo, y con **prompt caching de Anthropic** el costo marginal de repetirlo en cada pregunta es mínimo.
- Ventaja adicional de contexto fijo: el modelo ve *todo* el corpus a la vez, así que puede conectar información de dos artículos distintos en una sola respuesta (ej. "cómo configuro el stock mínimo" + "cómo funcionan las alertas de reposición") sin depender de que un recuperador haya elegido bien los dos chunks correctos.
- **Cuándo migrar a RAG**: cuando el corpus de ayuda supere ampliamente lo que entra cómodo en un contexto cacheado (una señal concreta: cuando cargar todo el corpus empiece a acercarse al límite de contexto del modelo, o cuando el costo de repetirlo deje de ser trivial incluso con caching) — no antes. Anotado como decisión a revisar, no descartada para siempre.

**Cómo se arma y mantiene el corpus**:
- Vive como markdown versionado en el propio repo (`docs/ayuda/*.md`, un archivo por tema/módulo), igual disciplina que el resto de la documentación técnica del proyecto.
- Cada artículo: título, 3-6 párrafos cortos, orientado a tarea ("Cómo hago una nota de crédito" en vez de "Notas de crédito"), con nombres exactos de botones/pantallas tal como aparecen en la UI real (para que la respuesta del asistente pueda decir "andá a Facturación → [factura] → Nueva nota de crédito" literal).
- **Responsable de mantenerlo actualizado**: quien entrega una feature nueva o cambia un flujo existente actualiza el artículo correspondiente como parte de su propio PR — mismo criterio de disciplina que ya aplica el proyecto a `PROGRESS.md`/`RESUMEN.md`. No hay mecanismo automático que detecte que un artículo quedó desactualizado en v1 (ver Fase 4 para una mejora futura: un lint que avise si un artículo menciona una ruta/endpoint que ya no existe).

**Modelo recomendado: Claude Haiku 4.5.** Es una tarea de Q&A sobre texto estático, sin necesidad de razonamiento complejo ni de tool use — el perfil ideal para el modelo más económico y rápido de la familia. Si en producción se detectan preguntas de diagnóstico más finas donde Haiku da respuestas pobres (ej. "por qué me rechaza la letra de la factura", que requiere combinar una regla de negocio con el estado puntual del tenant — en rigor, esa pregunta puede cruzar a Capacidad 2 si necesita mirar datos reales), la mitigación es enrutar esas preguntas a Sonnet 5 o a la Capacidad 2, no subir todo el chat de ayuda a un modelo más caro de entrada.

---

## 5. Capacidad 2 — Consultas de datos de negocio

### 5.1 Arquitectura de tool use (por qué, no cómo)

Cada herramienta es una función TypeScript pura desde la perspectiva del modelo (recibe argumentos tipados, devuelve JSON), pero por dentro:
1. Valida el permiso del `identity` actual contra lo que la herramienta requiere.
2. Ejecuta dentro de `withTenantContext(identity.tenantId, fn)`.
3. Delega en el Service de negocio **ya existente** que resuelve esa misma pregunta hoy en la UI (no se reimplementa lógica de reportes/agregación — se reusa `ReportsSalesService`, `ReceivablesService`, `PayablesService`, `InventoryService`, `PosService`, `ReportsPnlService`, `TaxDeadlineService`, etc.).
4. Devuelve un DTO chico y explícito (nunca la entidad Prisma completa) — controla tanto la superficie de datos expuesta (sección 3.4) como el costo de tokens (sección 8).

### 5.2 Catálogo inicial (v1) — firma y módulo que cubre

| Herramienta | Firma | Envuelve | Permiso requerido |
|---|---|---|---|
| `ventas_por_articulo` | `(desde: date, hasta: date, limite?: number)` | `ReportsSalesService.getSalesByProduct` | moduleAccess `reports-sales` |
| `ventas_por_cliente` | `(desde: date, hasta: date, limite?: number)` | `ReportsSalesService.getSalesByCustomer` | moduleAccess `reports-sales` |
| `facturacion_periodo` | `(desde: date, hasta: date, comparar_periodo_anterior?: boolean)` | Totales de `InvoicingService`/`ReportsPnlService` | moduleAccess `reports-pnl` |
| `deuda_por_cliente` | `(clienteNombreOId?: string)` | `ReceivablesService` (aging) | rol con acceso a Cuentas a Cobrar |
| `deuda_a_proveedores` | `(proveedorNombreOId?: string)` | `PayablesService` (aging) | rol con acceso a Cuentas a Pagar |
| `saldo_caja` | `(cajaId?: string)` | `PosService` (posición en vivo) | moduleAccess POS o rol ADMIN/OWNER |
| `stock_articulo` | `(nombreOSku: string)` | `InventoryService` | moduleAccess Inventario |
| `articulos_stock_bajo` | `()` | `InventoryService` (alertas ya existentes) | moduleAccess Inventario |
| `estado_resultados` | `(desde: date, hasta: date)` | `ReportsPnlService` | moduleAccess `reports-pnl` |
| `vencimientos_impositivos` | `()` | `TaxDeadlineService` | moduleAccess `taxes` |

Cubre Ventas/Facturación, Cuentas a Cobrar/Pagar, Caja/POS, Inventario, Reportes e Impuestos — los módulos con mayor volumen de preguntas esperables según los ejemplos del pedido original. Compras, Contabilidad detallada (libro mayor) y Ajuste por Inflación quedan para Fase 4, priorizados según qué preguntan realmente los usuarios en producción (instrumentar antes de expandir a ciegas).

### 5.3 Formato de respuesta

- **Web**: el modelo devuelve una respuesta corta en lenguaje natural + (cuando la herramienta trae datos tabulares) un bloque de datos estructurado separado que el frontend renderiza como un componente real — tabla o mini-gráfico con `recharts` (ya es dependencia del proyecto, se usa en el Tablero) —, nunca una tabla en markdown crudo dentro del texto. El modelo nunca decide el layout, solo produce el resumen textual; el widget decide cómo mostrar el payload de datos según su forma (serie temporal → gráfico de barras chico; ranking → tabla).
- **WhatsApp**: solo texto — sin componentes. Listas numeradas y montos formateados en el propio texto de la respuesta. (Fase futura, fuera de v1: adjuntar una imagen de gráfico generada server-side para WhatsApp, si se detecta que agrega valor real.)

---

## 6. Integración de WhatsApp

### 6.1 Proveedor: WhatsApp Cloud API oficial de Meta (recomendado), no Twilio

| | Cloud API directa (Meta) | Twilio |
|---|---|---|
| Costo | Precio de Meta por conversación, sin intermediario | Precio de Meta + markup de Twilio |
| Control del webhook | Directo, en la propia infra de Oplex | Pasa por la infra de Twilio primero |
| Curva de arranque | Requiere Meta Business Manager, verificación de negocio | Más asistido/low-code, útil si ya se usa Twilio para otra cosa |
| Coherencia con el proyecto | Igual filosofía que AFIP WSFE (integración directa con el proveedor real, sin intermediario) — precedente ya establecido en el propio código | N/A |

**Recomendación: Cloud API directa.** No hay uso previo de Twilio en el proyecto, y la cultura técnica ya visible en el repo (AFIP WSFE directo, firma PKCS#7 con `node-forge` en vez de shellear a `openssl`) prefiere consistentemente integrar contra la fuente real en vez de una capa intermedia cuando el control adicional lo justifica.

### 6.2 Requisitos

- Cuenta de Meta Business Manager.
- **Para desarrollo/demo**: Meta provee un número de prueba gratuito al crear la app de WhatsApp Business — permite enviar y recibir mensajes reales, pero solo hacia un allow-list corto de números de teléfono que se cargan a mano en el panel de Meta. **Esto alcanza para construir y demostrar el 100% de la integración de WhatsApp sin tener un número comercial propio** (ver roadmap, Fase 5).
- **Para producción real** (clientes de Oplex mandando mensajes desde cualquier número): verificación de negocio en Meta Business Manager + un número de WhatsApp Business propio dado de alta en la plataforma — **este es el único paso que depende de conseguir el número real**, aislado a la última sub-fase.
- **Plantillas pre-aprobadas por Meta**: solo son obligatorias para mensajes que Oplex inicia proactivamente fuera de la ventana de 24hs de una conversación (ej. "tenés 3 facturas vencidas" enviado sin que el usuario haya escrito antes). El flujo de v1 es 100% reactivo (el usuario pregunta, el bot responde dentro de la ventana de 24hs) — **no necesita ninguna plantilla aprobada para arrancar**. Los recordatorios proactivos por WhatsApp quedan anotados como una extensión natural y valiosa, pero fuera de alcance de v1.

### 6.3 Webhooks

- `GET /webhooks/whatsapp`: handshake de verificación de Meta (`hub.challenge`), público.
- `POST /webhooks/whatsapp`: recepción de mensajes entrantes, público pero con **verificación de firma HMAC** (`X-Hub-Signature-256` contra `WHATSAPP_APP_SECRET`) — mismo principio que ya aplica el webhook de Mercado Pago con su propia firma.
- Procesamiento: resolver `WhatsAppLink` por número → armar `identity` → pasar el texto al mismo `AssistantService` que usa el canal web → enviar la respuesta de vuelta vía la API de envío de Cloud API.

### 6.4 Sesión y contexto

WhatsApp no tiene sesión — el "estado de la conversación" hay que persistirlo explícitamente. Se usa la misma tabla `AssistantConversation`/`AssistantMessage` que ya hace falta para el historial del chat web (diseño único para ambos canales, sección 7), scoped por `tenantId`+`userId` con RLS estándar, para que preguntas de seguimiento ("¿y el mes anterior?") tengan el contexto de la pregunta previa sin importar el canal.

### 6.5 Estado en el panel de SuperAdmin

Extiende `AdminSystemStatusService.getStatus()` (patrón ya existente, estructural/barato, sin ping en vivo — ver `checkGroup` para Mercado Pago/email) con una fila nueva:

```
this.checkGroup('whatsapp', 'WhatsApp (asistente)', [
  'WHATSAPP_CLOUD_API_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
]),
```

Verde/rojo por presencia de las 4 variables, igual criterio que las demás filas del panel (nunca valida si el token sigue siendo válido — eso sería una feature aparte, deliberadamente no mezclada acá, mismo comentario que ya deja el propio archivo para las otras integraciones). Mejora opcional de v1.1: una segunda fila indicando si el webhook recibió algo en las últimas N horas (señal de "está conectado de verdad"), sin bloquear v1.

---

## 7. UI/UX del chat in-app

- **Ubicación**: widget flotante (esquina inferior derecha), disponible desde cualquier pantalla vía `AppShell` — patrón estándar de SaaS, no requiere navegar a una sección aparte. El nombre que muestra el botón/header del widget ("Hablar con [nombre]") se lee de `PlatformSettings.assistantDisplayName` (sección 1), nunca hardcodeado — cambiarlo desde `/admin/assistant` se refleja en el acto, sin deploy.
- **Expansión**: al hacer click, se abre como panel lateral deslizante (reusa el mismo patrón visual ya establecido en el proyecto para `InvoiceDetailPanel` — overlay + panel `h-full` con transición, en vez de inventar un tercer estilo de modal/panel).
- **Estado vacío**: sugerencias de preguntas contextuales según la pantalla donde está el usuario (ej. parado en `/purchases`, sugiere "¿qué facturas de compra tengo pendientes?"; en `/pos`, sugiere "¿cuánto tengo en caja ahora?").
- **Envío y respuesta**: streaming token a token (el SDK de Anthropic lo soporta nativamente) para percepción de velocidad, con indicador de "escribiendo…" mientras corren las tool calls intermedias (mostrar de forma liviana "consultando ventas…" cuando el modelo invoca una herramienta, para que la espera no se sienta muerta).
- **Datos**: respuestas de la Capacidad 2 muestran el resumen en texto + el bloque de tabla/mini-gráfico embebido en la burbuja de respuesta (ver 5.3).
- **Historial**: persistente por usuario (`AssistantConversation`), visible al reabrir el widget — no se pierde al navegar entre pantallas ni al cerrar sesión y volver.
- **Feedback**: 👍/👎 por respuesta, guardado para revisión posterior — insumo real para decidir qué artículos de ayuda faltan o qué herramienta de datos priorizar en Fase 4, en vez de adivinar.
- **Indicador de tenant activo**: el widget muestra siempre de qué empresa está respondiendo (relevante en particular para un contador externo con `TenantMembership` activada en un cliente puntual — el asistente debe dejar clarísimo que está respondiendo sobre ESE cliente, nunca mezclando con el estudio propio del contador). No requiere lógica nueva: refleja el mismo tenant del JWT/sesión activa en ese momento.

---

## 8. Modelo de costos

### 8.1 Estimación de consumo por tipo de consulta

- **Chat de ayuda (Haiku 4.5, contexto cacheado)**: el corpus completo de ayuda se manda como bloque cacheado (costo pleno solo la primera vez, luego lectura de caché muy barata) + la pregunta puntual del usuario (decenas de tokens) + una respuesta corta (cientos de tokens). Costo marginal por pregunta: bajo, apto para volumen alto sin fricción de cupo.
- **Consulta de datos (Sonnet 5, tool use)**: 1 a 3 ciclos de ida y vuelta por turno típico (pregunta → tool call → resultado de la herramienta, entre ~200 y 800 tokens de JSON estructurado según el tamaño del resultado → respuesta final). Costo marginal por pregunta: moderado, dominado por el tamaño del resultado de la herramienta — de ahí la regla de diseño de la sección 5.1 (DTOs chicos y explícitos, nunca la entidad completa ni listas sin límite).

### 8.2 Controles de gasto

- **Cupo por plan**, mismo mecanismo ya construido y probado para Carga de Comprobantes IA (`SubscriptionService`/cupos progresivos): un campo nuevo tipo `aiAssistantMonthlyQueryQuota` en `Plan`, configurable desde `/admin/plans` igual que el cupo de IA de facturas — **no se inventa un sistema de billing nuevo, se extiende el que ya funciona en producción**.
- **Rate limiting** por tenant y por usuario (ventana deslizante, ej. N preguntas/minuto) — corta abuso y loops accidentales desde WhatsApp (un número mal configurado que reenvía mensajes en bucle, por ejemplo).
- **Límite duro de profundidad de tool-calls por turno** (ej. 4) — acota el costo máximo de una sola pregunta mal encaminada.
- **Prompt caching** para el corpus de ayuda (Capacidad 1) y para el catálogo de herramientas/system prompt de Capacidad 2 (las definiciones de herramientas no cambian entre preguntas — cachearlas es directo).
- **Panel de costo por tenant** en el Backoffice SuperAdmin (extensión del feed de actividad global ya existente) — mismo principio ya escrito para Carga de Comprobantes IA: "quien usa la IA, paga la IA".

---

## 9. Roadmap por fases

**Principio guía**: todo lo que no dependa del número real de WhatsApp se construye y se demuestra primero. El número real entra recién en la fase final, aislado.

### Fase 0 — Fundaciones (sin conectar Claude todavía)
- Tablas `AssistantConversation`/`AssistantMessage` (RLS estándar).
- Composition root `apps/api/src/app/assistant/`, endpoint `POST /assistant/message` autenticado (JWT ya existente).
- Catálogo inicial de 3-4 herramientas de bajo riesgo (`ventas_por_articulo`, `deuda_por_cliente`, `saldo_caja`) implementadas y testeadas como funciones puras — todavía sin el modelo en el medio, para separar "¿las herramientas están bien?" de "¿el modelo las usa bien?".
- Fila nueva en `AdminSystemStatusService` para la API key del asistente.
- `PlatformSettings.assistantDisplayName` + pantalla `/admin/assistant` (ver sección 1) — el nombre del asistente queda editable desde el día 1, antes incluso de conectar a Claude.
- Decisión de infraestructura de hosting de producción (en paralelo, no bloqueante para el resto del plan).

### Fase 1 — MVP conversacional web: Capacidad 2 primero
- Conectar Claude (Sonnet 5, tool use forzado sobre el catálogo de Fase 0).
- Widget flotante básico (sin streaming ni historial persistente todavía — cada pregunta es un turno independiente).
- **Demo de valor de negocio real, 100% in-app, sin WhatsApp.** Es la fase que más rápido muestra el producto funcionando.

### Fase 2 — Capacidad 1 (chat de ayuda)
- Autoría del corpus de ayuda (40-80 artículos, `docs/ayuda/*.md`).
- Contexto fijo cacheado, modelo Haiku 4.5.
- Detección automática de intención (ayuda vs. datos) en el mismo widget, en vez de pedirle al usuario que elija un modo.

### Fase 3 — Pulido de UX y persistencia
- Historial de conversación real, streaming de respuesta, mini-gráficos con `recharts`, feedback 👍/👎.
- Sugerencias contextuales por pantalla.
- Rate limiting real + cupos por plan integrados al motor de suscripciones.

### Fase 4 — Ampliar catálogo de herramientas
- Nuevas herramientas según qué preguntan realmente los usuarios en Fases 1-3 (instrumentado con el feedback 👎 y logs de preguntas sin herramienta aplicable) — Compras, Contabilidad/libro mayor, Ajuste por Inflación, historial de POS.
- Evaluar en este punto si el corpus de ayuda ya justifica migrar a RAG (ver sección 4).

### Fase 5 — WhatsApp (número real solo en la última sub-fase)
- **5a — Vinculación de número**: flujo de verificación in-app + tabla `WhatsAppLink`. Demostrable con el número de prueba gratuito de Meta.
- **5b — Webhook + Cloud API real**: verificación de firma, resolución de identidad por teléfono, mismo orquestador de Fases 1-4 sin cambios. Demostrable de punta a punta con el número de prueba (mensajes reales, hacia un allow-list corto).
- **5c — Estado en el panel de SuperAdmin**: extensión de `AdminSystemStatusService`.
- **5d — Número de producción (única fase que lo requiere)**: verificación de negocio en Meta, número de WhatsApp Business propio, y — solo si se decide sumar mensajes proactivos (recordatorios de vencimientos, alertas de stock) — plantillas aprobadas por Meta. **Todo el resto del plan (Fases 0 a 5c) ya está construido, probado y demostrable antes de llegar acá.**

---

## 10. Riesgos, límites y qué NO hacer en v1

- **No permitir SQL libre generado por el modelo, bajo ninguna circunstancia**, ni siquiera "solo lectura" ni "solo para ADMIN". El catálogo cerrado de herramientas parametrizadas es la única garantía real de que el aislamiento entre tenants no depende de que el modelo "se porte bien".
- **No dar ninguna herramienta de escritura en v1.** Todo el catálogo es de solo lectura — coherente con el principio ya aplicado en Carga de Comprobantes IA ("la IA precarga, el humano confirma"): acá, directamente, la IA no toca nada.
- **No usar RAG en v1** — complejidad innecesaria hasta que el corpus de ayuda deje de entrar cómodo en un contexto cacheado.
- **No lanzar el asistente sin cupo por plan desde el día 1** de la Fase 1 — el control de costo no es un afterthought de Fase 3, aunque el mecanismo fino (rate limiting, panel de costo) se termine de pulir ahí.
- **Riesgo real — alucinación numérica**: que el modelo redondee o "arregle" un número en la respuesta en lenguaje natural en vez de citar exactamente el valor devuelto por la herramienta. Mitigación de v1: instrucción explícita en el system prompt ("nunca recalcules ni modifiques un número que ya viene de una herramienta, citalo tal cual"); mitigación de fase posterior: un chequeo automático que compare los números mencionados en el texto final contra los que devolvieron las herramientas antes de enviar la respuesta.
- **Riesgo real — confusión de tenant para un contador externo** con `TenantMembership` activa en un cliente: mitigado por el indicador de tenant siempre visible en el widget (sección 7), no por lógica nueva — el asistente ya responde estrictamente sobre el tenant del JWT activo, igual que cualquier otra pantalla de la app.
- **Riesgo real — costo de un loop de tool-calls mal formado**: mitigado por el límite duro de profundidad por turno (sección 8.2).
- **Límite consciente de v1**: no hay mensajes proactivos (recordatorios, alertas) por WhatsApp — todo el flujo es reactivo, precisamente para no necesitar plantillas aprobadas por Meta antes de poder arrancar.
