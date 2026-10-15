---
title: Depósitos y movimientos de stock
summary: Cómo crear depósitos y registrar a mano entradas, salidas y ajustes de stock.
minutes: 4
roles: Dueño, Administrador, Inventario
---

Un **depósito** es cada lugar físico donde guardás mercadería: tu local, un galpón, una sucursal. Oplex lleva el stock de cada artículo por depósito. La mayoría de los movimientos se registran solos (cuando facturás, recibís una compra o terminás una producción), pero cuando hace falta corregir algo a mano, lo hacés con un **movimiento de stock**.

## Antes de empezar

- Necesitás el rol Dueño, Administrador o Inventario.
- Al crear la empresa, Oplex arma un depósito. Si no tenés ninguno, el alta de artículos te ofrece **Crear "Depósito principal"**.

## Pasos: crear un depósito

1. **Andá a Inventario y tocá + Nuevo depósito.**
2. **Escribí el Nombre.** Por ejemplo, "Sucursal Norte".
3. **Si querés, completá Ubicación (opcional).** Por ejemplo, la dirección.
4. **Tocá Crear.** El depósito aparece como una columna más en la lista de Inventario, con el stock de cada artículo en ese lugar. La columna **Total** suma todos los depósitos.

Ferretería Los Andes trabaja con dos depósitos: **Depósito Central** y **Sucursal Norte**.

## Pasos: registrar un movimiento

1. **En Inventario, tocá + Nuevo movimiento.** Se abre **Nuevo movimiento de stock**.
2. **Elegí el artículo en Artículo / variante.** Podés buscar por nombre o SKU.
3. **Elegí el Depósito.**
4. **Elegí el Tipo de movimiento.** Ver la tabla de abajo.
5. **Escribí la Cantidad.** En un ajuste, usá un número positivo para sumar y negativo para restar (por ejemplo, -3).
6. **Si es una compra o una producción, cargá el Costo unitario.** Indicá si el número es **sin IVA** o **con IVA**; Oplex te muestra el costo real que va a guardar.
7. **Tocá Registrar.** El stock se actualiza en el momento.

![Ventana Nuevo movimiento de stock con un ajuste manual](/ayuda/capturas/inventario-nuevo-movimiento.jpg)

## Tipos de movimiento

| Tipo | Cuándo usarlo | Pide costo |
|---|---|---|
| **Compra (entrada)** | Entró mercadería que no viene de una orden de compra cargada en Oplex. | Sí |
| **Venta (salida)** | Salió mercadería por una venta que no se registró en Oplex. | No |
| **Devolución (entrada)** | Un cliente te devolvió mercadería. | No |
| **Producción (entrada)** | Entró un producto que fabricaste fuera del módulo Producción. | Sí |
| **Producción (salida/consumo)** | Consumiste insumos fuera del módulo Producción. | No |
| **Ajuste manual (+/-)** | Corregir una diferencia de inventario: rotura, pérdida, conteo físico. | No |

> [!IMPORTANTE]
> Si la mercadería llega por una orden de compra que ya cargaste en Oplex, no uses este formulario: usá **Recibir mercadería** desde el detalle de la orden en Compras. Ahí Oplex controla la cantidad contra lo pendiente y toma el costo de la orden. Ver [Órdenes de compra y recepción](/documentacion/compras/ordenes-y-recepcion).

> [!NOTA]
> Los artículos medidos por pieza (barras y recortes, tipo **Lineal (por metro)**) no aparecen en este formulario. Su entrada se registra con **Recibir mercadería** en Compras y su consumo, desde una orden de producción.

## Pasar mercadería de un depósito a otro

Oplex no tiene un tipo de movimiento de transferencia. Para pasar, por ejemplo, 10 cajas de tornillos autoperforantes del Depósito Central a la Sucursal Norte, registrá dos movimientos de **Ajuste manual (+/-)**:

1. Uno en **Depósito Central** con cantidad **-10**.
2. Otro en **Sucursal Norte** con cantidad **10**.

## Lo que mueve el stock solo

No hace falta registrar movimientos a mano para:

- Las facturas de venta y las ventas de la Caja (salida). Si facturaste algo que no tenías en stock, sale cuando lo entregás desde [Pendientes de entrega](/documentacion/ventas/pendientes-de-entrega).
- Las devoluciones a proveedores (salida).
- Las notas de crédito con devolución de mercadería (entrada).
- La recepción de una orden de compra (entrada, con su costo).
- Las órdenes de producción (consumo de insumos y entrada del producto terminado).

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| No hay stock suficiente en este depósito: hay 4 y se piden 10 | Querés sacar más de lo que hay en ese depósito. | Revisá la cantidad o el depósito elegido. Si el stock real es mayor, primero hacé un **Ajuste manual (+/-)** positivo. |
| No hay stock disponible suficiente en este depósito: hay 4 libres (6 reservadas para producción) y se piden 10 | Parte del stock está reservado para una orden de producción. | Sacá sólo lo libre, o liberá la reserva desde la orden de producción. |
| Ingresá el costo unitario de la compra | Elegiste **Compra (entrada)** o **Producción (entrada)** sin costo. | Completá **Costo unitario**. |
| La cantidad no puede ser cero | Escribiste 0. | Escribí la cantidad a mover. |
| Para recibir mercadería contra una Orden de Compra, usá "Recibir mercadería" desde Compras - no este movimiento manual. | Intentaste asociar el movimiento a una orden de compra. | Hacé la recepción desde el detalle de la orden en Compras. |
