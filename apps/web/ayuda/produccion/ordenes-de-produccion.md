---
title: Órdenes de producción
summary: Cómo crear una orden, reservar los insumos, pedir lo que falta y completarla para que el producto entre al stock.
minutes: 7
roles: Dueño, Administrador, Inventario
---

Una orden de producción dice qué producto vas a fabricar y cuántas unidades. Al crearla, Oplex reserva los insumos de la receta en un depósito para que nadie los venda ni los use en otra orden. Cuando la terminás, descuenta los insumos del stock, suma el producto fabricado y calcula su costo.

## Antes de empezar

- Necesitás un plan con **Producción** (desde **Bronze**; no está en **Basic Gratis**).
- El producto tiene que tener una receta activa. Mirá [Recetas de producción](/documentacion/produccion/recetas).
- Para crear, iniciar, completar o cancelar órdenes necesitás el rol Dueño, Administrador o Inventario.

## El Tablero

En **Producción › Tablero** ves todas las órdenes y tres indicadores arriba:

- **Órdenes en curso**: las planificadas o en producción.
- **Esperando insumos**: las que no tienen todo el material reservado.
- **Producidas hoy**: las completadas en el día.

La lista muestra **Número**, **Producto**, **Cantidad**, **Estado**, **Inicio**, **Creada** y **Creó**. En **Inicio** una orden que todavía no arrancó muestra la fecha programada con "(programada)", o "(atrasada)" si la fecha ya pasó.

![Tablero de Producción con los tres indicadores y la lista de órdenes](/ayuda/capturas/produccion-tablero.jpg)

## Pasos

1. Andá a **Producción › Tablero** y tocá **Nueva orden**.
2. Elegí el producto en **Producto a fabricar**.
3. Elegí el **Depósito** de donde salen los insumos y adonde entra el producto, por ejemplo "Depósito Central".
4. Completá **Cantidad a producir**.
5. Revisá el **Inicio programado**. Viene con la fecha de hoy; podés poner una fecha futura. Los insumos se reservan igual al crear la orden.
6. Mirá el cuadro de disponibilidad: "Con el stock actual se pueden producir hasta…" y una barra por insumo con lo disponible. El insumo que limita la producción aparece resaltado.
7. Tocá **Crear orden**. La orden queda **Planificada** y se abre su detalle.

> [!NOTA]
> Si no alcanza el material, la orden se crea igual: reserva lo que hay y queda con la marca **Esperando insumos**.

## Seguir la orden

En el detalle de la orden ves la cantidad, quién la creó, las fechas y estos cuadros:

- **Insumos**: por cada insumo, lo reservado sobre lo requerido, con una barra verde (cubierto), ámbar (parcial) o roja (nada reservado). Si falta algo dice "Faltan…" y el proveedor preferido del insumo.
- **Insumos reservados**: cada reserva con su depósito, cantidad y estado (**Reservado**, **Consumido** o **Liberado**).
- **Consumo real** y **Producido**: aparecen al completar la orden, con cantidades, merma y costo.

A la derecha está el panel de comentarios, donde tu equipo puede escribir y mencionarse sobre esa orden.

Mientras la orden está **Planificada** podés cambiar el **Inicio programado** y tocar **Guardar**.

## Pedir lo que falta

1. En el cuadro **Insumos**, tocá **Pedir cotización por faltantes**.
2. Revisá la ventana: Oplex arma un pedido de cotización por proveedor, con lo que falta de cada insumo pasado a la unidad de compra.
3. Tocá **Crear 1 pedido** (o **Crear N pedidos**). Los pedidos quedan en **Compras › Compras**, pestaña **Pedidos de Cotización**, donde podés editarlos. Mirá [Pedidos de cotización](/documentacion/compras/pedidos-de-cotizacion).

> [!NOTA]
> Sólo entran los insumos que tienen **Proveedor preferido** cargado en Inventario. Los demás se informan aparte para que les asignes uno.

Cuando entre la mercadería, volvé a la orden y tocá **Reintentar reserva**. Si la orden ya tenía algo reservado, se usa el mismo depósito.

## Fabricar y completar

1. Cuando empieza el trabajo, tocá **Iniciar producción**. La orden pasa a **En curso** y queda registrada la fecha real de inicio. Este paso es opcional, pero sin él el Historial no puede medir cuánto tardó la fabricación.
2. Cuando terminás, tocá **Completar orden**. La orden pasa a **Completada**: se descuentan los insumos, entra el producto al stock del depósito y se registra el costo.

Al completar, Oplex también hace solo el asiento contable del traspaso de insumos a producto terminado. Si la orden la creó otra persona, le llega un aviso de que terminó.

> [!IMPORTANTE]
> No se puede completar una orden que sigue **Esperando insumos**. Primero conseguí el material y tocá **Reintentar reserva**.

## Cancelar una orden

Tocá **Cancelar orden**. Las reservas se liberan y los insumos vuelven a quedar disponibles. No hay movimientos de stock que deshacer, porque una reserva no descuenta stock. La acción se ejecuta apenas tocás el botón, sin pedir confirmación.

## Numeración de tus órdenes

Cada usuario numera sus propias órdenes, con su prefijo y su correlativo. Para cambiar el tuyo, andá a **Producción › Configuración**, escribí el **Prefijo** (por ejemplo, LG para Laura Gómez) y tocá **Guardar cambios**. Debajo ves cómo va a quedar el número, por ejemplo LG-000012.

## Estados de una orden

| Estado | Qué significa |
| --- | --- |
| Borrador | La orden existe pero todavía no reservó insumos. Elegí un **Depósito para reservar** y tocá **Confirmar y reservar**. |
| Planificada | Insumos reservados (todos o parte). Esperando que empiece el trabajo. |
| En curso | Se tocó **Iniciar producción**. |
| Completada | El producto ya entró al stock. |
| Cancelada | Se liberaron las reservas. |

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
| --- | --- | --- |
| Este producto todavía no tiene una receta activa. | El producto no tiene receta. | Tocá **Creá una en Recetas** y cargala. |
| Elegí qué producto vas a producir / Elegí el depósito / Ingresá una cantidad válida | Falta un dato de la orden. | Completá el campo que indica. |
| A esta orden todavía le faltan insumos - volvé a confirmarla cuando haya stock suficiente | Quisiste completar una orden que espera insumos. | Cuando tengas el material, tocá **Reintentar reserva** y después **Completar orden**. |
| Esta orden ya tiene insumos reservados en otro depósito - usá ese mismo depósito para completar la reserva | Todas las reservas de una orden van al mismo depósito. | Usá el depósito que ya tiene reservas, o pasá el material a ese depósito. |
| Faltan piezas donde hacer los cortes | Los milímetros alcanzan, pero ninguna barra o recorte es lo bastante largo para algún corte. | Recibí barras nuevas y tocá **Reintentar reserva**. Mirá [Piezas y recortes](/documentacion/produccion/piezas-y-recortes). |
| No se puede cancelar una orden que ya fue completada o cancelada | La orden ya está cerrada. | No hace falta hacer nada. |
