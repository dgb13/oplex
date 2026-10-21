---
title: Cobrar una factura
summary: Registrá un cobro en efectivo, transferencia, tarjeta o cheque, o mandale al cliente un link de pago de Mercado Pago que se registra solo.
minutes: 4
roles: Dueño, Administrador, Ventas
---

Cuando el cliente te paga una factura, registrás el cobro y Oplex baja el saldo, actualiza Cuentas a Cobrar y hace el asiento contable. Podés cobrar todo junto o en partes. Si tenés Mercado Pago conectado, también podés mandarle un link de pago: cuando paga, el cobro se registra solo.

## Antes de empezar

- La factura tiene que tener saldo pendiente: el botón **Cobrar** sólo aparece en esas.
- Para cobrar con Mercado Pago, la cuenta conectada en la sección **Mercado Pago** del menú (lo hace el Dueño o un Administrador, ver [Mercado Pago](/documentacion/ventas/mercado-pago)).

## Registrar un cobro

1. **Buscá la factura.** Andá a **Ventas › Facturación**, pestaña **Gestión**. Podés filtrar con **Buscar por cliente o número...**.
2. **Tocá Cobrar** en la fila de la factura. Se abre **Registrar cobro**, con el saldo pendiente arriba.
3. **Revisá el monto.** **Monto** viene con todo el saldo. Si te pagan una parte, escribí lo que te pagaron.
4. **Elegí el método.** En **Método**: **Efectivo**, **Transferencia**, **Tarjeta** o **Cheque**.
5. **Indicá dónde entró la plata (opcional).** En **¿Dónde entró la plata? (opcional)** elegí la cuenta (por ejemplo, la cuenta del banco). Si no elegís ninguna, queda en **Cobranzas a depositar** hasta que la pases con una transferencia en Tesorería (ver [Cuentas de dinero](/documentacion/contabilidad/cuentas-de-dinero)).
6. **Si es cheque, completá sus datos.** **Número**, **Banco**, **CUIT librador (opcional)**, **Formato** (**Físico** o **eCheq**), **Fecha de emisión** y **Fecha de vencimiento**. El cheque entra a la [Cartera de cheques](/documentacion/contabilidad/cartera-de-cheques).
7. **Tocá Registrar.** El saldo de la factura baja y el estado pasa a **Pago parcial** o **Pagada**.

![Registrar cobro con método Transferencia y cuenta elegida](/ayuda/capturas/ventas-registrar-cobro.jpg)

Los cobros de cada factura quedan en su detalle, en **Historial de cobros**.

> [!NOTA]
> El selector **¿Dónde entró la plata?** sólo muestra cuentas en la misma moneda que la factura. Si tu usuario no tiene acceso a Tesorería, no lo vas a ver y el cobro queda en Cobranzas a depositar.

## Cobrar con un link de Mercado Pago

1. **Tocá Cobrar con Mercado Pago** en la fila de la factura. Aparece sólo si tenés Mercado Pago conectado y la factura tiene saldo.
2. **Esperá el link.** Oplex genera el link por el saldo pendiente y muestra **Esperando pago**, un QR y el link.
3. **Mandáselo al cliente.** Con **Enviar por WhatsApp**, **Enviar por email** o **Copiar** para pegarlo donde quieras. El mensaje ya incluye el número de factura y el monto.
4. **Listo.** Cuando el cliente paga, la ventana cambia a **¡Pagado!** y el cobro queda registrado solo, con su asiento. No hace falta que dejes la ventana abierta: la factura se actualiza igual.

Si abrís **Cobrar con Mercado Pago** de nuevo para la misma factura, Oplex te muestra el mismo link (no crea otro). Si ya no lo querés usar, tocá **Cancelar este link de cobro**.

> [!IMPORTANTE]
> Lo que se cobra con Mercado Pago entra en tu propia cuenta de Mercado Pago, no en la de Oplex.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **El monto debe ser mayor a cero** | El monto está vacío o en cero. | Escribí el importe cobrado. |
| **Completá número, banco, fecha de emisión y de vencimiento del cheque** | Faltan datos del cheque. | Completá los cuatro campos. |
| **Receipt amount exceeds the invoice balance due** | El monto es mayor que el saldo de la factura. | Cobrá como máximo el saldo pendiente. |
| **No se pudo generar el link de cobro con Mercado Pago** | Mercado Pago no respondió o la conexión venció. | Tocá **Reintentar**. Si sigue, revisá en la sección **Mercado Pago** si dice **Necesita reconexión** y tocá **Reconectar Mercado Pago**. |
| No aparece **Cobrar con Mercado Pago**. | La cuenta no está conectada. | El Dueño o un Administrador ve **Conectar Mercado Pago para mandar link**: tocándolo va a la sección para conectarla. Si no tenés ese rol, pediselo a uno de ellos. |
