---
title: Nota de crédito
summary: Anulá una factura entera o una parte con una nota de crédito con CAE, que devuelve el stock y baja el saldo del cliente.
minutes: 4
roles: Dueño, Administrador, Ventas
---

La nota de crédito es el comprobante fiscal que corrige una factura ya emitida: una devolución, un precio mal cargado o una venta que no se hizo. Una factura con CAE no se puede borrar ni editar; se corrige con una nota de crédito. Puede ser por toda la factura o sólo por algunas líneas y cantidades.

## Antes de empezar

- La factura tiene que tener CAE.
- El certificado de ARCA tiene que estar cargado y vigente: la nota de crédito también pide CAE (ver [Antes de empezar con ARCA](/documentacion/arca/antes-de-empezar)).

## Pasos

1. **Buscá la factura.** Andá a **Ventas › Facturación**, pestaña **Gestión**.
2. **Tocá Nota de crédito** en la fila de la factura. Se abre la ventana **Nota de crédito** con todas sus líneas.
3. **Elegí cuánto devolver de cada línea.** Cada línea muestra lo vendido (**vendidas: 4**) y ya viene con la cantidad completa. Para una devolución parcial, bajá la cantidad; poné `0` en las líneas que no se acreditan.
4. **Escribí el motivo.** En **Motivo**, por ejemplo *Devolución de 1 taladro percutor 13 mm fallado*. Es obligatorio y sale en el PDF.
5. **Tocá Emitir nota de crédito.** Oplex pide el CAE a ARCA y la nota queda emitida.

![Nota de crédito parcial con una línea en 1 y el motivo completo](/ayuda/capturas/ventas-nota-de-credito.jpg)

## Qué pasa después

- **Saldo:** el saldo de la factura baja por el total de la nota.
- **Stock:** lo devuelto vuelve al depósito del que salió, con su costo original.
- **Pendientes de entrega:** si parte de la factura todavía no se había entregado, la nota cancela primero lo pendiente, sin tocar el stock (ver [Pendientes de entrega](/documentacion/ventas/pendientes-de-entrega)).
- **Contabilidad:** se registra el asiento que revierte la venta.
- **Estado:** si las notas de crédito cubren todo el total, la factura pasa a **Anulada** y ya no ofrece **Nota de crédito**.
- **PDF:** en el detalle de la factura, sección **Notas de crédito**, cada nota tiene su botón **PDF** (ver [PDF de la factura](/documentacion/ventas/pdf-de-la-factura)).

Podés hacer varias notas de crédito parciales sobre la misma factura. Oplex no te deja acreditar más de lo que se vendió en cada línea, sumando todas las notas.

> [!IMPORTANTE]
> Hoy la nota de crédito sólo se puede emitir por un importe igual o menor al **saldo pendiente** de la factura. Una factura ya cobrada por completo (por ejemplo, una venta de Caja) no admite nota de crédito: Oplex muestra el error **Credit note total exceeds the invoice balance due**.

> [!NOTA]
> Una nota de crédito emitida no se puede editar ni borrar: es un comprobante fiscal, igual que la factura.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Todavía no configuraste el certificado ARCA de esta empresa - la nota de crédito no va a poder pedir CAE …** | No hay certificado cargado. | Cargalo en **Contabilidad › Conexión con ARCA**. |
| **Indicá un motivo** | El motivo está vacío. | Escribilo. |
| **Ingresá una cantidad a devolver en al menos una línea** | Todas las cantidades están en 0. | Poné la cantidad a devolver en alguna línea. |
| **Credit note total exceeds the invoice balance due** | La nota supera el saldo pendiente de la factura (por ejemplo, ya está cobrada). | Ver el aviso de arriba. |
| **Cannot credit … of invoice line …: only … left to credit** | Esa línea ya se acreditó, total o parcialmente, en otra nota. | Bajá la cantidad a lo que queda sin acreditar. |
| ARCA rechaza la nota de crédito. | Algún dato no coincide con lo que ARCA espera. | Ver [ARCA rechaza la factura](/documentacion/problemas/arca-rechaza-la-factura). |
