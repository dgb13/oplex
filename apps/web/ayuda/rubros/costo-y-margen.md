---
title: Costo y margen de cada trabajo
summary: Cargar las horas y las compras de una orden de trabajo y ver cuánto ganaste en cada trabajo y en el mes.
minutes: 5
roles: Dueño, Administrador, Contador
---

Con el módulo **Costo por trabajo**, cada orden de trabajo muestra cuánto costó: los repuestos que salieron del stock, las compras que hiciste especialmente para ese trabajo (un repuesto pedido, la tornería de un tercero) y las horas de tu equipo. Contra lo cobrado sin IVA, te da el margen.

## Antes de empezar

- Prendé **Costo por trabajo** en tu foto › **Rubro y módulos** (en un taller ya viene prendido).
- **Quién ve qué:**
  - Los importes y el margen los ven el **Dueño**, los **Administradores** y el **Contador**.
  - **Ventas** carga horas, pero ve sólo **Horas trabajadas**, sin importes.
  - Las compras las suman el Dueño, los Administradores, **Compras** y el Contador. Compras ve las compras de la orden, pero no el ingreso ni el margen.
- Para que los repuestos tengan costo, tienen que entrar al stock con su costo: al darlos de alta con las unidades que tenés, al importarlos o al recibir la compra. Ver [Precios, costos e IVA](/documentacion/inventario/precios-costos-iva).

## Cómo se calcula

**Margen = ingreso sin IVA − repuestos − compras para el trabajo − horas.**

| Parte | De dónde sale |
| --- | --- |
| **Facturado (sin IVA)** | La factura del trabajo. Si todavía no se facturó, dice **Presupuestado (sin IVA)** y usa el presupuesto. |
| **Repuestos (costo)** | Los artículos facturados, a su costo. Sin factura, dice **Repuestos (estimado)** y usa el costo promedio actual de los artículos del presupuesto en tu stock. |
| **Compras para el trabajo** | Las facturas de compra que sumaste a la orden. |
| **Horas** | Las horas cargadas por su costo por hora. |

> [!NOTA]
> Si un repuesto no tiene costo o unas horas no tienen costo por hora, Oplex te lo avisa en ámbar: cuentan como $0 y el margen sale más alto de lo real.

## Cargar las horas

1. En la orden, sección **Costo y margen** (o **Horas trabajadas**), completá **Quién**, **Horas** (por ejemplo 2,5) y, si ves importes, **Costo por hora**. Si a esa persona ya le cargaste horas, Oplex propone su último costo por hora.
2. Si querés, escribí **Qué hizo (opcional)**.
3. Tocá **Cargar horas**. Para borrar una carga, tocá la papelera de su fila.

## Sumar una compra para el trabajo

1. Cargá la factura del proveedor como siempre, en **Compras**. Ver [Facturas de compra](/documentacion/compras/facturas-de-compra).
2. En la orden, en **Compras para este trabajo**, tocá **+ Sumar una compra**.
3. Buscá la factura por proveedor, número o nota y tocá **Sumar a esta orden**. Una compra va a una sola orden; si ya está en otra, dice **En otra orden**.

## Margen por trabajo

En **Órdenes de trabajo** tocá **Margen por trabajo** (lo ven el Dueño, los Administradores y el Contador). Elegí el período y vas a ver el **Ingreso (sin IVA)**, el **Costo** y el **Margen** del período, y una fila por orden con su cliente, estado, ingreso, costo, horas y margen. Las órdenes sin facturar usan lo presupuestado.

![Margen por trabajo del mes](/ayuda/capturas/rubros-margenes.jpg)

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
| --- | --- | --- |
| Sin presupuesto ni factura todavía: no hay ingreso para calcular el margen. | La orden no tiene presupuesto ni factura. | Tocá **Armar presupuesto** en la orden. |
| Completá quién y cuántas horas | Falta el nombre o las horas. | Completá los dos datos. |
| Esa compra ya está cargada en otra orden | La factura de compra ya se sumó a otra orden. | Abrí la otra orden si la querés mover. |
| Sólo el dueño, un administrador o el contador ven los márgenes. | Tu rol no ve importes. | Pedíselo al Dueño o a un Administrador. |
