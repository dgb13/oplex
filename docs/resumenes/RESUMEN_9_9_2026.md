# OPLEX — Estado, funciones y posición competitiva (09/09/2026)

Documento de trabajo interno. Consolida `RESUMEN.md`, `PROGRESS.md` y `COMPETENCIA.txt` a la fecha de hoy, corrige puntos de esos documentos que quedaron desactualizados, y agrega prioridades concretas para mejorar la competitividad del producto.

---

## 1. Cómo está armada la aplicación

**Monorepo Nx** con dos aplicaciones y una base de datos compartida:

- **API** — NestJS + Fastify (`apps/api`), organizada en "composition roots" por dominio que orquestan módulos de negocio (`libs/modules/*`) y librerías compartidas (`libs/shared/*`). Los módulos de negocio nunca se importan Service-a-Service entre sí: o consultan la tabla directo vía `getTenantDb()` (RLS protege igual), o se componen a nivel `apps/api`.
- **Web** — Next.js 16 / React 19 (`apps/web`), App Router, Tailwind v4 con tema claro/oscuro por clase manual (no solo `prefers-color-scheme`).
- **Base de datos** — PostgreSQL administrado con Prisma. El pilar de seguridad del proyecto es **Row Level Security nativo de Postgres**: cada tabla sensible tiene `tenantId` y políticas que filtran por `current_setting('app.tenant_id')`, con una suite de tests dedicada (`nx run database:test-rls`) que verifica el aislamiento incluso ante bugs de la aplicación. Las 22 relaciones fiscales/financieras más sensibles usan FK compuesta `(tenantId, id)` para que ni una foreign key cruzada entre tenants sea posible a nivel de base (Postgres no aplica RLS a FKs por diseño — hueco cerrado el 2026-08-13).
- **Auditoría y bloqueos fiscales** — triggers de Postgres, no middleware de la app (no se pueden esquivar desde ningún cliente).
- **Multi-tenancy real, no solo lógica**: cada request corre dentro de una transacción con el `tenantId` seteado; los roles de Postgres están separados (`plexo_app`, sin `BYPASSRLS`, para runtime; un rol admin aparte solo para migraciones).

---

## 2. Funciones completas por módulo

### Núcleo de negocio (los 9 módulos del brief original)
- **Inventario**: artículos con variantes (matriz de atributos libres, no solo talle/color fijos), depósitos, movimientos con auditoría, stock mínimo con alertas y sugerencias de reposición, catálogo visual tipo e-commerce con carrito interno persistente (reparte a varios proveedores, propone venta, exporta PDF).
- **Ventas y Facturación**: comprobantes A/B/C y notas de crédito, letra sugerida/forzada automáticamente según condición de IVA, multi-moneda, "conceptos" de factura (Productos/Servicios/Mixto) con reglas AFIP propias, **percepciones/otros tributos por línea** (ARCA `Tributos[]`, WSFE real). Panel de detalle reutilizado, cobros que postean asiento automático.
- **Cotizaciones**: presupuestos con numeración propia, ciclo completo, envío por email/WhatsApp, 5 estilos de PDF.
- **Cuentas a Cobrar**: aging de deuda, estado de cuenta, recordatorios automáticos **recurrentes** (no solo una vez).
- **Compras**: pedido de cotización multi-proveedor con comparador artículo por artículo, órdenes de compra, recepción de mercadería (impacta stock real), facturas y **notas de crédito de compra** (documento propio, no solo devolución física), retenciones a proveedores practicadas en el pago (no en la factura, con las 3 cuentas de pasivo IIBB/Ganancias/IVA).
- **Cuentas a Pagar**: análogo a Cobrar, del lado proveedor.
- **Contabilidad**: plan de cuentas configurable, asientos manuales y automáticos, libro mayor, balance de sumas y saldos, reversión de asientos.
- **Impuestos**: tasas versionadas en el tiempo, regímenes de retención versionados, delegable a un contador externo.
- **Reportes**: Resultados (P&L), Ventas (por cliente/producto, neteando notas de crédito), Financiero (libro de caja/banco).

### Funciones sumadas por encima del brief original (ago–sep 2026)
- **AFIP WSFE real, multi-tenant**: certificado/clave por tenant cifrados (`ENCRYPTION_MASTER_KEY`), CAE real contra el webservice, manejo de errores SOAP detallado. Padrón AFIP (autocompletar por CUIT) es una integración separada. **Pendiente real**: el "camino feliz" con CAE verdadero sigue sin confirmarse — con un certificado autofirmado de prueba, ARCA rechaza correctamente (`cms.cert.blacklist`); falta probar con un certificado real de un tenant en producción.
- **Ajuste por Inflación Contable (RT6/NC39)**: sincronización automática del índice de precios desde `api.argentinadatos.com` (con edición manual que siempre gana), cálculo de RECPAM por el método del activo y pasivo monetario neto, vista previa y **emisión del asiento definitivo con un clic**. Cierra una brecha frente a Colppy (solo en su plan Platinum) y Tango.
- **Conciliación Bancaria semi-automática**: importar extracto (plantilla propia tipo Excel), matching automático por monto + ventana de 3 días, generación de asiento directo para las líneas sin match, e idempotencia por archivo (no se puede reimportar el mismo extracto dos veces).
- **Cobro por Mercado Pago (Checkout Pro)**: link/QR de cobro desde una Factura **o desde un Presupuesto**, conciliación automática vía webhook (firma verificada, reintentos con backoff). Construido de punta a punta pero **no activado en producción todavía** (ver prioridades).
- **Módulo de Caja / POS multi-caja**: apertura/cierre de turno, arqueo con desglose de billetes/monedas real, verificación contra el cierre del turno anterior de la misma caja (con banner de diferencia en vivo), posición de caja consolidada con varias cajas abiertas, 4 temas visuales de mostrador, historial con export a Excel.
- **Carga de comprobantes con IA** (Claude, vision): lee facturas de compra por foto/PDF, híbrido QR-de-ARCA + IA (cabecera exacta del QR, detalle por IA con nivel de confianza 🟢🟡🔴 por campo), "Galería IA" con filtros, cupos progresivos por plan con banner de upgrade, degradación con gracia si la IA no está disponible. **Ya no es una idea — está en producción** (verificado con la API real de Claude el 2026-09-05).
- **Módulo para Estudios Contables — completo (Fases 1, 2 y 3, cerrado 2026-09-05)**: un estudio contable es un tenant más del sistema; puede tener **varios contadores** que acceden a la cartera de clientes con identidad propia y auditable (nunca una cuenta compartida), invitación bidireccional cliente↔estudio con email, permisos por defecto acotados (lectura en Impuestos/Contabilidad/Reportes, escritura solo en Impuestos), cartera consolidada con conteo de facturas del mes y próximos vencimientos, reparto de cartera entre varios contadores del mismo estudio, badge de "Contador externo" en Gestión de Equipo (sin contar contra el cupo de usuarios del plan). **Esto responde directamente al punto "largo plazo" de `COMPETENCIA.txt` — ya no es una apuesta futura, ya está construido.**
- **SLA por plan**, editable desde Admin en Markdown, publicado sin login en `/sla/[planKey]`.
- **Backups automáticos** diarios vía `pg_dump`, visibles en Admin → Configuración del sistema.
- **Backoffice SuperAdmin** (`/admin`): listado de tenants con plan/suscripción/uso, suspender/reactivar/impersonar, gestión de planes y cupos (incluido el cupo de IA), feed de actividad global, visor de errores 5xx, gestión de backups, sincronización del índice de inflación.
- **Funciones transversales**: presencia online, log de actividad con diff campo a campo, emails transaccionales con remitente propio del tenant, export a PDF con varios estilos, enlaces directos a WhatsApp.

### Corrección a documentos anteriores
`RESUMEN.md` listaba como pendiente "una Nota de Crédito de Compra como documento propio" — **ya está resuelto** desde el 2026-08-28 (`PurchaseCreditNote`). Ese documento quedó desactualizado en ese punto puntual.

---

## 3. Comparación detallada con la competencia

Base: `COMPETENCIA.txt` (columna de competidores sin re-investigar desde agosto 2026 — tratar esas celdas como referencia de rango, no como hechos verificados hoy). Se actualiza acá la columna de Oplex y se corrigen dos filas que quedaron desactualizadas en ese documento.

| Eje | Oplex (hoy) | Xubio | Colppy | Contabilium | Tango | Alegra | Odoo+loc.AR |
|---|---|---|---|---|---|---|---|
| Facturación AFIP/ARCA | Sí, WSFE real por tenant (camino feliz sin confirmar en prod) | Sí | Sí | Sí | Sí | Sí | Sí (comunidad) |
| Letra de comprobante automática | **Sí** (diferencial) | No confirmado | No confirmado | No confirmado | Manual | No confirmado | Manual |
| Ajuste por inflación (RT6/NC39) | **Sí, automático con RECPAM** | No confirmado | Sí (solo Platinum) | No confirmado | Sí | No confirmado | Parcial |
| Conciliación bancaria | Semi-automática (plantilla propia) | No confirmado | Sí, automática (Platinum) | No confirmado | Sí | No confirmado | Sí |
| Cartera de cheques | Sí | Sí | Sí | Sí (Tesorería) | Sí | No confirmado | Parcial |
| Cobro Mercado Pago | Sí, desde Factura o Presupuesto (**no activado en prod**) | No confirmado | Sí | Sí, fuerte | No nativo | No confirmado | Sí (módulo) |
| Integración e-commerce (ML/Tiendanube) | **No** (diseño aprobado, sin código — `PLAN_TIENDANUBE.md`) | Sí | Sí (vía MP) | Sí, fuerte (ML/TN/Shopify) | No nativo | No confirmado | Sí (módulo) |
| Multi-punto de venta / POS | **Sí, con verificación de arqueo contra turno anterior** (diferencial no visto en la competencia) | No confirmado | Sí (Enterprise) | Sí | Sí | No confirmado | Sí |
| Automatización con IA (OCR de comprobantes) | **Sí, en producción** (QR+IA híbrido, transparencia de origen/confianza por campo) | No confirmado | No confirmado | No confirmado | No confirmado | No confirmado | No (Bejerman sí) |
| Panel multi-cliente para estudios contables | **Sí, completo** (varios contadores, identidad propia, cartera consolidada, vencimientos) | Cortejan este público, sin confirmar el mecanismo | Cortejan este público, sin confirmar el mecanismo | No confirmado | No confirmado | No confirmado | No confirmado |
| Aislamiento de datos a nivel de DB (RLS) | Sí, verificado con tests dedicados | No publicado | No publicado | No publicado | No aplica | No publicado | No publicado |
| Nómina / sueldos | No | No confirmado | Sí (add-on) | No confirmado | Sí | No confirmado | Sí (módulo) |
| App móvil nativa | No (web responsive) | No confirmado | Sí (iOS/Android) | No confirmado | No confirmado | No confirmado | Sí |

**Filas corregidas respecto a `COMPETENCIA.txt`** (ese documento no se actualizó tras las sesiones del 2026-09-04/05):
- *Automatización con IA*: pasó de "No" a **Sí, en producción**. Con esto Oplex es, entre los competidores investigados, el único (junto a Bejerman) con esto resuelto — y con transparencia de origen/confianza por campo, que ni Bejerman publicita.
- *Panel para estudios contables*: `COMPETENCIA.txt` lo listaba como oportunidad de "largo plazo, apuesta diferencial". **Ya está construido y probado de punta a punta.** Es hoy el diferencial más grande y menos explotado comercialmente del producto.

---

## 4. Prioridades — qué resolver para mejorar y competir

Ordenadas por impacto/esfuerzo, no por fecha.

### Prioridad 1 — Destrabar lo ya construido (no es código nuevo)
1. **Activar Mercado Pago en producción.** El flujo OAuth + checkout + conciliación está terminado; solo falta un túnel público (ngrok/cloudflared) para el callback en desarrollo y resolver un error del lado del panel de MP al activar credenciales reales. Es la brecha más barata de cerrar de toda la lista.
2. **Confirmar el camino feliz de AFIP con un CAE real.** Todo el código está probado hasta el límite de "certificado autofirmado rechazado por ARCA, como corresponde" — falta un certificado real de un tenant real para la prueba final. Sin esto, el diferencial más fuerte del producto (facturación AFIP integrada) no está 100% verificado en producción.
3. **Explotar comercialmente el módulo de Estudios Contables.** Está completo (Fases 1-3) pero no aparece mencionado como diferencial en ningún material — es exactamente el público que más paga en este mercado (Colppy/Xubio lo cortejan) y es donde la arquitectura de Oplex (RLS real, identidad por contador, auditoría) ya es más sólida que la de casi todos los competidores investigados. Prioridad de marketing/ventas, no de desarrollo.

### Prioridad 2 — Cerrar brechas visibles en la primera demo
4. **Tiendanube Fase 1.** Diseño ya aprobado (`PLAN_TIENDANUBE.md`), sin una línea de código. Es la brecha de e-commerce más citable frente a Contabilium.
5. **Parsers nativos por banco** para conciliación (hoy plantilla propia tipo Excel) — cierra el último tramo de fricción real de esa función.
6. **Nota de crédito de compra ya resuelta** — no es un pendiente, pero conviene que `RESUMEN.md` y material de venta lo reflejen (documento fuente ya corregido en la sección 2 de este resumen).

### Prioridad 3 — Diferenciales nuevos a evaluar
7. **Chatbot / asistente de consultas en lenguaje natural** ("¿qué artículos están en stock?", "¿qué proveedor tiene facturas por cobrar?"). Confirmado con el usuario: **no existe ningún plan escrito para esto todavía** (ver conversación previa). Es una oportunidad real y de bajo costo incremental: la infraestructura de IA (Claude, cifrado de credenciales, cuota por plan, patrón puerto/stub/real) ya existe de la sesión de Carga de Comprobantes IA y se puede reusar casi 1:1 — la pieza nueva sería mapear la pregunta del usuario a consultas seguras bajo RLS (nunca SQL libre generado por IA contra la base real, por el mismo criterio de seguridad que ya rige todo el proyecto) y devolver una respuesta en lenguaje natural. Ningún competidor investigado lo tiene confirmado salvo Bejerman ("analista en lenguaje natural", sin detalle público). Recomendación: documentar un plan dedicado (mismo formato que `plan-carga-comprobantes-ia.md`) antes de codear, definiendo el alcance de consultas soportadas y cómo se evita que la IA invente datos.
8. **Sincronización de stock/pedidos con Mercado Libre** (no solo cobro) — gancho comercial fuerte de Contabilium para retail.
9. **PWA instalable con notificaciones push** (alertas de stock, facturas vencidas) — más barato que una app nativa.
10. **Módulo de nómina básico o integración con un proveedor externo vía API** — venta cruzada real, sin construir el módulo regulado (SICOSS) desde cero.

### Deuda técnica y notas operativas (no competitivas, pero cuestan tiempo si se ignoran)
- `SubscriptionService.getAiInvoiceScanUsage()`/`getCurrentForTenant()` asumen que **todo tenant tiene una suscripción** (`findUniqueOrThrow`) — correcto como invariante de producción (todo alta real crea una), pero cualquier script de seed/provisioning nuevo que no la incluya va a manifestarse como un 500 genérico en vez de un mensaje claro. Vale la pena un chequeo de esta invariante en el pipeline de alta de tenants si en algún momento se agrega otro camino de creación de tenants además de signup/admin.
- `purchases:typecheck` y `tenant-settings:typecheck` tienen fallos preexistentes en archivos de test (JSX sin configurar en 3 `.spec.tsx`, mock desactualizado) — no afectan el build real, pero conviene limpiarlos para que `typecheck` vuelva a ser una señal confiable de todo el monorepo.
- Ambigüedad de `createMany` con `tenantId` explícito vs. FK compuesta (documentada en detalle en `PROGRESS.md`, resuelta caso por caso) — cualquier código nuevo que agregue una relación fiscal/financiera más a la lista de FK compuesta debe revisar el tipo generado de Prisma a mano, no asumir el patrón por analogía.

---

## 5. Una frase de síntesis

Oplex ya cubre, con profundidad real (no solo "checkbox"), la mayoría de las funciones que un contador o una pyme argentina espera de un ERP cloud — y tiene dos diferenciales construidos y probados que **ningún competidor investigado iguala hoy**: automatización con IA transparente (origen/confianza por campo) y un panel multi-cliente para estudios contables con identidad y aislamiento reales por RLS. El techo de corto plazo no es escribir más funciones — es **activar y visibilizar comercialmente lo que ya está terminado** (Mercado Pago, AFIP en producción, el módulo de estudios contables) antes de sumar superficie nueva.
