---
title: Cuentas a cobrar
summary: Quién te debe, desde cuándo y cuánto le queda de crédito; la cuenta corriente de cada cliente y los recordatorios de facturas vencidas.
minutes: 4
roles: Dueño, Administrador, Ventas, Contador
---

**Cuentas a Cobrar** junta todo lo que te deben los clientes: el saldo de cada uno, cuánto está atrasado y su cuenta corriente completa con facturas, notas de crédito y cobros. También podés hacer que Oplex les mande recordatorios por email cuando una factura vence.

Andá a **Ventas › Cuentas a Cobrar**. Tiene cuatro pestañas.

## Resumen: antigüedad de saldos

La tabla **Antigüedad de saldos** muestra, por cliente, lo que debe repartido según cuántos días pasaron desde el vencimiento: **Al día**, **1-30**, **31-60**, **61-90**, **90+** y el **Total**. Sirve para ver de un vistazo qué está más atrasado.

![Antigüedad de saldos por cliente](/ayuda/capturas/ventas-antiguedad-saldos.jpg)

> [!NOTA]
> La antigüedad se cuenta desde la fecha de vencimiento de cada factura. Las facturas sin fecha de vencimiento cuentan siempre como **Al día**.

## Gestión: saldos y límite de crédito

**Saldos y límite de crédito** lista los clientes con saldo pendiente, con su **Límite de crédito**, su **Saldo** y lo **Disponible**. El límite se carga en la ficha del cliente (ver [Clientes](/documentacion/ventas/clientes)).

El botón **Actualizar vencidos** marca como **Vencida** las facturas que ya pasaron su vencimiento. Oplex lo hace solo todas las noches; el botón sirve para hacerlo en el momento.

## Cuenta Corriente de un cliente

1. **Elegí el cliente.** En la pestaña **Cuenta Corriente**, buscalo en **Buscar por nombre o CUIT** y elegilo en **Cliente**.
2. **Mirá los totales.** **Saldo total vencido**, **Saldo total a vencer**, **Total adeudado** y **Límite de crédito**.
3. **Filtrá.** Elegí el rango de fechas y, si querés, tildá **Mostrar solo comprobantes con saldo pendiente**.
4. **Revisá los movimientos.** Cada fila tiene **Fecha**, **Tipo y Nro. de Comprobante** (Factura, Nota de Crédito o Recibo), **Vencimiento**, **Debe**, **Haber**, **Saldo Acumulado** y **Estado**. En las facturas, **Ver detalle** abre el detalle completo.
5. **Exportala.** Con **Exportar PDF** o **Exportar Excel (.xlsx)**, por ejemplo para mandársela al cliente o a tu contadora.

![Cuenta corriente de un cliente con los totales y los movimientos](/ayuda/capturas/ventas-cuenta-corriente.jpg)

## Recordatorios de facturas vencidas

Cuando una factura vence, Oplex le manda un email al cliente (al email de su ficha) avisándole que tiene saldo pendiente. Por defecto se avisa una sola vez. Para que se repita:

1. **Abrí la pestaña Recordatorios.**
2. **Tildá Recordar facturas vencidas de forma recurrente (por defecto se avisa una sola vez).**
3. **Elegí cada cuánto.** En **Revisar cuentas a cobrar cada**, tocá **3 días**, **5 días**, **10 días** u **Otra** y escribí los días.
4. **Tocá Guardar cambios.**

En **Estado del recordatorio automático** ves si está activo (**Cada … días** o **Desactivado (solo alerta única)**) y cuándo es la **Próxima corrida del cron** (la revisión automática). Además:

- **Ejecutar recordatorio ahora:** corre la revisión en el momento y manda los emails que correspondan.
- **Reiniciar conteo (sin enviar mails):** vuelve a empezar la cuenta de días de las facturas ya vencidas, sin mandar nada.

> [!IMPORTANTE]
> Los recordatorios sólo llegan a clientes con email cargado en su ficha, y sólo para facturas con fecha de vencimiento.

La configuración de recordatorios y **Actualizar vencidos** son para el Dueño, un Administrador o el Contador. Ventas puede ver los saldos y las cuentas corrientes.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Sin saldos pendientes** | Ningún cliente debe nada. | Nada para hacer. |
| **Sin movimientos en el período** | No hay comprobantes en esas fechas. | Ampliá el rango de fechas o destildá el filtro de saldo pendiente. |
| **Ingresá una cantidad de días válida (1 o más)** | En **Otra** quedó vacío o en 0. | Escribí 1 o más días. |
| Un cliente no recibe los recordatorios. | No tiene email, o la factura no tiene vencimiento. | Cargale el email en **Ventas › Clientes**. |
