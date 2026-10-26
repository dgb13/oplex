# Plan — Rubros, Fichas del cliente y Órdenes de trabajo

Fecha: 2026-10-26 · Mockup: https://claude.ai/artifact/JoRnvP9ufE52gqHHNNnh8y
Origen: prueba de Oplex como taller mecánico (2026-10-25, tenant de prueba local "Taller Mecánico
El Pistón (PRUEBA)").

Motivo (pedido del usuario): que un taller tenga patente, kilómetros y órdenes de trabajo, sin que
una farmacia o un kiosco vean esos campos. Los rubros son muchos (almacén, kiosco, dentista,
metalúrgica, zapatería…), así que **no se programan uno por uno**: se administran desde `/admin`
como plantillas, y por debajo hay piezas genéricas que cada rubro configura.

## 1. Qué hay hoy (punto de partida)

- **Menú** (`apps/web/src/components/AppShell.tsx`): `NAV_ENTRIES` filtrado por rol (`roles`),
  por permiso de módulo (`module` contra `UserModuleAccess.canRead`) y por plan
  (`plan.productionModuleEnabled`, `plan.storefrontEnabled`). No hay noción de "módulo apagado por
  el negocio".
- **Plan**: el corte por plan de Producción también está en el backend
  (`subscription.service.ts:213`). Es el modelo a copiar para cortar módulos nuevos del lado del API.
- **Alta** (`signup.service.ts` → `TenantProvisioningService.provision`): crea Tenant + User +
  prueba gratis. No pregunta rubro, condición frente al IVA ni sucursal.
- **Clientes**: `Company` con `CompanyRole` (CUSTOMER/SUPPLIER/BRANCH). `CompanyIndustry` es un
  enum chico para clasificar **clientes**, no al propio negocio. No hay entidad "bien del cliente".
- **Artículos**: `UnitOfMeasure` = KG/LTR/MM/M2/UNIT (no hay hora). `ArticleVariant.attributes`
  es JSON libre (código original, vehículo, etc.).
- **Cotizaciones**: DRAFT → SENT → ACCEPTED/REJECTED; `QuoteLine.notes` y `discountPercent`.
  `createInvoiceFromQuote` las pierde (ver etapa 0).
- **Agenda**: `CalendarEvent` ya tiene `linkType`/`linkId` → un turno se puede enlazar a una orden
  de trabajo sin tocar el modelo.
- **Facturas**: `InvoiceLine` exige `articleVariantId` y no tiene descripción propia.

## 2. Bugs encontrados en la prueba del taller (etapa 0, independientes)

| # | Bug | Dónde |
|---|-----|-------|
| B1 | Cotización → factura pierde `discountPercent`, `taxKind/taxRate` de cada línea y las notas | `apps/api/src/app/sales/sales.service.ts` `createInvoiceFromQuote` + `ConvertQuoteToInvoiceModal.tsx` |
| B2 | Cliente con DNI se manda a ARCA como CUIT (DocTipo 80); falta DocTipo 96. El PDF rotula "CUIT" | `afip-wsfe-client.ts` `resolveDocTipoNro`, plantillas PDF |
| B3 | `GET /quotes/:id/whatsapp-link` sin `?phone` → 500 | `quote.controller.ts` / `quote.service.ts` `buildWhatsappLink` |
| B4 | Si la variante tiene `attributes`, la marca desaparece de la etiqueta → dos marcas del mismo repuesto se ven iguales | `apps/web/src/lib/inventory.ts` `buildVariantLabel` (y su par en el PDF) |
| B5 | ~~Se pueden crear dos clientes con el mismo DNI/CUIT sin aviso~~ **Descartado**: la pantalla (`CompanyFormModal` collisionCheck) y la importación ya lo frenan; la prueba lo creó salteando la pantalla, directo contra el API | — |
| B6 | `creditLimit` se guarda pero no frena ni avisa al vender | ventas / caja |
| B7 | Onboarding: la lista de primeros pasos no pide condición frente al IVA ni certificado ARCA; sin eso no se puede bajar el PDF de una cotización ni facturar | `OnboardingChecklist.tsx` |

B2 conviene probarlo contra homologación antes de dar por bueno el arreglo.

## 3. Modelo de datos

### 3.1 Catálogo de rubros (plataforma, sin `tenantId`, igual que `Plan`)

```prisma
model BusinessTemplate {
  id          String   @id @default(uuid())
  key         String   @unique          // "taller-mecanico"
  name        String                    // "Taller mecánico"
  family      String                    // "Automotor" (lista fija en código)
  iconKey     String                    // nombre de ícono lucide-react
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  version     Int      @default(1)      // última versión publicada
  draft       Json?                     // edición en curso, sin publicar
  versions    BusinessTemplateVersion[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@map("business_templates")
}

model BusinessTemplateVersion {
  id          String   @id @default(uuid())
  templateId  String
  template    BusinessTemplate @relation(fields: [templateId], references: [id])
  version     Int
  config      Json     // ver 3.2
  publishedAt DateTime @default(now())
  publishedBy String?
  @@unique([templateId, version])
  @@map("business_template_versions")
}

model BusinessTemplateRequest {        // "Pedir que lo agreguen" desde el alta
  id        String   @id @default(uuid())
  tenantId  String?
  text      String
  status    String   @default("NEW")   // NEW / DONE / DISCARDED
  createdAt DateTime @default(now())
  @@map("business_template_requests")
}
```

### 3.2 Forma de `config` (validada con un DTO en el API, no JSON libre sin control)

```ts
{
  modules: ModuleKey[];                 // prendidos por defecto
  assetType?: { name: string; fields: AssetFieldDef[]; notice?: string };
  workOrder?: { docName: string; statuses: { name: string; final?: boolean; notifiesCustomer?: boolean }[] };
  suggestedCategories: string[];
  units: UnitOfMeasure[];
  defaultWarranty?: string;
  notice?: string;                      // ej. "Obras sociales: más adelante"
}
type AssetFieldDef = { key: string; label: string; type: 'TEXT'|'NUMBER'|'DATE'|'SELECT'|'BOOLEAN';
                       required?: boolean; isIdentifier?: boolean; options?: string[] };
```

`ModuleKey` es una lista cerrada en código (`caja`, `stock`, `compras`, `presupuestos`,
`facturacion`, `cuentas-corrientes`, `agenda`, `tienda`, `produccion`, `variantes`,
`ordenes-trabajo`, `fichas`, `costo-trabajo`). Los "Más adelante" (vencimientos, venta por peso,
abonos, mesas) se muestran deshabilitados y no se pueden prender.

### 3.3 Del lado del negocio

```prisma
// TenantSettings (campos nuevos)
businessTemplateKey     String?    // null = negocio previo a esta función
businessTemplateVersion Int?       // versión aplicada (para calcular "novedades")
enabledModules          String[]   // vacío + templateKey null = comportamiento actual (todo visible)
dismissedTemplateVersion Int?      // "Ahora no" → no volver a mostrar esa versión
```

Fichas y órdenes (etapas 3 y 4), con `tenantId` + RLS como el resto:

```prisma
model CustomerAssetType { id, tenantId, name, fields Json, notice String?, active Boolean }
model CustomerAsset {
  id, tenantId, typeId, companyId,     // dueño actual
  identifier String                    // copia del campo isIdentifier, normalizada, para buscar
  values     Json
  active     Boolean @default(true)
  createdAt
  @@index([tenantId, identifier])
}
model WorkOrderStatus { id, tenantId, name, sortOrder, isFinal, notifiesCustomer, active }
model WorkOrder {
  id, tenantId, number String,         // OT-000001, misma numeración que PRE/PED (ver choque de prefijos 9f35e60)
  customerId, assetId?, statusId, assignedUserId?,
  intakeNotes String?, assetSnapshot Json?,   // km y datos al ingresar
  promisedAt DateTime?, quoteId?, invoiceId?,
  createdByUserId, createdAt, updatedAt
  @@unique([tenantId, number])
}
model WorkOrderStatusChange { id, tenantId, workOrderId, fromStatusId?, toStatusId, userId, createdAt }
model WorkOrderLabor { id, tenantId, workOrderId, userId, hours Decimal, costPerHour Decimal?, note?, createdAt }
// Etapa 5: workOrderId opcional en PurchaseInvoice (repuesto o tornería comprado para un trabajo)
```

`UnitOfMeasure`: agregar `HOUR` y `DAY` (mano de obra, alquileres). Lo demás (porción, viaje,
noche) queda como `UNIT` por ahora.

## 4. Visibilidad de módulos (regla única)

Un módulo se ve si se cumplen **las tres** condiciones:
1. **El plan lo permite** (como hoy Producción y Tienda). Si el rubro lo trae pero el plan no:
   se muestra "Disponible en el plan X", no se prende en silencio.
2. **El negocio lo tiene prendido** (`enabledModules`). Negocios previos (`templateKey` null): todo
   como hoy.
3. **El usuario tiene permiso** (rol + `UserModuleAccess`), como hoy.

- Front: `canSee` en `AppShell.tsx` suma la condición 2.
- Back: guard `ModuleEnabledGuard('ordenes-trabajo')` **sólo en los módulos nuevos** (fichas, OT,
  costo). Apagar un módulo existente sólo lo saca del menú: no corta el API ni borra datos.
  Así no se rompe nada de lo que ya anda.

## 5. Etapas

### Etapa 0: Bugs de la prueba (sin migración)
B1–B7 de la sección 2. Tests unitarios para B1, B2 y B4. Se puede hacer en paralelo con la
etapa 1 y deployar sola.

### Etapa 1: Catálogo en /admin + módulos por negocio + elección en el alta (migración 1)
- Migración: `BusinessTemplate`, `BusinessTemplateVersion`, `BusinessTemplateRequest`, campos
  nuevos de `TenantSettings`.
- Seed con los ~126 rubros del mockup (familia, ícono, plantilla base). Por ahora sólo
  `modules`, `suggestedCategories`, `units`, `notice`; fichas y estados se cargan en las etapas 3 y 4.
- `/admin/rubros`: lista con buscador e íconos, editor (ícono, módulos, categorías, unidades,
  textos), guardar borrador / publicar versión, bandeja de pedidos de rubros nuevos.
- Alta: paso "¿A qué se dedica tu negocio?" después de verificar el email (también en el alta por
  Google/Microsoft). Aplica la plantilla: módulos, categorías sugeridas y unidades.
- `Configuración → Módulos`: rubro actual, cambiar de rubro (sólo **agrega**, nunca borra),
  interruptores con la explicación de qué hace cada uno.
- Negocios existentes: tarjeta opcional en el tablero "Elegí tu rubro". No se les cambia nada solo.
- Íconos: `lucide-react` (ya lo usa todo el menú); los SVG del mockup son sólo referencia.
- Lista de primeros pasos (B7): sumar "Condición frente al IVA" y "Certificado ARCA".

### Etapa 2: Unidad hora y líneas con descripción (migración 2, chica)
- `UnitOfMeasure` + `HOUR`, `DAY`; etiqueta "h" en PDFs, Caja y listados.
- `InvoiceLine.description` opcional (sale en el PDF y en el detalle). Cotización → factura copia
  `QuoteLine.notes` ahí. No cambia lo que se manda a ARCA.

### Etapa 3: Fichas del cliente (migración 3)
- `CustomerAssetType` / `CustomerAsset`; la plantilla del rubro crea el tipo al elegir el rubro.
- Pestaña en la ficha del cliente + página propia del bien con su historial.
- Buscador global por identificador (patente, IMEI, nombre de la mascota).
- Cambio de dueño (auto vendido): se mueve el bien a otro cliente y el historial va con el bien.
- Patente repetida: **avisa, no bloquea** (a confirmar, sección 6).
- Configuración: agregar, quitar o renombrar campos. Un campo con datos no se borra, se oculta.

### Etapa 4: Órdenes de trabajo (migración 4)
- `WorkOrderStatus` (copiados de la plantilla, editables), `WorkOrder`, `WorkOrderStatusChange`.
- Sección "Órdenes de trabajo": lista + tablero por estado, alta desde el cliente o desde el bien
  (guarda km al ingreso en `assetSnapshot`), responsable, fecha prometida.
- Flujo: OT → presupuesto (reusa Cotizaciones) → aprobado → factura (reusa
  `createInvoiceFromQuote` ya corregido en B1). Desde la OT se ve todo enlazado.
- Estado con `notifiesCustomer`: botón "Avisar por WhatsApp" con el mensaje armado (link `wa.me`,
  como Cotizaciones; no la API de Meta).
- Turnos: evento de Agenda con `linkType = 'WORK_ORDER'`.
- PDF "Orden de trabajo / comprobante de ingreso" con los datos del bien y la firma del cliente.
- Permisos: módulo `ordenes-trabajo` en `UserModuleAccess`; rol SALES lee y escribe.

### Etapa 5: Costo por trabajo (migración 5, chica)
- `WorkOrderLabor`: horas por mecánico (costo por hora opcional, por usuario).
- `workOrderId` opcional en `PurchaseInvoice` (la bomba de agua o la tornería comprada para ese auto).
- Repuestos: costo promedio de las líneas facturadas en la OT.
- Panel en la OT: presupuestado / costo de repuestos / terceros / horas / margen. Mismo dato en un
  reporte "Margen por trabajo".

### Etapa 6: Novedades de plantilla + catálogo completo
- Al publicar una versión, cada negocio con versión anterior ve "Hay novedades para tu rubro":
  diferencia entre la versión aplicada y la nueva (campos, estados, módulos agregados), con
  casillas. "Aplicar" sólo **agrega**; "Ahora no" guarda `dismissedTemplateVersion`.
- Cargar fichas y estados de todos los rubros del mockup.

### Etapa 7: Manual y prueba de punta a punta
- `/documentacion`: rubros, módulos, fichas, órdenes de trabajo (regenerar el PDF del manual).
- Repetir la prueba del taller completa (alta → OT → presupuesto → factura → margen) en el tenant
  de prueba local, y una prueba corta de kiosco y de service de celulares para confirmar que no
  ven nada del taller.

**Orden sugerido**: 0 y 1 en paralelo → 2 → 3 → 4 → 5 → 6 → 7. Cada etapa se puede deployar
sola. Migraciones escritas a mano como las últimas (la shadow DB de `prisma migrate dev` no levanta
por el drift viejo).

## 5b. Avance

**2026-10-26: etapas 0 y 1 hechas** en la rama `feat/rubros-etapa-0-1` (sin commit todavía).

- Etapa 0: B1, B2, B3, B4, B6 y B7 arreglados con tests; B5 descartado (ver tabla).
- Etapa 1: migración `20261101000000_business_templates` con 133 rubros en 16 familias;
  API en `apps/api/src/app/business-templates/` (`/business-templates`, `/business-profile`,
  `/admin/business-templates`); web: `/bienvenida`, `/settings/modules` ("Rubro y módulos" en el
  menú de usuario), `/admin/rubros`, tarjeta opcional en el Tablero.
- Cambios respecto del plan:
  - **No se apagan** Artículos/stock, Compras, Facturación ni Clientes: cualquier negocio los
    usa (un estudio contable carga servicios como artículos y facturas de compra por el IVA).
    Se apagan Caja, Cotizaciones, Cuentas a cobrar, Agenda, Tienda y Producción.
  - Sin "borrador": guardar en /admin publica una versión nueva sólo si cambió la config.
  - Unidades sugeridas quedan para la etapa 2 (todavía no existe la unidad hora).
- Probado en vivo (base local): alta nueva → bienvenida → elige Taller mecánico → módulos,
  categorías y garantía aplicados; apagar Caja la saca del menú; negocio previo que elige rubro
  conserva todo; /admin edita, versiona y conserva ficha y estados; pedidos de rubros nuevos.

**2026-10-26: etapa 2 hecha** (sobre main, después del merge 8bfc6dd).

- Migración `20261102000000_hour_unit_line_description`: `UnitOfMeasure` + `HOUR`/`DAY`,
  `InvoiceLine.description`.
- Unidad: selector de artículos (Hora, Día), importación (h, hs, horas, día, jornada) y
  exportación (HS, DIA), etiquetas "h"/"día" en PDF y stock. Alta guiada: un servicio pregunta
  "Se cobra: por trabajo / por hora / por día" y el precio pasa a "Precio por hora".
- Descripción por línea: Nueva factura habilita el "detalle" de cada línea (mismo botón que
  Cotizaciones); cotización → factura copia las notas de cada línea; sale debajo del artículo en
  los 5 estilos + ticket y en el detalle de la factura. No va a ARCA.
- Las unidades sugeridas por rubro siguen sin usarse (no hacen falta: el alta guiada ya pregunta).
- Ojo en local: después de una migración que cambia un enum, levantar el API con
  `--skip-nx-cache` (el cliente generado de Prisma no entra en el hash de Nx y el bundle queda
  con el enum viejo). En el deploy no pasa porque compila de cero.

**2026-10-26: etapa 3 hecha** (Fichas del cliente).

- Migración `20261103000000_customer_assets` (`customer_asset_types`, `customer_assets`, con RLS).
- API `apps/api/src/app/customer-assets/` + `ModuleEnabledGuard` (corta el API si el negocio no
  usa Fichas; abre su propio contexto de tenant como `SubscriptionReadOnlyGuard`).
- Fichas pasa a "disponible". **Regla nueva**: un negocio previo sin configurar ve prendidos los
  módulos que ya existían (`legacy`), pero NO los nuevos: Fichas sólo aparece si el negocio lo
  prende o lo trae su rubro.
- El tipo de ficha se copia de la plantilla al elegir rubro; los que eligieron antes de esta
  etapa lo reciben la primera vez que entran. Sin rubro, se crea a mano ("¿Sobre qué trabajás?").
- Web: menú con el nombre y el ícono del rubro ("Vehículos" con un auto), `/fichas` (buscar por
  patente o dueño), `/fichas/[id]` (maqueta, pantalla 4; historial queda para la etapa 4),
  sección en la ficha del cliente, editor de campos en Rubro y módulos.
- Patente repetida: aviso antes de guardar, no bloquea (decisión 3). Cambio de dueño mueve la ficha.
- Un campo con datos no se borra (se oculta); el dato principal no se mueve ni se oculta; un campo
  con datos no cambia de tipo.
- Se aprovechó para corregir el selector de clientes, que rotulaba "CUIT" a un DNI.

## 6. Decisiones del usuario (2026-10-26: acepta todas las recomendaciones)

Resueltas: (1) tarjeta opcional para negocios existentes; (2) "disponible en plan X"; (3) avisar, no
bloquear; (4) sólo hora y día; (5) lucide-react; (6) salud sin datos clínicos; (7) límite de
crédito sólo avisa.

Planteo original:

1. **Negocios existentes**: ¿tarjeta opcional "Elegí tu rubro" (recomendado) o dejarlos sin rubro?
2. **Plan vs rubro**: si el rubro trae un módulo que el plan no incluye, ¿se muestra "disponible en
   plan X" (recomendado) o se habilita igual?
3. **Patente / identificador repetido**: ¿avisar (recomendado) o bloquear?
4. **Unidades**: ¿alcanza con sumar hora y día, o se quiere una tabla de unidades libre?
5. **Íconos**: usar `lucide-react` (recomendado, coherente con el resto) en vez de los del mockup.
6. **Rubros de salud**: sin datos clínicos hasta consultar al abogado (Ley 25.326).
7. **Límite de crédito (B6)**: ¿sólo avisar al vender o bloquear la venta?
