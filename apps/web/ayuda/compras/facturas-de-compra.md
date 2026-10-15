---
title: Facturas de compra
summary: Cómo cargar la factura del proveedor con su IVA y percepciones, vincularla a la orden y a los remitos, y qué impacto tiene.
minutes: 6
roles: Dueño, Administrador, Compras, Inventario
---

La factura de compra es el comprobante que te manda el proveedor. Al cargarla en Oplex, esa deuda aparece en Cuentas a Pagar, el IVA va a tu crédito fiscal (si sos Responsable Inscripto) y el comprobante entra en el Libro IVA Compras.

La factura es distinta de la recepción: la **recepción** es lo que entró físicamente al depósito y mueve el stock; la **factura** es el papel fiscal y mueve la deuda y el IVA. Es normal que la mercadería llegue antes que la factura, o al revés.

Las facturas están en **Compras › Compras**, pestaña **Facturas**.

## Antes de empezar

- La factura se carga contra una **orden de compra** (ver [Órdenes de compra y recepción](/documentacion/compras/ordenes-y-recepcion)). Si no tenés orden, por ejemplo un gasto o una compra suelta, usá [Carga con IA](/documentacion/compras/carga-con-ia), que no la pide.
- Tené la factura del proveedor a mano (en papel, foto o PDF).

## Pasos

1. **Tocá Nueva factura.** Se abre **Nueva Factura de Compra**.
2. **Elegí la Orden de Compra.** La lista muestra el número de la orden y el proveedor.
3. **Completá Número de factura del proveedor y Fecha de factura.** Si la factura tiene vencimiento, cargalo en **Vencimiento (opcional)**: se usa para la antigüedad de deuda.
4. **Completá Tipo, Punto de venta y Número** en el recuadro del Libro de IVA Digital. Por ejemplo, **Factura A**, 0001, 00012345. Son opcionales, pero sin ellos el comprobante queda afuera del export del Libro IVA Digital de Compras.
5. **Marcá los remitos que cubre la factura**, si ya recibiste mercadería. Aparecen en **Remitos que cubre esta factura (opcional)**.
6. **Cargá el IVA y las percepciones** en **IVA / Percepciones**. Para cada alícuota del IVA, una fila **IVA Crédito**: escribí el **Neto** gravado, elegí la alícuota (21 %, 10,5 %, 27 %, etc.) y Oplex calcula el **IVA** (lo podés ajustar si en el papel dice otra cosa por redondeo). Para una percepción, cambiá la fila a **Percepción**, escribí el concepto (por ejemplo "Percepción IIBB Córdoba"), elegí el impuesto y el **Monto**. Con **+ agregar fila** sumás más.
7. **Revisá el Subtotal y el Total.** Si cargaste filas de IVA Crédito, el **Subtotal (neto de impuestos)** se calcula solo sumando los netos. El total tiene que coincidir con el de la factura.
8. **Adjuntá la Foto o escaneo de la factura** (JPG, PNG, WEBP o PDF) y agregá **Notas** si hace falta.
9. **Tocá Registrar factura.** Queda en estado **Emitida**, con todo el total como saldo a pagar.

![Formulario de nueva factura de compra con dos filas de IVA y una percepción](/ayuda/capturas/compras-nueva-factura.jpg)

> [!NOTA]
> Debajo del total, Oplex te aclara qué pasa con el IVA. Si sos Responsable Inscripto: va a **crédito fiscal** y lo descontás de lo que pagás de IVA. Si sos Monotributo o Exento: **no es un crédito**, se suma al costo de la compra, pero igual queda informado para el Libro IVA Digital.

## Qué pasa al registrarla

- **Cuentas a Pagar**: la deuda con el proveedor sube por el total (ver [Cuentas a pagar](/documentacion/compras/cuentas-a-pagar)).
- **Contabilidad**: si marcaste remitos, se cancela lo que estaba en **Mercadería Recibida No Facturada**.
- **Libro IVA Compras**: el comprobante aparece con su neto, IVA y percepciones (ver [Libro IVA](/documentacion/contabilidad/libro-iva)).

## Estados de la factura

| Estado | Qué significa |
|---|---|
| **Emitida** | Cargada, sin pagos. |
| **Pago parcial** | Tiene pagos, pero queda saldo. |
| **Pagada** | Saldo en cero. |
| **Cancelada** | Anulada. |

Para pagarla, abrila con **Ver** y tocá **Registrar pago** (ver [Cuentas a pagar](/documentacion/compras/cuentas-a-pagar)).

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Elegí una Orden de Compra** | No elegiste orden. | Elegí la orden. Si la compra no tiene orden, cargala con [Carga con IA](/documentacion/compras/carga-con-ia). |
| **Ingresá el número de factura del proveedor** | El número está vacío. | Copialo de la factura. |
| **El subtotal debe ser mayor a cero** | No cargaste neto ni filas de IVA. | Completá el subtotal o las filas de IVA Crédito. |
| Un mensaje que dice que el remito ya está facturado | Marcaste un remito que ya está en otra factura. | Desmarcalo. |
| Un mensaje que dice que el subtotal facturado es menor al monto acumulado por los remitos | Lo facturado es menos que lo recibido en esos remitos. | Revisá que marcaste los remitos correctos y que el neto coincida con la factura. |
