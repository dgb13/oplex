---
title: Cartera de cheques
summary: Cómo seguir los cheques que recibís y los que emitís: depositarlos, endosarlos, acreditarlos y registrar un rechazo.
minutes: 6
roles: Dueño, Administrador, Contador, Ventas, Inventario
---

La Cartera de Cheques es la lista de todos los cheques de tu empresa: los que te dieron tus clientes (**De tercero**) y los que vos firmaste para pagar (**Propio**). Desde acá ves cuáles vencen, los depositás, los marcás como acreditados y registrás un rechazo. Cada paso queda asentado en la contabilidad y en el saldo de tus cuentas de dinero.

Está en **Contabilidad › Cartera de Cheques**.

## Antes de empezar

- Tené creada al menos una cuenta bancaria en **Reportes › Financiero** (ver [Cuentas de dinero](/documentacion/contabilidad/cuentas-de-dinero)). Sin eso no podés depositar un cheque ni emitir uno propio.

## Cómo entra un cheque a la cartera

Los cheques no se cargan desde esta pantalla: entran solos cuando registrás la operación.

- **Cheque de tercero**: cuando registrás un cobro y elegís el **Método** **Cheque**, completás **Número**, **Banco**, **CUIT librador (opcional)**, **Formato** (**Físico** o **eCheq**), **Fecha de emisión** y **Fecha de vencimiento**. El cheque entra **En cartera** (ver [Cobrar una factura](/documentacion/ventas/cobrar)).
- **Cheque propio**: cuando pagás una factura de compra con la **Forma de pago** **Emitir cheque propio**. Completás el número, banco, fechas y la **Cuenta bancaria que lo respalda**. El cheque queda **Emitido**.
- **Endoso**: cuando pagás una factura de compra con **Endosar cheque de cartera**, elegís un cheque de tercero y pasa a **Endosado** (ver [Cuentas a pagar](/documentacion/compras/cuentas-a-pagar)).

## Los estados de un cheque

| Estado | Qué quiere decir |
|---|---|
| **En cartera** | Cheque de tercero que tenés en la mano (o en tu cuenta de eCheq), sin depositar. |
| **Depositado** | Lo depositaste y estás esperando que el banco lo acredite. |
| **Endosado** | Se lo pasaste a un proveedor como pago. |
| **Emitido** | Cheque propio que entregaste y todavía no se debitó. |
| **Acreditado** | El banco ya lo pagó (o te lo debitó, si es propio). |
| **Rechazado** | El banco lo rechazó. |
| **Anulado** | Quedó sin efecto. |

## Buscar un cheque

Arriba tenés los filtros: **Estado**, **Tipo** (**De tercero** o **Propio**), **Banco** y las fechas de vencimiento **Desde** y **Hasta** (con atajos como **Este mes**). La lista sale ordenada por **Vencimiento**, así ves primero los más próximos.

![Cartera de Cheques filtrada por estado En cartera, con los botones Depositar y Rechazar](/ayuda/capturas/contabilidad-cartera-cheques.jpg)

## Pasos para depositar un cheque de tercero

1. Buscá el cheque **En cartera** y tocá **Depositar**.
2. En **Cuenta de destino**, elegí la cuenta bancaria donde lo depositás.
3. Tocá **Depositar**. El cheque pasa a **Depositado**.

## Pasos para marcar un cheque como acreditado

Cuando el banco te acredita un cheque depositado, o te debita uno propio:

1. Buscá el cheque **Depositado** (o el propio **Emitido**) y tocá **Acreditar**.
2. Tocá **Confirmar**. Si te equivocaste de cheque, tocá **Volver**.

El cheque pasa a **Acreditado** y se actualiza el saldo de la cuenta bancaria.

## Pasos para registrar un cheque rechazado

Sirve para cheques de tercero **En cartera**, **Depositado** o **Endosado**.

1. Tocá **Rechazar** en el cheque.
2. Escribí el **Motivo**, por ejemplo "Sin fondos".
3. Si el banco te cobró un gasto por el rechazo, escribilo en **Gasto de rechazo (opcional)**.
4. Tocá **Confirmar rechazo**.

> [!IMPORTANTE]
> Al rechazar un cheque, la factura que ese cheque había pagado vuelve a quedar con saldo pendiente. Vas a ver la deuda otra vez en **Cuentas a Cobrar**, para reclamarle el pago al cliente.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **No hay cuentas financieras creadas todavía (Reportes → Financiero).** | No hay ninguna cuenta de dinero donde depositar. | Creá la cuenta bancaria en **Contabilidad › Reportes**, pestaña **Financiero**. |
| **Elegí la cuenta donde se deposita** | No elegiste la **Cuenta de destino**. | Elegila y volvé a tocar **Depositar**. |
| **El motivo es obligatorio** | Rechazaste sin escribir el motivo. | Completá el **Motivo**. |
| **El cheque propio necesita una cuenta bancaria asignada antes de acreditarse** | El cheque propio se emitió sin cuenta bancaria. | Escribí a soporte para corregirlo. |
| **No hay cheques que coincidan con el filtro** | Ningún cheque cumple los filtros elegidos. | Poné **Estado** y **Tipo** en **Todos** y borrá las fechas. |
