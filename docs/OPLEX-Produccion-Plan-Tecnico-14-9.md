# OPLEX — Módulo de Producción v1
## Plan técnico (respuesta al §10 de OPLEX-Produccion-Diseño-14-9)

> Documento de planificación. **No se tocó código.** Responde las 12 preguntas del
> prompt sugerido en el diseño, organizado por fases de trabajo, con schema propuesto,
> migraciones, riesgos y las decisiones de negocio que quedan abiertas. Agrega una fase
> nueva no contemplada en el diseño original: **gating por plan de suscripción**
> (Producción disponible desde BRONZE, configurable por el SuperAdmin) y una guía de
> diseño de UI para las pantallas nuevas.

---

## 0. Cómo está armado este plan

Sigue el orden de la §9.4 del diseño (primero endurecer la base, después construir
producción), pero lo desglosa en fases ejecutables, y agrega **Fase 1 (gating por
plan)** antes de tocar nada de producción — así todo lo que se construye después ya
nace protegido por el flag de plan, en vez de agregarlo después a cada endpoint.

```
Fase 0 — Fundación: lock del costeo de entradas          (aislada, mejora el sistema hoy)
Fase 1 — Gating por plan (BRONZE+, configurable)          (aislada, cero dependencia de producción)
Fase 2 — Reservas / "disponible" en recordMovement        (toca el corazón del stock)
Fase 3 — Conversión de unidad de compra                   (habilita CONTINUO)
Fase 4 — Entidades de producción (BOM, StockPiece, Orden) (el módulo en sí)
Fase 5 — Asientos contables de producción                 (cierre contable)
Fase 6 — UI del módulo (diseño moderno)                    (en paralelo con Fase 4-5)
```

Cada fase es un PR/entrega separable. Ninguna fase rompe el comportamiento actual de
artículos DISCRETO (la inmensa mayoría del catálogo hoy).

---

## Fase 0 — Fundación: lock del costeo de entradas

**Qué arregla**: la condición de carrera que ya reporté en la auditoría (§9.3 del
diseño): dos `PURCHASE_IN`/`PRODUCTION_IN`/`RETURN` concurrentes sobre el mismo
`(warehouseId, articleVariantId)` pueden pisarse el `avgUnitCost` calculado.

**Cómo** (mismo patrón que ya usa el propio código en `InvoicingService.createCreditNote`
y `GoodsReceiptService.create`):

```ts
// inventory.service.ts, dentro de recordMovement(), ANTES de leer priorLedger
// (reemplaza el findUnique plano de la línea 429 del archivo actual)
await db.$queryRaw`
  SELECT id FROM stock_ledger
  WHERE "warehouseId" = ${dto.warehouseId} AND "articleVariantId" = ${dto.articleVariantId}
  FOR UPDATE
`;
const priorLedger = await db.stockLedger.findUnique({ where: { warehouseId_articleVariantId: {...} } });
```

Esto serializa dos movimientos concurrentes sobre la misma fila: el segundo espera a
que el primero termine su transacción antes de leer, en vez de leer un valor viejo en
paralelo.

**Caso especial — fila que todavía no existe** (primer movimiento jamás registrado para
ese par): `SELECT ... FOR UPDATE` sobre una fila inexistente no bloquea nada (no hay fila
que lockear). Ahí el riesgo residual es el que ya identifiqué como menor: dos "primeras
entradas" concurrentes chocan contra el `@@unique([warehouseId, articleVariantId])` del
`upsert` y una de las dos tira un error de constraint en vez de corromper datos. Se
puede cerrar del todo envolviendo ese `upsert` en un `try/catch` que reintente una vez
si el error es `P2002` (unique violation) — bajo riesgo, no bloqueante para avanzar.

**Impacto**: ninguno en el comportamiento visible. Sólo agrega una sentencia SQL extra
por movimiento con costo. Sin migración de datos.

**Por qué primero**: barato, aislado, y el diseño ya lo señala como "amplificado" por
producción (va a haber muchos más `PRODUCTION_IN`/`OUT` concurrentes sobre las mismas
variantes). Mejora el sistema aunque nunca se construya producción.

---

## Fase 1 — Gating por plan (BRONZE+, configurable por SuperAdmin) ✅ IMPLEMENTADA (2026-09-14)

No estaba en el diseño original — lo pediste ahora. Investigué cómo OPLEX ya gatea
funciones por plan (`Plan.aiInvoiceScanMonthlyQuota` / `Plan.aiAssistantMonthlyQueryQuota`,
`SubscriptionService.assertCanUseAssistant()`, editable desde `/admin/plans`) y Producción
encaja en el mismo patrón exacto.

**Planes existentes hoy** (`sortOrder` real en la DB): `BASIC(1) → BRONZE(2) → SILVER(3)
→ GOLD(4) → PLATINUM(5) → DIAMOND(6)`.

### Schema
```prisma
model Plan {
  ...
  productionModuleEnabled Boolean @default(false)   // NUEVO
}
```
Migración de backfill: `UPDATE plans SET "productionModuleEnabled" = true WHERE "sortOrder" >= 2` (BRONZE en adelante), `false` para BASIC — igual que pediste. El SuperAdmin puede después prender/apagar por plan libremente desde `/admin/plans` (mismo `<select>` que ya existe para "Activo").

### Backend
```ts
// SubscriptionService — mismo shape exacto que assertCanUseAssistant()
async assertCanUseProduction(): Promise<void> {
  const { plan } = await this.assertSubscriptionActive();
  if (!plan.productionModuleEnabled) {
    throw new ForbiddenException(`Tu plan actual (${plan.name}) no incluye el módulo de Producción`);
  }
}
```
Se llama al inicio de cada endpoint de **escritura** del nuevo `ProductionController`
(crear/confirmar/cancelar orden, crear/editar BOM). **Decisión confirmada**: el
endpoint de sólo lectura `GET /production/producible` (Fase 4.6) queda **abierto en
cualquier plan, incluido BASIC** — funciona como un "probá antes de mejorar tu plan":
cualquier tenant puede ver "con tu stock actual, cuánto podrías producir", pero crear o
confirmar una orden real exige BRONZE+.

### Frontend
- `apps/web/src/lib/subscriptions.ts`: agregar `productionModuleEnabled: boolean` a la
  interfaz `Plan` (hoy sólo tiene `aiInvoiceScanMonthlyQuota`, ni siquiera el de
  Asistente está reflejado ahí — hay que sumar ambos de paso).
- `AppShell.tsx`: **hoy el sidebar es una lista estática sin ningún gating por plan**
  (confirmé leyendo el archivo — ni el Asistente de IA esconde su nav si el plan no lo
  incluye). Para Producción, agregar un `useQuery({ queryKey: ['subscription-me'],
  queryFn: subscriptionsApi.getCurrent })` en `AppShell` — mismo `queryKey` que ya usa
  `TrialBanner.tsx` (que ya vive dentro de `AppShell`), así que React Query comparte el
  caché sin pegarle un fetch extra al backend — y mostrar el grupo "Producción" en
  `NAV_ENTRIES` sólo si `plan.productionModuleEnabled`.
- Ícono propuesto: `Factory` o `Layers` de `lucide-react` (ya es dependencia del
  proyecto, mismo paquete que usan todos los íconos actuales del sidebar).

**Riesgo**: bajo. Es infraestructura nueva pero acotada (1 campo de Plan, 1 assert, 1
condicional en el sidebar) y no depende de ninguna entidad de producción todavía.

**Implementado y verificado en vivo (2026-09-14)**: migración `20260930050000_plans_production_module`
(`ALTER TABLE plans ADD COLUMN "productionModuleEnabled" BOOLEAN NOT NULL DEFAULT false`
+ backfill `sortOrder >= 2`), `Plan.productionModuleEnabled` en el schema,
`SubscriptionService.assertCanUseProduction()` (mismo shape que
`assertCanUseAssistant`, 6 tests nuevos), `CreatePlanDto`/`UpdatePlanDto` +
`createPlan`/`updatePlan` actualizados, y el toggle "Módulo de Producción" en
`/admin/plans` (mismo patrón que "Activo"). **No** se agregó el nav "Producción" al
sidebar todavía (`AppShell.tsx`) - no hay ninguna pantalla real a la que apuntar hasta
la Fase 6, se deja para entonces en vez de dejar un link roto.

Verificado contra Postgres real, no sólo tests: backfill confirmado por query directa
(BASIC=false, BRONZE..DIAMOND=true), y el toggle probado de punta a punta desde
`/admin/plans` (apagado y reencendido en BRONZE, persistido correctamente). `nx
run-many -t test,build,lint --projects=subscriptions,api,web` 100% verde (34 tests de
`subscriptions`, 302 de `api`, build de `web` completo con las 48 rutas incluyendo
`/admin/plans`).

---

## Fase 2 — Reservas / "disponible" en `recordMovement`

Esta es la pregunta más importante técnicamente (punto 6 del prompt) y la que más
decisiones de diseño abre. La resuelvo, pero marco explícitamente los puntos donde hay
más de un camino razonable (ver "Decisiones pendientes" al final).

### Modelo de 3 capas (del diseño, §2.4)
```
físico total   = StockLedger.quantity (o suma de StockPiece para 1D)
reservado      = suma de StockReservation con status=ACTIVE
disponible     = físico − reservado
```

### Dónde vive el chequeo
`recordMovement()` es el único lugar que descuenta stock (facturación, POS, y a futuro
consumo de producción pasan todos por ahí) — el diseño lo señala bien en §9.1: cambiando
un solo lugar, todo el sistema respeta reservas sin tocar Facturación/POS/Compras
individualmente.

**Dos formas de calcular "disponible" dentro del `updateMany` atómico que hoy hace
`WHERE quantity >= -delta`** (esto es una decisión real, no la resuelvo unilateralmente):

**Opción A — columna desnormalizada `StockLedger.reservedQuantity`**, mantenida en
sync por cada alta/baja de `StockReservation` (mismo estilo que `avgUnitCost` hoy).
El chequeo de salida pasa a ser una comparación entre dos columnas, lo que Prisma no
puede expresar en un `updateMany().where` — habría que migrar esa sentencia a
`$executeRaw`:
```sql
UPDATE stock_ledger SET quantity = quantity + $delta
WHERE "warehouseId" = $1 AND "articleVariantId" = $2
  AND (quantity - "reservedQuantity") >= $3
```
Sigue siendo una única sentencia atómica (misma garantía que hoy), pero cambia de
Prisma query-builder a SQL crudo en ese punto puntual.

**Opción B — sumar reservas al vuelo** dentro de la misma transacción, reusando el
lock `FOR UPDATE` que ya se agrega en la Fase 0: lockear la fila de `StockLedger`,
sumar `StockReservation WHERE status=ACTIVE` para ese `(warehouse, variant)`, decidir,
y recién ahí hacer el `UPDATE`. Una consulta extra por movimiento, pero sin columna
desnormalizada que pueda desincronizarse, y reusa exactamente el lock que la Fase 0 ya
introduce (casi gratis agregarlo ahí mismo).

**Decisión confirmada: Opción B.** El codebase ya tiene el precedente de "no
denormalizar si se puede derivar dentro de la misma transacción lockeada" (es
literalmente el mismo argumento que usa el comentario de `getConsolidatedStock`:
"computed on read... a stored total would drift"). No hace falta la migración
`stock_ledger_add_reserved_quantity` de la lista más abajo — se elimina de la lista.

### ¿La venta ve el stock reservado?
**Decisión confirmada: sí, siempre, sin excepción en v1.** Facturación/POS ven
"disponible" (físico − reservado), nunca "físico" a secas — el `SALE_OUT` en
`recordMovement` (no sólo el futuro `PRODUCTION_OUT`) chequea contra disponible, sin
ningún mecanismo de override manual en esta versión. Si en el futuro hace falta forzar
una venta sobre stock reservado, se agrega como una fase aparte (permiso de rol +
acción explícita), no se construye de entrada.

### Índices necesarios
```prisma
model StockReservation {
  ...
  @@index([tenantId, inputArticleVariantId, warehouseId, status])  // sumar ACTIVE rápido
}
```

**Riesgo**: 🔴 alto pero acotado — es el corazón del punto de escritura único, así que
un bug acá afecta todo el sistema. Por eso va después de la Fase 0 (con el lock ya
puesto) y antes de construir ninguna entidad de producción encima.

---

## Fase 3 — Conversión de unidad de compra (habilita CONTINUO)

Confirmo lo que pedía el punto 4 del prompt: **CONTINUO se resuelve 100% con el
`StockLedger` actual** — es un solo número decimal (gramos/ml), la aritmética `Decimal`
ya lo soporta sin ningún cambio en `StockLedger`/`StockMovement`. El único trabajo real
es la conversión "bolsa de 35kg → 35.000gr" al **recibir la compra**.

### Dónde se resuelve
Exclusivamente en `GoodsReceiptsService.createReceipt` (apps/api) — **no** en
`InventoryService.recordMovement`, manteniendo la regla de "un lib module no conoce a
otro módulo" que ya sigue el resto del código.

```ts
// GoodsReceiptsService.createReceipt, antes de llamar recordMovement
const article = await db.article.findUnique({ where: { id: variant.articleId } });
const factor = article.measurementType === 'CONTINUOUS' && article.purchaseSize
  ? article.purchaseSize   // ej. 35000 (gr por bolsa)
  : 1;                     // DISCRETO/1D/2D: sin conversión, comportamiento actual intacto

await this.inventoryService.recordMovement({
  ...
  quantity: line.quantity.mul(factor).toNumber(),          // 2 bolsas → 70.000 gr
  unitCost: line.purchaseOrderLine.unitCost.div(factor).toNumber(),  // $/bolsa → $/gr
});
```

`PurchaseOrderLine.quantity`/`unitCost` **no cambian de significado**: siguen siendo "lo
que se le pide al proveedor" (3 bolsas, a $X la bolsa) — la conversión a unidad de stock
pasa a ocurrir sólo en el momento de recibir, un único punto, sin tocar el schema de
`PurchaseOrderLine`/`GoodsReceiptLine`.

**Riesgo**: 🟢 bajo — cambio acotado a un service, `factor=1` preserva el comportamiento
actual para todo lo que no sea CONTINUO.

---

## Fase 4 — Entidades de producción

Acá entra el grueso del schema nuevo del diseño (§2). Contesto los puntos 2, 3, 5, 8, 9,
11 del prompt.

### 4.1. `Article` — agregar el discriminador sin romper nada (punto 2)
```prisma
enum MeasurementType { DISCRETE  CONTINUOUS  LINEAL_1D  SURFACE_2D }

model Article {
  ...
  measurementType  MeasurementType @default(DISCRETE)   // NUEVO
  isManufactured   Boolean         @default(false)       // NUEVO
  purchaseSize     Decimal?                              // NUEVO, CONTINUO
  baseUnit         String?                                // NUEVO, CONTINUO
  commercialLength Decimal?                               // NUEVO, 1D
  minUsableLength  Decimal?                               // NUEVO, 1D
  sheetWidth       Decimal?                                // NUEVO, 2D
  sheetLength      Decimal?                                // NUEVO, 2D
}
```
`@default(DISCRETE)` hace que la migración sea un `ALTER TABLE ... ADD COLUMN` puro —
**cero artículos existentes cambian de comportamiento**. `recordMovement` no lee
`measurementType` hoy ni lo va a leer para DISCRETE (sigue exactamente igual). Sólo el
código nuevo (StockPiece, BOM, función de producible) lo consulta.

**Migración de datos — decisión confirmada**: todos los artículos existentes quedan en
`DISCRETE` sin excepción, sin importar su `unitOfMeasure` actual (`KG`/`LTR`/`M2`/`MM`
incluidos) — **no** se auto-mapea nada. El usuario elige a mano, por artículo, cuáles
pasan a CONTINUO/1D/2D después (desde el mismo `ArticleFormModal` donde hoy elige
`unitOfMeasure`). Cero riesgo de que un artículo cambie de comportamiento sin que su
dueño lo haya pedido.

### 4.2. `StockPiece` — convivencia con `StockLedger` (punto 3)
**Recomendación**: `StockLedger` sigue existiendo y siendo la fuente de "total" para
**todo lo que no es 1D** (discreto, continuo, 2D) — cero cambios ahí. Para 1D,
`StockLedger.quantity` para ese `(warehouse, variant)` se **mantiene sincronizado**
(no se deja de escribir) en la misma transacción que crea/modifica cada `StockPiece`,
en vez de que todo lector recalcule `SUM(currentLength)` en cada consulta.

**Por qué sincronizado y no siempre-derivado**: los lectores actuales de stock
(`listArticles`, Tablero, `listReorderSuggestions`, `ArticlePicker`) ya consultan
`StockLedger` directamente o vía `include` anidado — hacerlos sumar `StockPiece` en cada
lectura tocaría los 4 lugares. Manteniendo `StockLedger.quantity` como "espejo" del total
de piezas `AVAILABLE` (actualizado en la misma transacción que cualquier corte/alta/baja
de pieza), **ningún lector actual cambia** — siguen leyendo `StockLedger` como siempre,
y sólo el código nuevo (búsqueda de "mejor pieza para este corte", función de
producible) consulta `StockPiece` directamente. Mismo patrón que ya usa el código para
`PriceHistory` (detalle append-only) + `StockLedger.avgUnitCost` (agregado espejado).

```prisma
model StockPiece {
  id               String       @id @default(uuid())
  tenantId         String
  articleVariantId String
  warehouseId      String
  originalLength   Decimal      @db.Decimal(14, 3)
  currentLength    Decimal      @db.Decimal(14, 3)
  status           PieceStatus
  sourceType       PieceSource
  parentPieceId    String?
  parentPiece      StockPiece?  @relation("PieceLineage", fields: [parentPieceId], references: [id])
  offcuts          StockPiece[] @relation("PieceLineage")
  unitCost         Decimal      @db.Decimal(14, 4)
  createdAt        DateTime     @default(now())

  @@index([tenantId, articleVariantId, warehouseId, status, currentLength])  // búsqueda de mejor pieza
  @@map("stock_pieces")
}
enum PieceStatus { AVAILABLE DEPLETED SCRAP }
enum PieceSource { FULL_STOCK OFFCUT }
```

### 4.3. Costeo por pieza y convivencia con PPP (punto 5)
`StockPiece.unitCost` se congela al nacer la pieza: `PPP_del_lote_de_origen ×
(longitud_de_la_pieza / longitud_total_de_ese_ingreso)` — mismo criterio que ya usa
`StockMovement.unitCost` (congelado al momento, nunca recalculado después). Al cortar
una pieza, el recorte (`OFFCUT`) hereda el **mismo** `unitCost` que tenía la pieza madre
(el costo por mm no cambia porque la cortaste, sólo cambia cuánto queda). `StockLedger
.avgUnitCost` sigue siendo el PPP agregado de siempre — no hay conflicto porque son dos
cosas distintas: el PPP agregado se usa para cualquier entrada/salida sin pieza
específica (o para reportes de "costo por gramo/kg" en discreto/continuo/2D); el costo
por pieza se usa sólo cuando `ProductionConsumption.stockPieceId` apunta a una pieza
concreta.

**Punto a confirmar**: si algún reporte de valuación total de inventario necesita sumar
el valor del stock 1D, recomiendo calcularlo como `SUM(StockPiece.currentLength ×
unitCost)` al momento de generar ese reporte (no mantener un tercer número
desnormalizado) — evita que ese total diverja del detalle real por redondeo acumulado.

### 4.4. `BillOfMaterials` / `BomLine` / `BomByproduct` — versionado y mermas (punto 11)
```prisma
model BillOfMaterials {
  id                    String   @id @default(uuid())
  tenantId              String
  outputArticleVariantId String
  name                  String
  version               Int      @default(1)
  isActive              Boolean  @default(true)
  lines                 BomLine[]
  byproducts            BomByproduct[]

  @@index([tenantId, outputArticleVariantId, isActive])
}
model BomLine {
  id                     String   @id @default(uuid())
  bomId                  String
  inputArticleVariantId  String
  quantity               Decimal  @db.Decimal(14, 3)
  width                  Decimal? @db.Decimal(14, 3)
  length                 Decimal? @db.Decimal(14, 3)
  cutsCount              Int?
  expectedWastePercent   Decimal  @default(0) @db.Decimal(5, 2)
}
model BomByproduct {
  id                     String  @id @default(uuid())
  bomId                  String
  outputArticleVariantId String
  quantity               Decimal @db.Decimal(14, 3)
  costSharePercent       Decimal? @db.Decimal(5, 2)
}
```
**Versionado**: editar una receta activa **nunca la pisa** — crea una fila nueva
(`version = anterior + 1`, `isActive = true`) y pone `isActive = false` en la vieja
(idéntico criterio "append-only" que ya usa `PriceHistory`/`ExchangeRateHistory`).
`ProductionOrder.bomVersion` se graba **al crear la orden** y nunca se recalcula
después, aunque la receta cambie más tarde — misma regla que `StockMovement.unitCost`
congelado.

**Merma esperada**: infla la cantidad a reservar/consumir: `cantidadReservada =
bomLine.quantity × cantidadOrdenada × (1 + expectedWastePercent/100)`.

**Subproductos**: la suma de `costSharePercent` de todos los `BomByproduct` de una
receta más el remanente implícito del producto principal debe dar 100% — a validar al
guardar la receta. `ProductionOutput.cost` de cada salida = costo total de insumos
consumidos × su `costSharePercent` (o el remanente para el principal) / 100.

### 4.5. `ProductionOrder` + reservas + consumo (punto 7)
```prisma
model ProductionOrder {
  id                     String  @id @default(uuid())
  tenantId               String
  outputArticleVariantId String
  bomId                  String?
  bomVersion             Int?
  quantity               Decimal @db.Decimal(14, 3)
  status                 ProductionStatus @default(DRAFT)
  isShortOnMaterials     Boolean @default(false)
  createdAt DateTime @default(now())
  startedAt DateTime?
  finishedAt DateTime?
  cancelledAt DateTime?
  reservations  StockReservation[]
  consumptions  ProductionConsumption[]
  outputs       ProductionOutput[]
}
enum ProductionStatus { DRAFT PLANNED IN_PROGRESS DONE CANCELLED }

model StockReservation {
  id                    String @id @default(uuid())
  tenantId              String
  productionOrderId     String
  inputArticleVariantId String
  warehouseId           String
  quantityReserved      Decimal @db.Decimal(14, 3)
  stockPieceId          String?
  status                ReservationStatus @default(ACTIVE)
  createdAt DateTime @default(now())

  @@index([tenantId, inputArticleVariantId, warehouseId, status])
}
enum ReservationStatus { ACTIVE CONSUMED RELEASED }

model ProductionConsumption {
  id                    String @id @default(uuid())
  productionOrderId     String
  inputArticleVariantId String
  stockPieceId          String?
  quantityConsumed      Decimal @db.Decimal(14, 3)
  offcutPieceId         String?
  wasteAmount           Decimal @db.Decimal(14, 3) @default(0)
  cost                  Decimal @db.Decimal(14, 4)
}
model ProductionOutput {
  id                String  @id @default(uuid())
  productionOrderId String
  articleVariantId  String
  isPrimary         Boolean
  quantityProduced  Decimal @db.Decimal(14, 3)
  cost              Decimal @db.Decimal(14, 4)
}
```

**Ciclo de vida** (nueva `ProductionOrderService`, en un módulo nuevo `libs/modules/production`):
- **Confirmar orden** (`DRAFT → PLANNED`): corre la función de producible (§Fase 4.6)
  sobre el **disponible**. Si alcanza, reserva todo lo pedido. Si no alcanza y el usuario
  decide avanzar igual: reserva lo que sí hay (`ACTIVE`), pone `isShortOnMaterials =
  true`, la orden queda "en cola" sin consumir.
- **Detección de reposición**: un scheduler (mismo patrón `@Cron` que ya usa
  `InventoryReplenishmentSchedulerService`/`ExchangeRateSchedulerService`) revisa
  periódicamente órdenes `isShortOnMaterials=true` cuyo faltante ya tiene disponible
  suficiente, y las marca como "lista para completar" — **nunca dispara producción
  sola**, sólo sugiere (regla explícita del diseño §7).
- **Producir/consumir** (`PLANNED/IN_PROGRESS → DONE`): por cada reserva, llama
  `recordMovement({ type: 'PRODUCTION_OUT', ... })` con la cantidad/pieza reservada,
  pasa la reserva a `CONSUMED`, y crea el `ProductionOutput` (`PRODUCTION_IN` del
  producto terminado) con el costo heredado.
- **Cancelar** (`→ CANCELLED`): todas las reservas `ACTIVE` de esa orden pasan a
  `RELEASED`. Como las reservas nunca tocaron `StockLedger.quantity` (sólo restan del
  "disponible" calculado), liberar es **sólo un update de status**, sin ningún
  movimiento de stock — operación barata, sin riesgo de dejar cantidades mal.

### 4.6. Función de cantidad producible + cuello de botella (punto 9)
Vive en `ProductionPlanningService` (mismo módulo nuevo), función pura de lectura,
reusa el **mismo helper de "disponible por insumo"** que usa `recordMovement` para el
chequeo de reservas (para que nunca diverjan):

```ts
async computeProducible(outputArticleVariantId: string, warehouseId: string) {
  const bom = await this.getActiveBom(outputArticleVariantId);
  const perLine = await Promise.all(bom.lines.map(async (line) => {
    const disponible = await this.getDisponible(line.inputArticleVariantId, warehouseId); // mismo helper que Fase 2
    const requerido = line.quantity.mul(1 + line.expectedWastePercent / 100);
    return { line, producible: disponible.div(requerido).floor() };
  }));
  const bottleneck = perLine.reduce((min, r) => r.producible.lt(min.producible) ? r : min);
  return { maxProducible: bottleneck.producible, bottleneck: bottleneck.line, perLine };
}
```
`getDisponible` lee según `measurementType` del insumo: `StockLedger.quantity` para
DISCRETO/CONTINUO/2D, `SUM(StockPiece.currentLength WHERE status=AVAILABLE)` para 1D —
en todos los casos, menos lo reservado (`StockReservation ACTIVE`).

Expuesta vía `GET /production/producible?articleVariantId=&warehouseId=` para el caso
exploratorio ("¿cuánto puedo hacer con lo que tengo?"), y reusada internamente al
confirmar una orden.

**Riesgo de toda la Fase 4**: 🟠 medio — mucho schema nuevo, pero aislado (tablas
nuevas, no modifica el comportamiento de tablas existentes salvo los campos opcionales
de `Article`).

---

## Fase 5 — Asientos contables de producción (punto 10)

Nueva `ProductionService` en `apps/api/src/app/production` (composición, mismo rol que
`SalesService`/`GoodsReceiptsService` hoy — un lib module de producción no puede llamar
directo a `AccountingService`/`InventoryService`, así que esta es la raíz de
composición, respetando la regla ya existente del repo).

```ts
async completeOrder(dto) {
  // ... consumo (Fase 4.5) ...
  await this.accountingService.postProductionJournalEntry({
    productionOrderId: order.id,
    inputsCost: totalConsumptionCost,     // suma de ProductionConsumption.cost
    outputsCost: totalOutputsCost,        // suma de ProductionOutput.cost (principal + subproductos)
    date: order.finishedAt,
  });
}
```
Asiento propuesto (mismo shape que `postGoodsReceiptAccrual`/`postInvoiceJournalEntry`):
**Debe** "Mercaderías — Producto Terminado" (o cuenta a definir) por `outputsCost` /
**Haber** "Mercaderías — Insumos" por `inputsCost`. Si `inputsCost ≠ outputsCost`
(mermas, redondeo), la diferencia va a una cuenta de "Diferencia de Producción" —
a definir con el equipo contable si eso es una ganancia/pérdida o se absorbe.

**Decisión confirmada**: se queda con la **misma** cuenta `INVENTORY_ASSET_ACCOUNT`
("Mercaderías") que ya usa el resto del sistema, sin crear cuentas nuevas de Materias
Primas/Productos Terminados por separado. El asiento de producción es entonces un
**traspaso interno dentro de la misma cuenta** (Debe Mercaderías por `outputsCost` /
Haber Mercaderías por `inputsCost`) — no cambia el total del activo de inventario, sólo
documenta el movimiento. Si `inputsCost ≠ outputsCost` (merma/redondeo), la diferencia
sigue yendo a la cuenta de "Diferencia de Producción" mencionada arriba (a definir su
naturaleza exacta — ganancia/pérdida vs. absorbida — cuando se llegue a esa fase, es un
detalle menor comparado con la decisión de cuentas ya resuelta acá).

**Riesgo**: 🟢 aditivo — no reabre ni modifica los asientos de venta/compra existentes,
sólo suma uno nuevo.

---

## Fase 6 — UI del módulo (diseño moderno)

Pediste explícitamente diseño moderno, claro, con íconos, colores, mini-gráficos y
mini-animaciones. Buenas noticias: **esto ya es el lenguaje visual actual de OPLEX**
(no hay que inventar un sistema nuevo) — el Tablero rediseñado hace unos días ya trae
stat cards con sparkline + skeleton + count-up (recharts + shadcn/ui), y todo el resto
de la app ya migró a shadcn/ui. Producción debería verse como una extensión natural de
eso, no como un módulo aparte visualmente.

**Pantallas propuestas** (todas dentro del nuevo grupo "Producción" del sidebar,
ícono `Factory` de lucide-react):

| Pantalla | Contenido | Detalle visual |
|---|---|---|
| **Tablero de Producción** | KPIs (órdenes en curso, "esperando insumos", producidas hoy) + lista de órdenes con estado | Stat cards estilo Tablero general (mismo componente, count-up en los números), badge de color por `ProductionStatus` (gris DRAFT, azul PLANNED, ámbar IN_PROGRESS con `isShortOnMaterials`, verde DONE, rojo CANCELLED) |
| **Recetas (BOM)** | Editor de receta: insumos + cantidades, indicador de versión activa, badge "% merma esperada" por línea | Tabla con drag-to-reorder de líneas (opcional), chip de versión (`v2` en violeta), diagrama simple de "1 → N insumos" con íconos por `measurementType` (regla para 1D, gota para líquido/continuo, cuadrado para 2D, caja para discreto) |
| **Nueva orden / detalle de orden** | Selector de producto + cantidad, resultado en vivo de "cantidad producible" con el cuello de botella resaltado | Barra de progreso mini por insumo (disponible vs. requerido, coloreada: verde si alcanza, ámbar si es el cuello de botella, rojo si no alcanza), animación sutil de "recalculando..." al cambiar la cantidad (debounce + skeleton corto) |
| **Piezas / recortes (1D)** | Lista de `StockPiece` por artículo: largo original, largo actual, estado, de qué salió | Barra horizontal proporcional al `currentLength` (visual tipo "regla"), badge distinto para `FULL_STOCK` vs `OFFCUT`, tachado/gris para `SCRAP` |
| **Widget en Tablero general** | Mini-card "Órdenes esperando insumos" con conteo, igual estilo que las stat cards actuales | Ícono de alerta ámbar si `isShortOnMaterials > 0`, click lleva al listado filtrado |

**Micro-interacciones concretas a reusar** (ya existen en el código, no hay que
inventarlas):
- Count-up en los números de KPI (mismo hook que ya usa el Tablero).
- Skeleton mientras carga (mismo patrón que las stat cards).
- Sparkline de "producción de los últimos 7 días" con recharts (misma librería ya
  integrada, mismo estilo que "Ventas últimos 7 días").
- Toggle de tema oscuro/claro heredado automáticamente (todo con tokens de shadcn/ui,
  no colores hardcodeados).

**Riesgo**: bajo, es la parte más mecánica una vez que el modelo de datos (Fases 2-4)
está firme — el trabajo real de esta fase es de UI/UX, no de arquitectura.

---

## Resumen de riesgos por fase

| Fase | Riesgo | Por qué |
|---|---|---|
| 0 — Lock de costeo | 🟢 Bajo | Aislado, sin cambio de comportamiento visible |
| 1 — Gating por plan | 🟢 Bajo | Infraestructura nueva pero acotada, sin dependencias |
| 2 — Reservas/disponible | 🔴 Alto | Toca el único punto de escritura de todo el stock del sistema |
| 3 — Conversión de compra | 🟢 Bajo | Cambio acotado a un service, `factor=1` no rompe nada existente |
| 4 — Entidades de producción | 🟠 Medio | Mucho schema nuevo, pero aditivo (no modifica tablas existentes salvo columnas opcionales) |
| 5 — Asientos de producción | 🟢 Bajo (aditivo) | No reabre asientos existentes, cuenta contable ya definida (Mercaderías única) |
| 6 — UI | 🟢 Bajo | Mecánico, reusa componentes/patrones ya existentes |

---

## Lista de migraciones (en orden)

1. `plans_add_production_module_enabled` — columna + backfill (BASIC=false, resto=true).
2. *(Fase 0 no requiere migración — sólo código.)*
3. `articles_add_measurement_type` — `measurementType` (default DISCRETE),
   `isManufactured`, `purchaseSize`, `baseUnit`, `commercialLength`, `minUsableLength`,
   `sheetWidth`, `sheetLength`. Todos nullable u opcionales, sin backfill de datos
   (todo queda DISCRETE/`isManufactured=false` salvo que se confirme lo contrario — ver
   decisión pendiente).
4. `stock_pieces` — tabla nueva.
5. `production_bom` — `bill_of_materials`, `bom_lines`, `bom_byproducts`.
6. `production_orders` — `production_orders`, `stock_reservations`,
   `production_consumptions`, `production_outputs`.

(No hay migración de `reservedQuantity` desnormalizada — se confirmó la Opción B para
el cálculo de "disponible", ver Fase 2.)

---

## Decisiones ya confirmadas (2026-09-14)

1. **Cálculo de "disponible" (Fase 2)**: Opción B — sumar reservas al vuelo, bajo el
   mismo lock `FOR UPDATE` de la Fase 0. No hay columna desnormalizada.
2. **La venta NO puede forzar sobre stock reservado en v1** — Facturación/POS siempre
   ven "disponible", sin override manual.
3. **Backfill de `measurementType`**: todo artículo existente nace `DISCRETE`, sin
   auto-mapeo desde `unitOfMeasure`. El usuario elige a mano cuáles pasan a
   CONTINUO/1D/2D.
4. **Gating de lectura**: `GET /production/producible` queda abierto en cualquier plan
   (incluido BASIC), como gancho comercial "probá antes de mejorar tu plan". Crear o
   confirmar una orden real sigue exigiendo BRONZE+.
5. **Cuentas contables de producción**: una sola cuenta "Mercaderías" (la
   `INVENTORY_ASSET_ACCOUNT` que ya existe) para todo — el asiento de producción es un
   traspaso interno, sin crear cuentas nuevas de Materias Primas/Productos Terminados.
6. **Sin cupo mensual**: Producción es simplemente on/off por plan (`Plan
   .productionModuleEnabled`), sin ningún límite de cantidad de órdenes por mes — a
   diferencia de `aiInvoiceScanMonthlyQuota`/`aiAssistantMonthlyQueryQuota`, que sí son
   cupos. El schema de la Fase 1 ya asumía esto; queda confirmado, sin agregar
   `productionOrdersMonthlyQuota`.

7. **Reportes de valuación de inventario**: no existe ningún reporte hoy en
   Reportes/Contabilidad que sume "valor total de stock" (confirmado por búsqueda en el
   código) — no hay nada que adaptar en esta fase. Si en el futuro se construye uno, y
   necesita valuar artículos 1D, debe calcularse como `SUM(StockPiece.currentLength ×
   unitCost)` al momento de generarlo (mismo criterio ya fijado en la Fase 4.3), no con
   un total desnormalizado aparte.

## Decisiones pendientes

Ninguna — las 7 quedaron resueltas. Arranca la implementación por la Fase 0.
