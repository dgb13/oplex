---
title: Pendientes de entrega
summary: Facturá aunque no tengas todo el stock y entregá lo que falta cuando llegue, desde Ventas › Pendientes de entrega.
minutes: 3
roles: Dueño, Administrador, Ventas, Inventario
---

A veces el cliente paga hoy algo que todavía no tenés en el depósito. Oplex te deja facturarlo igual: lo que hay se entrega en el momento y lo que falta queda **pendiente de entrega**, sin descontarse del stock hasta que efectivamente sale. Cuando llega la mercadería, lo entregás desde una sola pantalla.

## Facturar sin stock suficiente

1. **Emití la factura como siempre.** Desde [Nueva factura](/documentacion/ventas/emitir-factura) o con **Convertir a factura** en una cotización.
2. **Mirá el aviso.** Si alguna línea no alcanza con el stock del depósito elegido, aparece **Falta stock para entregar todo**, con las columnas **Facturás**, **Se entrega ahora** y **Queda pendiente**.
3. **Tocá Facturar igual.** La factura sale completa, con su CAE. Lo que había se descuenta ahora; el resto queda pendiente. Si preferís cambiar algo, tocá **Volver y corregir**.

![Aviso Falta stock para entregar todo con la cantidad pendiente](/ayuda/capturas/ventas-falta-stock.jpg)

Oplex avisa en la campana a quienes manejan el depósito. En el detalle de la factura aparece la marca **Pendiente de entrega** y, debajo de cada línea afectada, **Faltan entregar** con la cantidad.

> [!NOTA]
> Esto vale para **Nueva factura** y **Convertir a factura**. En la **Caja** no: ahí no se puede vender más de lo que hay (ver [Vender y cobrar](/documentacion/caja/vender-y-cobrar)).

## Entregar lo pendiente

1. **Abrí la pantalla.** Andá a **Ventas › Pendientes de entrega**. Arriba ves cuántas **líneas pendientes** hay y cuántas **se pueden entregar ya**.
2. **Revisá la lista.** Cada fila muestra **Factura**, **Cliente**, **Artículo** (con el depósito), la cantidad **Pendiente** y **Stock ahora** (por ejemplo **hay 6**).
3. **Tocá Entregar.** Oplex descuenta del depósito de la factura todo lo que haya, hasta completar lo pendiente, y registra el costo de lo vendido con el costo de ese momento.

Si no alcanza para todo, se entrega una parte y la fila queda con el resto: por ejemplo, **Entregaste 4 de Amoladora angular 115 mm. Quedan 2 pendientes.** Cuando todavía no hay nada en el depósito, el botón **Entregar** está apagado (**Todavía no hay stock en el depósito para entregar**).

## Si se anula la factura

Si hacés una [nota de crédito](/documentacion/ventas/nota-de-credito) sobre una factura con algo pendiente, primero se cancela lo pendiente, sin tocar el stock. Sólo lo que ya se había entregado vuelve al depósito.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **No hay entregas pendientes. Cuando factures algo sin stock suficiente, aparece acá.** | No hay nada pendiente. | Nada: está todo entregado. |
| **Esa entrega ya no está pendiente** | Otra persona ya la entregó, o se anuló con una nota de crédito. | Actualizá la página. |
| **No se pudo registrar la entrega.** | Falla al guardar o el stock cambió mientras tanto. | Probá de nuevo. Revisá el stock del depósito en Inventario. |
