# OPLEX — Módulo de Producción v1
## Diseño de modelo de datos y alcance

> Documento de diseño conceptual. Define el alcance cerrado del módulo y el modelo
> de entidades propuesto. El schema final de Prisma debe ajustarse contra el código
> real de OPLEX (ver informe de auditoría previo).

---

## 1. Decisiones de alcance (cerradas)

### Tipo de medición por artículo
Cada artículo declara **cómo se comporta su stock y su consumo**:

| Tipo | Se mide por | Corte | Recortes | Costeo |
|------|-------------|-------|----------|--------|
| **DISCRETO** | unidad entera | no aplica | no | por unidad |
| **CONTINUO** | peso / volumen (gr, ml) | no aplica | no (material homogéneo) | por cantidad consumida |
| **LINEAL_1D** | largo (mm) | sí, a lo largo | sí, rastreables | por largo consumido |
| **SUPERFICIE_2D** | ancho × largo / área (m²) | sí, por área | **no** (merma asumida) | por área consumida |

> **CONTINUO** cubre material a granel homogéneo: harina, azúcar, líquidos, pinturas,
> resinas. Es conceptualmente como el 1D pero **sin recortes ni piezas físicas**: 250gr
> de una bolsa son idénticos a 250gr de otra, así que solo importa el **total**. Es el
> tipo más simple de implementar — un único número decimal de stock, que la aritmética
> `Decimal` actual ya soporta. Se compra por presentación (bolsa de 35kg) y se consume
> por cantidad de receta (250gr).

### Reglas del 1D (cable canal, perfiles, caños)
- **Asignación de corte:** el sistema **sugiere** el recorte óptimo (el más chico donde
  entre el corte pedido); el operario **puede cambiarlo** manualmente.
- **Merma automática:** cada artículo define un **largo mínimo útil**. Un recorte por
  debajo de ese umbral se marca automáticamente como **merma** (no reutilizable).
- **Destino del recorte:** solo **consumible en producción**. No es un artículo vendible
  del catálogo → es una entidad interna de stock, no un SKU.

### Reglas del 2D (chapa, plancha, vidrio) — Nivel A
- Se descuenta y costea por **área** (`ancho × largo × cantidad`).
- **No se trazan recortes.** El desperdicio se asume como merma.
- (Nesting / recortes 2D quedan explícitamente **fuera** de v1.)

### Reglas del CONTINUO (harina, líquidos, granel)
- Se compra por **presentación** (ej. bolsa de 35kg = 35.000gr) y se lleva el stock como
  un **único total** en la unidad base (gr o ml).
- Se consume por la cantidad que indica la receta (ej. 250gr por prepizza).
- **Sin piezas ni recortes**: el material es homogéneo, solo se suma y se resta del total.
- El costeo por PPP actual ya funciona sin cambios (costo por gr/ml).

### Base heredada (del informe de auditoría)
- La aritmética ya es `Decimal` en toda la cadena (stock, movimientos, costeo, facturación).
- El costeo por promedio ponderado (PPP) ya soporta fracciones correctamente.
- → **DISCRETO** ya funciona (cero trabajo). **CONTINUO** y **2D Nivel A** son baratos
  (se apoyan en el stock total decimal actual). El grueso del trabajo nuevo está en el
  **1D con recortes** (entidad StockPiece + asignación), el **BOM** y la **función de
  cantidad producible**.

---

## 2. Entidades nuevas / modificadas

### 2.1. Article (MODIFICAR)
Agregar el discriminador de tipo de medición y campos de dimensión.

```
Article {
  ... (campos actuales)
  measurementType   MeasurementType   @default(DISCRETE)   // NUEVO
  isManufactured    Boolean  @default(false)   // NUEVO: true = se produce (tiene BOM); false = se compra/revende
  // Para CONTINUO:
  purchaseSize      Decimal?  // tamaño de la presentación de compra (ej. 35000 gr = bolsa 35kg)
  baseUnit          String?   // unidad base de consumo (gr, ml) — informativa
  // Para LINEAL_1D:
  commercialLength  Decimal?  // largo de la "medida comercial" / presentación (mm), ej. 2000
  minUsableLength   Decimal?  // umbral de merma (mm): recorte < esto = merma
  // Para SUPERFICIE_2D:
  sheetWidth        Decimal?  // ancho de la plancha estándar (mm)
  sheetLength       Decimal?  // largo de la plancha estándar (mm)
}

enum MeasurementType { DISCRETE  CONTINUOUS  LINEAL_1D  SURFACE_2D }
```

> Nota: el `unitOfMeasure` actual (enum UNIT/KG/LTR/MM/M2) se mantiene como está para
> compatibilidad. `measurementType` es la capa nueva que define el comportamiento.

### 2.2. StockPiece (NUEVO) — solo para LINEAL_1D
Representa una **pieza física individual** con su remanente rastreable. Es la clave del
Nivel 2 en 1D: el stock deja de ser un número plano y pasa a ser una lista de piezas.

```
StockPiece {
  id
  tenantId
  articleVariantId       // a qué artículo pertenece
  warehouseId            // en qué depósito está
  originalLength  Decimal  // largo con el que nació (ej. 2000 si es tira nueva)
  currentLength   Decimal  // largo disponible hoy (ej. 1100 tras un corte)
  status          PieceStatus  // AVAILABLE | DEPLETED | SCRAP
  sourceType      PieceSource  // FULL_STOCK (tira nueva) | OFFCUT (recorte de otra pieza)
  parentPieceId?          // si es recorte, de qué pieza salió (trazabilidad)
  unitCost        Decimal  // costo heredado proporcional (PPP × proporción de largo)
  createdAt
}

enum PieceStatus { AVAILABLE  DEPLETED  SCRAP }
enum PieceSource { FULL_STOCK  OFFCUT }
```

- **Stock total 1D** = suma de `currentLength` de las piezas `AVAILABLE`.
  (No se guarda como número aparte; se deriva de las piezas.)
- El `StockLedger` actual sigue existiendo para discreto y 2D; para 1D, el "total" se
  calcula desde `StockPiece`. (Decisión a validar con Claude Code: mantener ambos
  sincronizados o derivar siempre.)

### 2.3. BillOfMaterials + BomLine (NUEVO)
La receta que se **anexa a un artículo producible** (`isManufactured=true`): qué insumos
y cuánto consume producir una unidad. Solo los artículos que se fabrican tienen BOM; los
que se compran y revenden no. Cada producto final tiene su propia receta:
- "Prepizza 30cm fina" → harina 250gr, levadura 5gr, queso 100gr
- "Pan casero redondo 30" → harina 400gr, sal 8gr, levadura 10gr
- "Prepizza 40cm gruesa" → harina 450gr, levadura 8gr, queso 180gr

> Un mismo insumo (harina) aparece en varias recetas con **cantidades distintas**. El
> modelo lo soporta: cada `BomLine` tiene su propia `quantity`, independiente por receta.

```
BillOfMaterials {
  id
  tenantId
  outputArticleVariantId   // qué se produce (artículo con isManufactured=true)
  name
  version         Int      @default(1)   // NUEVO: versión de la receta (trazabilidad histórica)
  isActive        Boolean               // solo una versión activa por producto a la vez
  lines     BomLine[]
  byproducts BomByproduct[]             // NUEVO: salidas adicionales (ver 2.4.b)
}

BomLine {
  id
  bomId
  inputArticleVariantId    // insumo
  // La cantidad se interpreta según el measurementType del insumo:
  quantity        Decimal  // DISCRETO: unidades | CONTINUO: gr/ml | 1D: largo mm | 2D: área
  width?          Decimal  // solo 2D: ancho requerido
  length?         Decimal  // 1D: largo del corte | 2D: largo requerido
  cutsCount?      Int      // 1D: cuántos cortes de ese largo (ej. 3 cortes de 300mm)
  expectedWastePercent Decimal? @default(0)  // NUEVO: merma esperada de este insumo (%),
                                             // ej. 3% de harina por evaporación/desperdicio
}
```

> Ejemplo tablero: BomLine para "Cable Canal 70×30" con `length=300`, `cutsCount=3`
> → consume 900mm en 3 cortes.
> Ejemplo prepizza: BomLine para "Harina" con `quantity=250` → consume 250gr por unidad.

**Versionado (versión de receta):** las recetas cambian con el tiempo (sube el gramaje,
cambia un insumo). `version` permite saber **con qué receta se produjo** cada orden
histórica, clave para el costeo y la trazabilidad. Solo una versión `isActive` por
producto a la vez; al editar una receta en uso, se crea una versión nueva en lugar de
pisar la anterior.

**Merma esperada (`expectedWastePercent`):** desperdicio *planificado* de cada insumo.
Distinto de la merma *real* (`wasteAmount` en el consumo). Afecta el cálculo de cuánto
insumo reservar/consumir y el costeo. Ej.: si la receta pide 250gr de harina con 3% de
merma esperada, el consumo real estimado es 257,5gr.

### 2.4.b BomByproduct (NUEVO) — subproductos / co-productos
Una producción puede generar **más de un producto vendible** además del principal. Ej.:
procesar una pieza grande deja cortes vendibles; un proceso deja un subproducto con valor.

```
BomByproduct {
  id
  bomId
  outputArticleVariantId   // el subproducto que también se genera
  quantity        Decimal  // cuánto se produce de este subproducto por unidad de orden
  costSharePercent Decimal? // % del costo total de producción que absorbe este subproducto
                            // (para repartir costo entre producto principal y subproductos)
}
```

> El **recorte reutilizable 1D** (`StockPiece` tipo OFFCUT) es conceptualmente un
> subproducto, pero se maneja por su propia vía (§4). `BomByproduct` es para subproductos
> **planificados y declarados en la receta** (sé de antemano que salen), no para recortes
> que dependen del corte puntual.

### 2.4. ProductionOrder + consumo + reservas (NUEVO)
La orden de producción, sus reservas de insumos y el registro de consumo real.

```
ProductionOrder {
  id
  tenantId
  outputArticleVariantId
  bomId?                   // receta usada (puede ser ad-hoc sin BOM)
  bomVersion?     Int      // NUEVO: versión de receta con la que se produjo (trazabilidad)
  quantity        Decimal  // cuántas unidades del producto final (se produce entera, no por tandas)
  status          ProductionStatus
  isShortOnMaterials Boolean @default(false)  // avanzó con faltante de insumos
  createdAt, startedAt?, finishedAt?, cancelledAt?
  reservations    StockReservation[]
  consumptions    ProductionConsumption[]
  outputs         ProductionOutput[]   // NUEVO: producto principal + subproductos generados
}

// Estados. SHORT_ON_MATERIALS puede modelarse como flag (isShortOnMaterials)
// o como estado propio; recomendado flag + status para no perder el estado real.
enum ProductionStatus { DRAFT  PLANNED  IN_PROGRESS  DONE  CANCELLED }
```

**ProductionOutput (NUEVO)** — registra cada producto que la orden generó (el principal y
los subproductos), con su cantidad y costo asignado.

```
ProductionOutput {
  id
  productionOrderId
  articleVariantId         // producto principal o subproducto
  isPrimary       Boolean  // true = producto principal; false = subproducto
  quantityProduced Decimal
  cost            Decimal  // costo asignado (según reparto de BomByproduct.costSharePercent)
}
```

**StockReservation (NUEVO)** — reserva de insumos comprometidos a una orden.
Cuando una orden avanza (con o sin faltante), reserva lo que SÍ hay disponible para que
otra orden no lo tome. Al cancelar la orden, las reservas se liberan (reabastecen el stock).

```
StockReservation {
  id
  tenantId
  productionOrderId
  inputArticleVariantId
  warehouseId
  quantityReserved Decimal   // cuánto se reservó de este insumo (según su measurementType)
  stockPieceId?              // 1D: si se reservó una pieza física específica
  status           ReservationStatus  // ACTIVE | CONSUMED | RELEASED
  createdAt
}

enum ReservationStatus { ACTIVE  CONSUMED  RELEASED }
```

> **Modelo de stock en 3 capas** (clave): a partir de las reservas, el stock de cada
> insumo se lee como:
> - **físico total** = lo que hay en el depósito (StockLedger / suma de StockPiece)
> - **reservado** = suma de reservas `ACTIVE`
> - **disponible** = físico − reservado ← lo que una orden nueva puede tomar
>
> La función de cantidad producible (§3) calcula sobre el **disponible**, no sobre el físico.

```
ProductionConsumption {
  id
  productionOrderId
  inputArticleVariantId
  stockPieceId?            // 1D: de qué pieza física se cortó (la sugerida u override)
  quantityConsumed Decimal // largo (1D) / área (2D) / unidades (discreto) / gr-ml (continuo)
  offcutPieceId?           // 1D: recorte generado (nueva StockPiece), si aplica
  wasteAmount     Decimal  // merma generada (recorte < minUsableLength, o desperdicio 2D)
  cost            Decimal  // costo de lo consumido (PPP proporcional)
}
```

---

## 3. Función clave: cantidad producible + cuello de botella

Función de primera clase del módulo (no un extra). Responde dos preguntas que el usuario
hace **antes** de producir:
- "¿Me alcanzan los insumos para producir N unidades?"
- "¿Para cuántas unidades me alcanza con el stock actual?"

### Lógica
Para cada línea de la receta (BOM), calcular cuántas unidades del producto final permite
ese insumo:

```
producibleByLine = floor( stockDisponible(insumo) / cantidadQuePideLaReceta )
```

El **máximo producible** es el **mínimo** de todos esos valores. El insumo que da ese
mínimo es el **cuello de botella** (el que se agota primero).

```
maxProducible   = min(producibleByLine  para cada insumo de la receta)
cuelloDeBotella = el insumo cuyo producibleByLine == maxProducible
```

`stockDisponible` según el tipo de medición del insumo:
- **DISCRETO** → nº de unidades en stock
- **CONTINUO** → total en gr/ml
- **LINEAL_1D** → suma de `currentLength` de piezas `AVAILABLE` (ver §5)
- **SURFACE_2D** → área total disponible

### Ejemplo (prepizza)
Receta: Harina 250gr, Levadura 5gr, Queso 100gr. Pedido: 350 prepizzas.

| Insumo | Stock | Pide receta | Producible |
|--------|-------|-------------|------------|
| Harina | 70.000 gr | 250 gr | 280 |
| Levadura | 500 gr | 5 gr | **100** ← cuello |
| Queso | 20.000 gr | 100 gr | 200 |

→ **maxProducible = 100.** Respuesta al usuario: *"Con el stock actual podés producir 100
prepizzas. El insumo que limita es la Levadura (alcanza para 100). La Harina alcanzaría
para 280 y el Queso para 200."*

> Con 1 sola bolsa de harina (35.000gr) y sin otros límites, la harina daría
> `35.000 / 250 = 140` — coincide con el caso planteado.

### Dónde se usa
- **Desde una orden de producción:** al indicar "quiero hacer 350", validar y advertir si
  no alcanza, indicando el cuello de botella y el máximo posible.
- **Exploratorio (sin orden):** "¿cuántas puedo hacer de X con lo que tengo?" — útil para
  planificar compras.
- Aplica a **cualquier tipo de medición**: la fórmula es la misma, solo cambia cómo se
  lee el `stockDisponible` de cada insumo.

---

## 4. Flujo del caso "cable canal" (1D, end-to-end)

**Estado inicial:** 1 `StockPiece` de Cable Canal → `originalLength=2000`,
`currentLength=2000`, `status=AVAILABLE`, `sourceType=FULL_STOCK`.

**Orden A: tablero que necesita 3×300mm (900mm)**
1. Sistema busca recorte óptimo → solo hay la tira de 2000 → la sugiere.
2. Operario confirma (o cambia).
3. Consume 900mm de esa pieza.
4. La pieza queda `currentLength = 1100`. Como 1100 ≥ minUsableLength → sigue `AVAILABLE`.
   (Si el corte agota la pieza → `status=DEPLETED`.)
5. `ProductionConsumption`: quantityConsumed=900, cost = PPP × (900/2000).

**Orden B: 2×250mm (500mm)**
1. Sistema busca recorte óptimo → encuentra la pieza de 1100 → la sugiere
   (más chica donde entra, antes que abrir una tira nueva de 2000).
2. Consume 500mm → pieza queda `currentLength = 600`.
3. Si 600 ≥ minUsableLength → sigue disponible. Si no → se marca `SCRAP` (merma) y no
   vuelve a ofrecerse.

Esto reproduce exactamente el comportamiento que definiste: 2000 → 1100 → 600.

---

## 5. Flujo del caso "chapa" (2D, Nivel A)

**Insumo:** Chapa SAE 1010 N14 → `measurementType=SURFACE_2D`,
`sheetWidth=1000`, `sheetLength=2000` (plancha estándar).

**Pedido:** 4 piezas de 156×780.
1. Área consumida = `156 × 780 × 4 = 486.720 mm²` (o en m²: 0.48672 m²).
2. Se descuenta esa área del stock total (que se lleva en m² o unidades de plancha).
3. Costo = PPP por m² × área consumida.
4. **No se generan recortes.** El desperdicio de cada plancha se asume como merma
   (registrable como dato informativo, pero no como stock reutilizable).

---

## 6. Flujo del caso "panadería" (CONTINUO, end-to-end)

**Insumo:** Harina → `measurementType=CONTINUOUS`, `purchaseSize=35000` (bolsa 35kg),
`baseUnit="gr"`.

**Receta (BOM) de la Prepizza:** BomLine → Harina, `quantity=250` (gr por prepizza).
(más Levadura, Queso, etc. como líneas adicionales).

**Estado inicial:** stock de harina = 70.000gr (2 bolsas).

**Orden: producir 350 prepizzas**
1. El sistema corre la función de cantidad producible (§3):
   - Harina: 70.000 / 250 = 280 → no alcanza para 350.
   - (Chequea también los demás insumos y toma el mínimo.)
2. Advierte: *"No alcanza para 350. Máximo producible: 280 (o menos si otro insumo
   limita). Cuello de botella: [insumo]."*
3. Si se produce lo que sí alcanza (ej. 280): descuenta `280 × 250 = 70.000gr` → stock
   de harina queda en 0.
4. Costo = PPP por gr × gramos consumidos. Sin piezas, sin recortes — solo resta del total.

Esto reproduce exactamente el caso planteado: con 1 bolsa (35.000gr) alcanza para 140;
con 2 bolsas (70.000gr) para 280.

---

## 7. Ciclo de orden: faltante de insumos, reservas y cancelación

Comportamiento cuando el stock **no alcanza** pero el usuario quiere avanzar igual.

### Regla de reservas
- El stock se lee en 3 capas: **físico − reservado = disponible** (ver §2.4).
- Toda orden que avanza reserva sus insumos (`StockReservation` en estado `ACTIVE`),
  restándolos del disponible para que **otra orden no los tome**.
- La función de producible (§3) siempre mira el **disponible**.

### Flujo con faltante — ejemplo "Prepizza 40cm gruesa", producir 200
1. Usuario crea la orden, elige producto y cantidad (200). El sistema lee el BOM anexado.
2. Corre el chequeo de producible sobre el **disponible**:
   *"Alcanza para 150. Cuello de botella: queso. Faltan insumos para 50 unidades."*
3. El usuario decide:
   - **Ajustar a 150** → produce lo que alcanza, reserva/consume normal, o
   - **Avanzar igual con 200** → la orden se marca `isShortOnMaterials = true`.
4. Si avanza con faltante:
   - **Reserva lo que SÍ hay** de cada insumo (todo el queso disponible, la harina para
     200, etc.) → esas reservas quedan `ACTIVE` y bloqueadas para otras órdenes.
   - La orden queda en cola visible como "esperando insumos". **No consume** (no produce)
     hasta completar el faltante.
5. **Se repone el queso** → el sistema detecta que ya hay disponible para completar →
   **sugiere** habilitar la orden; el usuario **confirma** y recién ahí se produce y se
   consume (las reservas pasan a `CONSUMED`).

> Desbloqueo: **sugerencia automática + confirmación del usuario** (no se dispara sola,
> para que el operario controle el momento de producir).

### Cancelación (con reabastecimiento)
En cualquier momento antes de consumir, el usuario puede **cancelar** la orden:
- La orden pasa a `CANCELLED` (`cancelledAt` se completa).
- Todas sus `StockReservation` `ACTIVE` pasan a `RELEASED` → **los insumos reservados
  vuelven al stock disponible** (reabastecimiento), quedando libres para otras órdenes.
- Esto evita que insumos queden "atrapados" en órdenes que no se van a producir.

> Resumen de estados de reserva: `ACTIVE` (comprometida) → `CONSUMED` (se produjo) o
> `RELEASED` (se canceló y volvió al stock).

---

## 8. Fuera de alcance v1 y roadmap (referencia: Odoo)

Odoo es el estándar de producción PyME; se usa como referencia para ubicar qué es v1 y
qué son fases futuras. **No se busca replicar Odoo** (tiene features de fábrica mediana-
grande que la mayoría de las PyMEs no usa), sino cubrir el núcleo con foco.

### En v1 (incluido en este diseño)
- Tipos de medición (discreto / continuo / 1D con recortes / 2D por área).
- BOM con versionado y merma esperada.
- Subproductos declarados (BomByproduct / ProductionOutput).
- Reservas de stock + estado de faltante + cancelación con reabastecimiento.
- Cantidad producible + cuello de botella.

### Fase 2 (lo que Odoo llama Work Centers / Routing)
- **Centros de trabajo y órdenes de trabajo:** puestos/máquinas, con tiempos por operación.
- **Routing (secuencia de operaciones):** el "cómo se hace" paso a paso, y el **control de
  avances** de cada orden por etapa (esto responde el pedido original de "control de
  avances de órdenes").
- **Planificación de capacidad y programación (scheduling).**

### Fase 3+ (avanzado)
- **MRP** (planificación de necesidades de material a partir de la demanda).
- **Trazabilidad completa por lote/serie** (de qué lote de insumo salió cada producto).
- **Producción parcial / por tandas** (producir una orden en varias entregas). *Nota:
  hoy se produce la orden entera de una vez; el modelo queda preparado para sumarlo sin
  romper — se agregaría `quantityProduced` vs `quantity` en la orden.*

### Explícitamente NO se planea copiar de Odoo (peso muerto para PyME chica)
- PLM / ingeniería de cambios, mantenimiento de máquinas, calidad con puntos de control
  formales, subcontratación, app de códigos de barras en planta.

### Fuera de alcance v1 (detalle técnico)
- Nesting / optimización de corte 2D (acomodo automático de piezas en la plancha).
- Recortes 2D rastreables (remanentes en "L").
- Venta de recortes como SKU del catálogo.
- Optimización matemática de corte 1D (cutting stock problem multi-orden).

Todo esto se puede sumar en fases futuras sin romper el modelo, porque el tipo de medición
por artículo, la entidad de pieza y los outputs múltiples ya dejan los puntos de extensión
abiertos.

---

## 9. Integración con módulos existentes (auditoría de fronteras)

> Basado en la auditoría de puntos de integración del stock. Define qué se toca, qué no,
> el orden de trabajo recomendado y las decisiones de negocio pendientes.

### 9.1. Hallazgo clave: punto de escritura único
**Todo el stock del sistema se escribe por una sola función:**
`InventoryService.recordMovement()`. Ningún módulo escribe stock por fuera de ahí
(facturación, POS, compras, devoluciones — todos pasan por esa función). Además, cada
operación corre dentro de **una transacción de Postgres por request** (si algo falla,
se revierte todo: factura + stock + asiento).

**Implicancia para producción:** las reservas y el concepto de "disponible" se
implementan **en ese único punto**, y todos los módulos lo respetan automáticamente.
No hay que modificar módulo por módulo. Es el factor que hace el proyecto viable.

### 9.2. Mapa de impacto por módulo

| Módulo | Riesgo | Qué pasa |
|--------|--------|----------|
| **Tesorería / Cheques** | ⚪ Nulo | Cero dependencia de stock/artículos. Confirmado. No se tocan. |
| **POS (Caja)** | 🟢 Bajo | Delega 100% en SalesService. No conoce el stock por sí mismo. |
| **Dashboard / Reportes / IA** | 🟢 Bajo | Solo lectura. Se adaptan a mostrar "disponible" si se desea. |
| **Contabilidad** | 🟢 Aditivo | No se rompe. Hay que **sumar** asientos de producción (consumo insumos → producto terminado). |
| **Facturación / Sales** | 🔴 Alto (sano) | Descuenta stock y dispara COGS. Deberá descontar contra **disponible** (total − reservado), no contra total. Se cambia dentro de `recordMovement`. |
| **Compras / GoodsReceipts** | 🔴 Alto | Asume **unidad de compra = unidad de stock, sin conversión**. Rompe el caso harina (bolsa 35kg → 35.000gr). Hay que agregar factor de conversión. |
| **Devoluciones a proveedor** | 🟠 Medio-alto | Escribe stock, depende de la línea de recepción original. |

### 9.3. Bug pre-existente a corregir ANTES (fundación)
**Condición de carrera en el costeo de entradas** (ya existe hoy, sin producción):
cuando dos entradas con costo (PURCHASE_IN / PRODUCTION_IN / RETURN) sobre el mismo
`(depósito, variante)` ocurren en paralelo, ambas leen el promedio viejo sin bloqueo,
calculan por separado y la segunda escritura pisa a la primera → la **cantidad** queda
bien (por el `increment` atómico) pero el **costo promedio (PPP) queda mal** (refleja
solo una de las dos entradas).

- El descuento de **ventas NO tiene este problema** (está protegido por el `updateMany`
  atómico con `quantity >= delta`).
- **El propio código ya sabe resolverlo:** usa `SELECT ... FOR UPDATE` en Facturación
  (`InvoicingService`) y Compras (`GoodsReceiptService`) para cálculos concurrentes
  análogos. Falta aplicar ese mismo patrón al costeo de stock.
- **Por qué importa para producción:** el módulo disparará muchos más movimientos
  concurrentes de entrada/salida sobre las mismas variantes → amplifica este bug latente.
- **Acción:** aplicar `SELECT ... FOR UPDATE` sobre la fila de `StockLedger` antes de
  leer el promedio para recalcular. Arreglo acotado, con patrón ya existente para copiar.
  Mejora el sistema **hoy**, aunque nunca se hiciera producción.

### 9.4. Orden de trabajo recomendado (por fases)
1. **Fundación — locking del costeo de entradas.** Corregir el bug §9.3. Pequeño,
   aislado, mejora el sistema actual. Base sólida para todo lo demás.
2. **Reservas / disponible en `recordMovement`.** Implementar "disponible = físico −
   reservado" en el punto único de escritura, conservando la atomicidad actual. Con esto,
   facturación y compras respetan reservas sin tocarlos individualmente.
3. **Conversión de unidad de compra.** Agregar el factor de conversión en
   `GoodsReceiptsService` y el costeo (bolsa 35kg → 35.000gr). Habilita el tipo CONTINUO
   y cualquier presentación de compra ≠ unidad de consumo.
4. **Entidades de producción.** StockPiece, BOM, ProductionOrder, StockReservation,
   función de producible — sobre la base ya endurecida.
5. **Asientos contables de producción.** Registrar el hecho económico de producir
   (consumo de insumos → alta de producto terminado) en contabilidad.

### 9.5. Decisiones de negocio pendientes (definir antes de construir)
- **¿La venta puede tomar stock reservado?** Si hay 10 unidades y 4 reservadas para
  producción, ¿la factura ve 6 (disponible) o puede forzar sobre las 10? Recomendado:
  ver 6 por defecto, con override manual autorizado si el negocio lo requiere.
- **¿Cómo se contabiliza la producción?** Definir el asiento: consumo de insumos
  (haber inventario insumos) → alta de producto terminado (debe inventario producto),
  con el costo heredado. Coordinar con el equipo contable.
- **¿Reposición automática y alertas de mínimo miran total o disponible?** Recomendado:
  disponible, para no sugerir reponer algo que ya está comprometido.
- **Costeo por pieza vs promedio:** el PPP asume fungibilidad; las piezas 1D con costos
  distintos rompen ese supuesto. Confirmar que StockPiece con costo propio convive con el
  PPP de discretos/continuos sin inconsistencias en la valuación de inventario.

---

## 10. Prompt sugerido para Claude Code

> Basándote en este documento de diseño y en el modelo actual de OPLEX (Article,
> ArticleVariant, StockLedger, StockMovement, costeo PPP, InventoryService.recordMovement
> como punto único de escritura), proponé el plan técnico del módulo de producción v1.
> NO implementes lógica todavía: primero quiero revisar el schema, el orden de fases y las
> migraciones. **Respetá el orden de trabajo de la §9.4** (primero endurecer la base,
> después construir producción). Puntos a resolver:
> 1. **Fundación:** cómo aplicar `SELECT ... FOR UPDATE` al costeo de entradas en
>    `recordMovement` para cerrar el bug de concurrencia §9.3, reusando el patrón que ya
>    existe en InvoicingService/GoodsReceiptService. Mostrá el cambio propuesto.
> 2. Cómo integrar `measurementType` (DISCRETE / CONTINUOUS / LINEAL_1D / SURFACE_2D) y
>    el flag `isManufactured` en Article sin romper los artículos discretos existentes.
> 3. Para 1D: cómo conviven StockPiece (derivar el total) con el StockLedger actual —
>    ¿derivar siempre desde piezas, o mantener un agregado sincronizado? Recomendá y justificá.
> 4. Para CONTINUO: confirmá que se resuelve solo con el StockLedger actual, y cómo se
>    representa la presentación de compra (bolsa 35kg → 35.000gr) — esto toca
>    `GoodsReceiptsService` (§9.4 fase 3), proponé el factor de conversión.
> 5. Cómo hereda el costo cada StockPiece y cada recorte desde el PPP existente, y cómo
>    convive el costeo por pieza con el PPP de discretos/continuos (§9.5).
> 6. **Reservas (StockReservation):** cómo implementar "disponible = físico − reservado"
>    dentro de `recordMovement` (punto único, §9.1) para que facturación y compras lo
>    respeten sin tocarlos, conservando la atomicidad actual y sin condiciones de carrera.
> 7. **Estado de faltante:** modelar `isShortOnMaterials` + ciclo de reservas
>    ACTIVE → CONSUMED (al producir) / RELEASED (al cancelar, reabasteciendo stock).
> 8. Índices y constraints (buscar recortes AVAILABLE por artículo+depósito ordenados por
>    currentLength; sumar reservas ACTIVE por insumo+depósito).
> 9. Función de **cantidad producible + cuello de botella** (§3): dónde vive (servicio),
>    cómo lee el **disponible** según cada measurementType, cómo se expone.
> 10. **Contabilidad:** proponé el asiento de producción (consumo insumos → producto
>     terminado con costo heredado), sin romper los asientos de venta/compra existentes.
>     Contemplá el reparto de costo entre producto principal y **subproductos**
>     (BomByproduct.costSharePercent → ProductionOutput.cost).
> 11. **BOM versionado + merma esperada + subproductos:** cómo modelar versión de receta
>     (solo una activa por producto; órdenes históricas guardan `bomVersion`),
>     `expectedWastePercent` por línea (afecta reserva/consumo y costeo), y salidas
>     múltiples (ProductionOutput: principal + subproductos).
> 12. Impacto en lectores actuales (Dashboard, listReorderSuggestions, ArticlePicker):
>     ¿mostrar total o disponible? Migraciones de datos para artículos ya cargados.
> Entregá: plan por fases (§9.4) + schema propuesto + lista de migraciones + riesgos, en
> un informe. Sin aplicar cambios.
