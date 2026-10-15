---
title: Pedidos de cotización
summary: Cómo pedirle precio a uno o varios proveedores, comparar las respuestas y convertir la mejor en orden de compra.
minutes: 6
roles: Dueño, Administrador, Compras, Inventario
---

Un pedido de cotización es la lista de artículos que necesitás comprar, para pedirle precio a un proveedor antes de comprometerte. Con Oplex podés pedirle lo mismo a varios proveedores a la vez, ver las respuestas lado a lado y quedarte con la más barata. Cuando decidís, el pedido se convierte en orden de compra con un clic.

Todo está en **Compras › Compras**, pestaña **Pedidos de Cotización**.

## Antes de empezar

- Los proveedores tienen que estar cargados (ver [Proveedores](/documentacion/compras/proveedores)). Igual, desde el formulario podés crear uno nuevo con **+ nuevo proveedor**.
- Los artículos tienen que existir en Inventario.
- Conviene tener cargada tu condición frente al IVA (ver [Precios, costos e IVA](/documentacion/inventario/precios-costos-iva)).

## Pasos: pedir cotización a un proveedor

1. **Tocá Nuevo pedido.** Se abre **Nuevo pedido de cotización**.
2. **Elegí el Proveedor y la Moneda.** Son los dos datos obligatorios. Por ejemplo, Pinturas Cordobesas SRL en ARS.
3. **Completá las condiciones, si querés.** **Modo de transporte**, **Forma de pago**, **Plazo de entrega**, **Válido hasta** y **Notas**. Las tres primeras son listas que armás vos en la pestaña **Catálogos** (ver abajo).
4. **Cargá las líneas.** En cada una elegí el artículo y la cantidad. Con **+ Agregar línea** sumás más. El **Costo est.** es opcional en este momento: lo completás cuando el proveedor te responde. Al lado de **Líneas · los costos estimados están** elegís si esos costos son **sin IVA** o **con IVA**.
5. **Tocá Crear pedido.** El pedido queda en estado **Borrador**, con un número como PED-000001.
6. **Mandale el pedido al proveedor.** Tocá **Ver**, elegí el estilo y tocá **Descargar PDF**. Ese PDF se lo mandás por el medio que uses con ese proveedor.

> [!NOTA]
> El pedido de cotización no se envía desde Oplex: descargás el PDF y lo mandás vos. Lo que sí se envía por email o WhatsApp desde Oplex es la orden de compra (ver [Órdenes de compra y recepción](/documentacion/compras/ordenes-y-recepcion)).

## Pasos: cargar la respuesta y emitir la orden

1. **Abrí el pedido con Ver y tocá Editar.** Sólo se pueden editar los pedidos en **Borrador**.
2. **Completá el Costo est. de cada línea** con lo que te cotizó el proveedor, y tocá **Guardar cambios**.
3. **Tocá Emitir Orden de Compra.** Oplex crea la orden con esas líneas y costos, y te pregunta si querés enviársela al proveedor ahora.

> [!IMPORTANTE]
> Para emitir la orden de compra, todas las líneas tienen que tener costo estimado.

## Pasos: pedir a varios proveedores y comparar

1. **Tocá Pedir a varios proveedores.** Se abre **Pedir cotización a varios proveedores**.
2. **Marcá los proveedores** en **Proveedores a cotizar**. Tienen que ser dos o más. Por ejemplo, Distribuidora Tornillos del Sur SA y otra distribuidora para los tornillos autoperforantes.
3. **Completá Moneda, condiciones y las Líneas (mismas para todos).**
4. **Tocá Crear pedidos.** Oplex crea un pedido por proveedor. En la lista aparecen con la etiqueta **Comparación**.
5. **Cargá la respuesta de cada proveedor.** Abrí cada pedido con **Ver › Editar** y completá el **Costo est.** de cada línea.
6. **Tocá Comparar** en cualquiera de los pedidos del grupo. Se abre **Comparar cotizaciones**: una columna por proveedor, con el precio de cada artículo y el **Total estimado**. El precio más barato de cada fila aparece resaltado en verde.
7. **Tocá Elegir este proveedor** debajo del ganador. Oplex emite su orden de compra y cancela automáticamente los pedidos de los demás.

## Otras formas de crear pedidos

- **Desde las alertas de stock mínimo** en Inventario: con **Pedir cotización** en un artículo, o seleccionando varios y tocando **Crear pedidos de cotización**. Oplex arma un pedido por cada proveedor preferido. Ver [Stock mínimo](/documentacion/inventario/stock-minimo).
- **Desde la lista de artículos** de Inventario: con **Pedido de costos** repartís los artículos de la lista entre proveedores y se genera un pedido para cada uno. Ver [Catálogo y listado](/documentacion/inventario/catalogo-y-listado).
- **Clonar**: en la lista de pedidos, **Clonar** crea una copia en borrador de un pedido anterior. Sirve para compras que repetís seguido.

## Estados del pedido

| Estado | Qué significa |
|---|---|
| **Borrador** | Recién creado. Se puede editar, cancelar o convertir en orden. |
| **Comprado** | Ya se emitió la orden de compra, pero todavía no se le envió al proveedor. Al lado ves el número de la orden. |
| **Enviado** | La orden de compra ya se le mandó al proveedor. |
| **Cancelado** | Lo cancelaste vos con **Cancelar pedido**, o perdió en una comparación. |

## Catálogos y numeración

- En la pestaña **Catálogos** cargás las opciones de **Modos de transporte**, **Formas de pago** y **Plazos de entrega** (por ejemplo "Flete del proveedor", "30 días", "48 horas"). Escribí en **Agregar...** y apretá Enter.
- En la pestaña **Configuración** elegís el **Prefijo de Pedidos de Cotización** (por defecto PED) y el **Estilo preferido de PDF**. Cada usuario tiene su propia numeración.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Completá proveedor y moneda** | Falta alguno de los dos. | Elegí proveedor y moneda. |
| **Cada línea necesita un artículo y una cantidad mayor a cero** | Hay una línea vacía o con cantidad 0. | Completala o borrala con la ✕. |
| **Elegí al menos dos proveedores para poder comparar** | En el pedido a varios marcaste uno solo. | Marcá dos o más, o usá **Nuevo pedido**. |
| **No se pudo emitir la orden de compra** | Casi siempre, falta el costo en alguna línea. | Editá el pedido y completá todos los **Costo est.** |
