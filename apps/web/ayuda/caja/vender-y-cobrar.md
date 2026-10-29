---
title: Vender y cobrar en la Caja
summary: Cargá el ticket tocando o escaneando artículos, cobrá con uno o varios medios de pago y emití la factura con CAE en el momento.
minutes: 5
roles: Dueño, Administrador, Ventas
---

La Caja es la pantalla de venta de mostrador: buscás o escaneás los artículos, cobrás y Oplex emite la factura con CAE, descuenta el stock del depósito de la caja y registra el cobro, todo junto. Sólo te deja vender lo que realmente hay en ese depósito.

## Antes de empezar

- Un turno abierto en la caja (ver [Abrir y cerrar el turno](/documentacion/caja/abrir-y-cerrar-turno)).
- La conexión con ARCA lista para emitir facturas: ver [Antes de empezar con ARCA](/documentacion/arca/antes-de-empezar).

## Cargar el ticket

1. **Buscá el artículo.** En **Buscar artículo, SKU o escanear código de barras...** escribí o pasá el lector. La grilla se filtra.
2. **Tocá el artículo** para sumarlo al ticket. Si lo tocás de nuevo, suma uno más.
3. **Ajustá cantidades.** En el ticket, a la derecha, usá **−** y **+**, o el tachito para sacarlo.
4. **Mirá los totales.** Abajo: **Subtotal**, **IVA** (si sos Responsable Inscripto) y **Total**.

Cada artículo de la grilla muestra su precio y **Stock:** con lo disponible en el depósito de esta caja. Un servicio dice **Servicio** y no tiene límite.

> [!NOTA]
> La Caja no deja vender más de lo que hay. Un artículo **Sin stock** aparece apagado, y si intentás pasarte en el ticket ves **No hay más stock disponible: … en Depósito Central**. Lo reservado para producción no cuenta como disponible. Si necesitás facturar sin stock, usá [Nueva factura](/documentacion/ventas/emitir-factura): ahí lo que falta queda pendiente de entrega.

Un artículo **Sin precio** tampoco se puede vender: el precio se carga en Inventario.

## Cobrar

1. **Tocá Cobrar.** Se abre la ventana **Cobrar**.
2. **Elegí el cliente.** En **Cliente** viene **Consumidor Final**. Para otro, elegilo de la lista. Abajo ves la factura que corresponde, por ejemplo **Factura B - Cliente sin CUIT (Consumidor Final): corresponde Factura B.**
3. **Si el cliente no está cargado, buscalo por CUIT.** En **Cargar cliente por CUIT** escribí el CUIT y tocá **Buscar**. Si ya es cliente, se elige solo (**Cliente ya cargado: …**). Si no, aparecen sus datos de ARCA y el botón **Usar este cliente**, que lo crea en el momento.
4. **Elegí el medio de pago.** La primera fila viene en **Efectivo** por el total. Podés cambiarlo a **Tarjeta**, **Mercado Pago (QR)**, **Point de Mercado Pago**, **Transferencia** o **Cheque**. Con **Point de Mercado Pago** cobrás en el posnet y Oplex controla el pago solo: ver [Cobrar con Point de Mercado Pago](/documentacion/caja/cobro-con-point).
5. **Calculá el vuelto.** En efectivo, escribí en **Paga con** lo que te entrega el cliente: Oplex muestra **Vuelto: $…**. No cambies el monto de la fila para eso.
6. **Si paga con dos medios, sumá una fila.** Tocá **+ Agregar otro método de pago** y repartí el total (por ejemplo, una parte en efectivo y el resto con tarjeta). La suma tiene que dar exacto el total.
7. **Tocá Confirmar cobro.** Aparece **Venta confirmada** con el número de factura.
8. **Imprimí el ticket.** **Imprimir ticket** abre la factura en formato ticket de 80 mm. **Nueva venta** limpia el ticket para el próximo cliente.

> [!NOTA]
> Si la caja tiene el QR de Mercado Pago activo y elegís **Mercado Pago (QR)**, el botón cambia a **Generar QR** y el cobro se hace con el QR (ver [QR de Mercado Pago](/documentacion/caja/qr-mercado-pago)). Sin QR activo, **Mercado Pago (QR)** se registra como cualquier otro medio, sin conexión con Mercado Pago.

El efectivo cobrado suma al **Efectivo esperado** del turno. Los demás medios no, porque no entran al cajón.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **El total pagado es menor al total de la venta** | Los pagos no llegan al total. | Corregí los montos o agregá otra fila. |
| **El monto de los pagos supera el total - usá "Paga con" para calcular el vuelto, no cambies el monto del pago** | Pusiste en el monto lo que entregó el cliente. | Dejá el monto en el total y usá **Paga con**. |
| **Lo que paga el cliente en efectivo es menor al monto de esa fila** | **Paga con** es menor que el monto. | Revisá lo que te entregó el cliente. |
| **No hay stock suficiente en Depósito Central - …** | Alguien vendió ese stock mientras armabas el ticket. | Bajá la cantidad o sacá el artículo. |
| **Abrí un turno antes de vender en esta caja** | El turno se cerró. | Volvé a **Caja** y abrí uno. |
| **Antes de usar el punto de venta, cargá tu condición frente al IVA** | Falta tu condición frente al IVA. | Tocá **Cargarla ahora**. |
| ARCA rechaza la factura. | Algún dato no coincide con lo que ARCA espera. | Ver [ARCA rechaza la factura](/documentacion/problemas/arca-rechaza-la-factura). |
