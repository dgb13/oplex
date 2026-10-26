---
title: Emitir una factura
summary: Cómo emitir una factura A, B o C con CAE desde Ventas › Facturación, con observaciones, percepciones y otra moneda.
minutes: 6
roles: Dueño, Administrador, Ventas
---

Desde **Nueva factura** emitís una factura electrónica que ARCA autoriza en el momento: sale con su CAE y su código QR, descuenta el stock y deja el saldo a cobrar en la cuenta del cliente. Esta pantalla es para facturar desde la oficina; para la venta de mostrador está la [Caja](/documentacion/caja/vender-y-cobrar).

## Antes de empezar

- La conexión con ARCA lista: condición frente al IVA, certificado y punto de venta. Si todavía no la hiciste, empezá por [Antes de empezar con ARCA](/documentacion/arca/antes-de-empezar).
- Al menos una sucursal con su número de punto de venta (ver [Punto de venta](/documentacion/arca/punto-de-venta)) y al menos un depósito.
- El cliente cargado con su condición frente al IVA (ver [Clientes](/documentacion/ventas/clientes)). También lo podés crear desde la misma factura.

## Pasos

1. **Abrí la pantalla.** Andá a **Ventas › Facturación**, pestaña **Gestión**, y tocá **+ Nueva factura**.
2. **Mirá el estado de ARCA.** Arriba, al lado del título, ves **ARCA conectado** con la fecha de vencimiento del certificado ①. Si dice **ARCA sin conectar**, no vas a poder emitir: seguí el aviso **Ir a Conexión con ARCA →**.
3. **Elegí el cliente.** Escribí en **Buscá el cliente por nombre o CUIT** y elegilo ②. Abajo aparece una tarjeta con su CUIT y su condición frente al IVA. Si no está, tocá **+ Nuevo cliente**.
4. **Agregá los artículos.** En **Agregar artículo: buscá por nombre o SKU (o escaneá el código)** escribí y tocá `Enter` ③. Debajo de cada artículo ves cuánto hay en stock; si no alcanza, dice **no alcanza para esta cantidad**. Con el lápiz (**Agregar detalle**) de cada línea escribís un detalle que sale en el PDF debajo del artículo, por ejemplo *cambio de pastillas delanteras*.
5. **Revisá cantidades, precios e IVA.** Corregí cantidad o precio en la línea. Con **Precios con IVA incluido** indicás si los precios que escribiste ya traen el IVA.
6. **Sumá percepciones, si corresponde.** Tocá **+ Agregar percepciones / otros tributos** y cargá tipo, concepto, base imponible, alícuota y monto (por ejemplo una **Percepción IIBB (provincial)**).
7. **Escribí observaciones, si querés.** El campo **Observaciones** sale impreso en el PDF: número de orden de compra del cliente, remito, aclaraciones. Hasta 500 caracteres.
8. **Revisá el costado.**
   - **Comprobante:** la letra (A, B, C o M) ya viene elegida según tu condición y la del cliente, con la explicación debajo ④. Ver [Letra del comprobante](/documentacion/ventas/letra-del-comprobante).
   - **Sucursal / Punto de venta:** por ejemplo **Casa Central (PV 00003)**.
   - **Depósito:** de acá sale el stock de lo que facturás (por ejemplo **Depósito Central**).
   - **Moneda:** **ARS $** u otra que tengas configurada. Si elegís otra, aparece **Cotización de este comprobante** con la cotización vigente; podés escribir otra.
9. **Tocá Emitir factura** (o `Ctrl` + `Enter`) ⑤. Oplex revisa el stock, pide el CAE a ARCA y la factura aparece en la lista.

![Nueva factura con el cliente, los artículos y el costado completo](/ayuda/capturas/ventas-nueva-factura.jpg)

> [!NOTA]
> Si el cliente tiene email cargado, Oplex le manda un aviso automático con el número y el total de la factura. El PDF lo descargás vos desde el detalle (ver [PDF de la factura](/documentacion/ventas/pdf-de-la-factura)).

## Si falta stock

Si alguna línea pide más de lo que hay en el depósito, antes de emitir aparece **Falta stock para entregar todo**, con lo que **Facturás**, lo que **Se entrega ahora** y lo que **Queda pendiente**.

- **Facturar igual:** se emite la factura completa. Lo que hay se descuenta ahora y lo que falta queda en [Pendientes de entrega](/documentacion/ventas/pendientes-de-entrega).
- **Volver y corregir:** volvés a la factura para cambiar cantidades o depósito.

## Después de emitir

En la lista de **Gestión** cada factura muestra **Número**, **Cliente**, **Fecha**, **Total**, **Saldo** y **Estado**. Desde **Acciones**:

- **Ver detalle:** líneas, totales, CAE, cobros, notas de crédito y el PDF.
- **Cobrar** y **Cobrar con Mercado Pago:** ver [Cobrar una factura](/documentacion/ventas/cobrar).
- **Nota de crédito:** ver [Nota de crédito](/documentacion/ventas/nota-de-credito).

Los estados posibles son **Emitida**, **Pago parcial**, **Pagada**, **Vencida** y **Anulada** (cuando una nota de crédito cubre todo el total).

La pestaña **Resumen** muestra **Facturas emitidas**, **Total facturado**, **Total cobrado**, **Saldo pendiente** y cuántas facturas hay en cada estado. Los totales ya descuentan las notas de crédito.

> [!NOTA]
> En la factura no se elige la condición de venta: Oplex la calcula sola. Si la cobraste completa el mismo día, el PDF dice **Contado**; si no, dice **Cuenta corriente**.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **No podés emitir facturas todavía: falta el certificado de ARCA de tu empresa.** | No está hecha la conexión con ARCA. | Seguí [Antes de empezar con ARCA](/documentacion/arca/antes-de-empezar). |
| **No podés emitir facturas todavía: el certificado de ARCA venció el …** | El certificado venció. | [Renová el certificado](/documentacion/arca/renovar-certificado). |
| **Antes de emitir, cargá tu condición frente al IVA en Contabilidad → Conexión con ARCA → Datos de la empresa: sin ella no se puede saber si corresponde Factura A, B o C.** | Falta tu condición frente al IVA. | Cargala en [Datos de la empresa](/documentacion/arca/datos-de-la-empresa). |
| **Falta la condición frente al IVA del cliente "…": ARCA la exige para facturar a un CUIT.** | El cliente tiene CUIT pero no condición (RG 5616). | Abrí el cliente en **Ventas › Clientes**, tocá **Editar empresa** y **Actualizar desde ARCA**, o escribila con **✎ corregir**. |
| **Hace falta al menos un depósito antes de poder facturar** | No hay depósitos. | Creá uno en Inventario (ver [Depósitos y movimientos](/documentacion/inventario/depositos-y-movimientos)). |
| **Hay líneas sin precio: cargalo en la línea marcada.** | Un artículo no tiene precio de venta. | Escribí el precio en la línea. |
| **Alcanzaste el límite de facturas mensuales de tu plan actual (…)** | Llegaste al tope de facturas del mes de tu plan. | Cambiá de plan en [Planes y facturación](/documentacion/cuenta/planes-y-facturacion). |
| ARCA rechaza la factura con un código de error. | Algún dato no coincide con lo que ARCA espera. | Ver [ARCA rechaza la factura](/documentacion/problemas/arca-rechaza-la-factura). |

> [!NOTA]
> Si en **Facturación** aparece el aviso **ARCA tiene 1 comprobante autorizado que no está en Oplex**, tocá **Revisar**: es una factura que ARCA autorizó pero que no llegó a guardarse (por ejemplo, por un corte de conexión). Desde ahí la marcás como resuelta o la anulás con una nota de crédito.
