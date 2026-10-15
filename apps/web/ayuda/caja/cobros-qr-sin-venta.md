---
title: Cobros QR sin venta
summary: Qué hacer cuando un cliente pagó con QR y la venta no llegó a confirmarse - confirmar la venta o devolverle el dinero.
minutes: 3
roles: Dueño, Administrador, Ventas
---

A veces el cliente paga con el QR de Mercado Pago pero la venta no llega a confirmarse: se cortó internet, se cerró la ventana o ARCA no respondió. Esa plata ya está en tu cuenta de Mercado Pago, pero todavía no hay factura. Oplex la guarda como **cobro con QR sin venta** y te avisa en la Caja para que la resuelvas: confirmás la venta o le devolvés el dinero al cliente.

## Dónde lo ves

En la pantalla de venta aparece una franja ámbar arriba: **1 cobro con QR acreditado sin venta**, con el monto y la hora (**hoy 10:42**), y la aclaración **El cliente ya pagó y falta confirmar la venta.** Tocá **Resolver**.

Se abre **Cobros con QR sin venta**. Cada cobro muestra el monto, **Pago acreditado**, cuándo se pagó, el número de operación, quién generó el QR y, si quedó guardada, la venta (cliente, letra de factura y artículos).

## Confirmar la venta

Usalo cuando el cliente se llevó la mercadería.

1. **Tocá Confirmar venta** en el cobro.
2. **Revisá la venta.** Ves el cliente, los artículos, el **Total** y **Pagado con Mercado Pago**. Al confirmar **se emite la factura con CAE y se descuenta el stock. No se le cobra de nuevo al cliente.**
3. **Tocá Confirmar venta.** Aparece **Venta confirmada** con el número de factura. Podés tocar **Imprimir ticket**.

Si la confirmación falla, el cobro sigue acreditado y pendiente: no se emitió factura ni se le vuelve a cobrar al cliente. Resolvé el problema y tocá **Reintentar**.

## Cobros sin la venta guardada

Si el cobro dice **Este cobro no tiene la venta guardada**, Oplex no sabe qué se vendió. Cargá los artículos en la Caja como siempre, tocá **Cobrar**, elegí **Mercado Pago** por el mismo monto y marcá **Usar el cobro ya acreditado** (**El cliente ya pagó: no se genera un QR nuevo.**). Después tocá **Confirmar cobro**.

## Devolver el dinero

Usalo si el cliente se fue sin llevar la mercadería o pagó dos veces.

1. **Tocá Devolver el dinero** en el cobro.
2. **Leé el resumen.** Se le reintegra el monto al cliente por Mercado Pago. No se emite factura ni nota de crédito porque nunca hubo venta.
3. **Tocá Devolver $…** Aparece **Dinero devuelto**. El cliente lo ve en su app de Mercado Pago.

> [!IMPORTANTE]
> No podés cerrar el turno con cobros QR sin resolver. Si tocás **Cerrar turno**, se abre **Antes de cerrar el turno** con la lista para que confirmes o devuelvas cada uno.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **No se pudo confirmar la venta** (u otro mensaje de error) | Falló la factura (por ejemplo, ARCA no respondió) o falta stock. | El cobro sigue acreditado. Resolvé la causa y tocá **Reintentar**. |
| **Mercado Pago no aceptó la devolución: …** | Mercado Pago rechazó el reintegro. | El cobro sigue acreditado y no se devolvió nada. Probá de nuevo más tarde. |
| **Ese cobro QR ya se le devolvió al cliente** / **Ese cobro QR ya se usó en otra venta** | Alguien ya lo resolvió desde otra computadora. | Cerrá la ventana; el aviso se actualiza solo. |
| **El cobro QR es de $… y la fila de Mercado Pago dice $…** | Al usar un cobro ya acreditado, el monto de la fila no coincide. | Poné en la fila de Mercado Pago el mismo monto del cobro. |
