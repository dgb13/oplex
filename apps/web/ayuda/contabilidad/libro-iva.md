---
title: Libro IVA
summary: Cómo ver el Libro IVA Ventas y Compras de un período, exportarlo a Excel o PDF y bajar los archivos del Libro de IVA Digital.
minutes: 5
roles: Dueño, Administrador, Contador externo
---

El Libro IVA junta todos los comprobantes de un período con su neto, su IVA por alícuota y sus percepciones. Te sirve para controlar la posición de IVA del mes y para pasarle a tu contador lo que necesita para presentar la declaración jurada. Oplex lo arma solo con lo que facturaste y con las facturas de compra que cargaste: no hay que pasar nada a mano.

Está en **Contabilidad › Impuestos**, pestaña **Libro IVA**.

## Antes de empezar

- Tenés que ser **Dueño** o **Administrador**, o el contador externo vinculado desde **Contadores**.
- Para que el **IVA Compras** esté completo, las facturas de proveedores tienen que estar cargadas en **Compras** con su tipo, punto de venta, número y el IVA desglosado por alícuota (ver [Facturas de compra](/documentacion/compras/facturas-de-compra)).

## Pasos

1. Andá a **Contabilidad › Impuestos** y abrí la pestaña **Libro IVA**.
2. Elegí el libro: **IVA Ventas** o **IVA Compras**.
3. Elegí el período con **Desde** y **Hasta**, o con un atajo: **Este mes**, **Mes anterior**, **Este trimestre** o **Este año**. Al abrir la pestaña ya aparece el mes en curso.
4. Revisá la tabla. Cada fila es un comprobante, con **Fecha**, **Comprobante**, **Número**, **Razón Social**, **Tipo Doc**, **CUIT/DNI**, **Cond. IVA** y los importes: **Neto Grav.**, **Exento**, **No Grav.**, **IVA 21%**, **IVA 10,5%**, **IVA 27%**, **IVA Otras**, **Percepciones**, **IVA Total** y **Total**.
5. Mirá la fila **Totales** al pie: suma todo el período, no sólo la página que estás viendo.
6. Si hay más de 50 comprobantes, pasá de página con **Anterior** y **Siguiente**.

![Pestaña Libro IVA con IVA Ventas del mes anterior y la fila de Totales](/ayuda/capturas/contabilidad-libro-iva.jpg)

Las notas de crédito aparecen en rojo y con los importes en negativo, así restan en los totales. En **IVA Ventas** ves, por ejemplo, la "Factura A" a Talleres Rivera SA y la "Nota de Crédito A" que le hiciste después.

> [!NOTA]
> Si una factura tiene un descuento general (por ejemplo, 10% sobre el total), el Libro IVA muestra el neto y el IVA ya descontados, igual que en la factura que recibió el cliente. Lo mismo pasa con las notas de crédito de esas facturas.

> [!NOTA]
> En **IVA Compras**, los comprobantes cargados sin desglose de alícuota (o cargados antes de que existiera esta función) suman su IVA en la columna **IVA Otras**.

## Exportar

Arriba a la derecha tenés estos botones (se activan cuando hay comprobantes en el período):

| Botón | Qué hace |
|---|---|
| **Exportar Excel (.xlsx)** | Baja el libro completo en una planilla, para mandarle a tu contador. |
| **Imprimir / Exportar PDF** | Abre el libro listo para imprimir o guardar como PDF. |
| **Cabecera (.txt)** | Baja el archivo de comprobantes del **Libro de IVA Digital (RG 4597)**. |
| **Alícuotas (.txt)** | Baja el archivo de alícuotas del **Libro de IVA Digital (RG 4597)**. |

Los dos archivos .txt son los que se importan en el servicio "Libro de IVA Digital" de ARCA. Bajá los dos para el mismo libro y el mismo período: primero con **IVA Ventas** elegido y después con **IVA Compras**.

> [!IMPORTANTE]
> Antes de presentar, revisá los archivos con tu contador. Oplex arma los archivos con lo que está cargado: si falta una factura de compra en **Compras**, tampoco va a estar en el archivo.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Sin comprobantes en el período** | No hay facturas emitidas (o compras cargadas) en esas fechas. Los botones de exportar quedan apagados. | Revisá las fechas y el libro elegido. |
| (cantidad) **comprobante(s) de compra quedó/quedaron afuera del archivo (falta Tipo/Punto de Venta/Número, es en moneda distinta de ARS, o tiene una línea de IVA sin alícuota cargada).** | Al bajar un .txt de **IVA Compras**, algunas facturas de compra no tienen los datos que pide ARCA. | Completá esos datos en la factura de compra y volvé a bajar el archivo. Las compras en dólares no van en el archivo: cargalas aparte con tu contador. |
| Una factura de compra no aparece | Está anulada, o su fecha de comprobante está fuera del período. | Revisá la fecha de la factura del proveedor en **Compras**. |
