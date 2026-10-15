---
title: Cuentas a pagar
summary: Cómo ver cuánto le debés a cada proveedor, la antigüedad de la deuda, la cuenta corriente y cómo registrar pagos con retenciones o cheques.
minutes: 6
roles: Dueño, Administrador, Compras, Inventario, Contador
---

Cuentas a Pagar te muestra lo que le debés a tus proveedores: el saldo de cada uno, cuánto está vencido y el detalle de facturas y pagos. Desde la factura registrás los pagos, en efectivo, transferencia o cheque, y con las retenciones que practiques.

Está en **Compras › Cuentas a Pagar**, con tres pestañas: **Resumen**, **Gestión** y **Cuenta Corriente**.

## Antes de empezar

- Las deudas salen de las facturas de compra cargadas (ver [Facturas de compra](/documentacion/compras/facturas-de-compra)).
- Para pagar con cheque propio necesitás una cuenta bancaria creada (ver [Cuentas de dinero](/documentacion/contabilidad/cuentas-de-dinero)).
- Para practicar retenciones, tenés que tener los regímenes activos en **Contabilidad › Impuestos**, pestaña **Retenciones** (ver [Impuestos y vencimientos](/documentacion/contabilidad/impuestos-y-vencimientos)).

## Ver la deuda

- **Resumen** muestra la **Antigüedad de saldos**: por proveedor, cuánto está **Al día** y cuánto venció hace **1-30**, **31-60**, **61-90** o **90+** días.
- **Gestión** muestra los **Saldos por proveedor**. Tocá un proveedor para abrir su cuenta corriente.
- **Cuenta Corriente**: buscá el proveedor en **Buscar por nombre o CUIT** y elegilo.

En la cuenta corriente ves arriba el **Saldo total vencido**, el **Saldo total a vencer** y el **Total adeudado**. Abajo, cada comprobante con **Fecha**, **Tipo y Nro. de Comprobante**, **Vencimiento**, **Debe**, **Haber**, **Saldo Acumulado** y **Estado**. Podés filtrar por fechas, marcar **Mostrar solo comprobantes con saldo pendiente** y bajarla con **Exportar PDF** o **Exportar Excel (.xlsx)**.

![Cuenta corriente de un proveedor con los totales arriba y los comprobantes abajo](/ayuda/capturas/compras-cuenta-corriente.jpg)

## Pasos: registrar un pago

1. **Abrí la factura.** Desde **Compras › Compras**, pestaña **Facturas**, tocá **Ver**. También podés abrirla desde la cuenta corriente del proveedor.
2. **Tocá Registrar pago.**
3. **Elegí la Forma de pago.**
   - **Efectivo / transferencia**: escribí el importe en **Efectivo/banco a pagar** y el método (por ejemplo "transferencia Banco Nación").
   - **Endosar cheque de cartera**: elegí en **Cheque a endosar** uno de los cheques de terceros que tenés en cartera. El monto es el del cheque.
   - **Emitir cheque propio**: completá **Número**, **Banco**, **Fecha de emisión**, **Fecha de vencimiento** y la **Cuenta bancaria que lo respalda**.
4. **Agregá retenciones, si corresponde.** Tocá **+ agregar retención**, elegí el régimen, el monto retenido y el **Nº certificado**. Abajo ves cuánto queda **aplicado a la factura** (lo que pagás más lo retenido).
5. **Tocá Confirmar pago.** El saldo de la factura baja y pasa a **Pago parcial** o **Pagada**.

> [!NOTA]
> Las retenciones se calculan sobre lo que efectivamente pagás en ese momento, no sobre toda la deuda. Por ejemplo: si de una factura de $ 500.000 pagás hoy $ 200.000, la retención se aplica sobre ese pago.

> [!IMPORTANTE]
> Lo aplicado a la factura (pago más retenciones) no puede superar el saldo pendiente. Si te pasás, el importe aparece en rojo.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **No hay cheques de tercero en cartera disponibles para endosar.** | No tenés cheques recibidos en cartera. | Pagá de otra forma o cargá el cheque en la cartera (ver [Cartera de cheques](/documentacion/contabilidad/cartera-de-cheques)). |
| **No hay cuentas financieras creadas todavía** | No hay una cuenta bancaria para respaldar el cheque propio. | Creala (ver [Cuentas de dinero](/documentacion/contabilidad/cuentas-de-dinero)). |
| **No hay regímenes de retención activos habilitados** | No configuraste retenciones. | Activalas en **Contabilidad › Impuestos › Retenciones**. |
| **Esta cuenta está en otra moneda que la factura de compra** | La cuenta del cheque propio está en otra moneda. | Elegí una cuenta en la misma moneda de la factura. |
| **No se puede endosar un cheque de cartera y emitir uno propio en el mismo pago** | Quisiste combinar las dos formas. | Registrá dos pagos separados. |
| **No se pudo registrar el pago** | Error general, por ejemplo un importe mayor al saldo. | Revisá el importe y volvé a intentar. |
