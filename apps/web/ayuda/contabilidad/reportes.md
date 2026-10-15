---
title: Reportes
summary: Qué muestra cada reporte (Resultados, Ventas y Financiero) y cuál usar para cada pregunta.
minutes: 4
roles: Dueño, Administrador, Contador externo
---

Los reportes te contestan las preguntas de siempre: cuánto gané, a quién le vendí más, qué se vendió y cuánta plata tengo. Están en **Contabilidad › Reportes**, en tres pestañas: **Resultados**, **Ventas** y **Financiero**.

## Antes de empezar

- Tenés que ser **Dueño** o **Administrador**, o el contador externo vinculado desde **Contadores**.

## Elegir el período

**Resultados** y **Ventas** arrancan mostrando el mes en curso. Para cambiarlo, completá **Desde** y **Hasta** o tocá un atajo: **Este mes**, **Mes anterior**, **Este trimestre** o **Este año**.

## Resultados

Es el estado de resultados: cuánto ganaste o perdiste en el período, según la contabilidad.

- Arriba ves cuatro números de lo facturado: **Facturas emitidas**, **Subtotal**, **IVA** y **Total facturado**.
- Abajo, **Estado de resultados (libro mayor)** lista las cuentas de ingresos y gastos con su **Importe**, y cierra con **Ingresos totales**, **Gastos totales** y **Resultado neto**.

![Pestaña Resultados con el estado de resultados del mes y el Resultado neto](/ayuda/capturas/contabilidad-reportes-resultados.jpg)

> [!NOTA]
> El **Resultado neto** sale de los asientos, sin IVA. Es la mejor respuesta a "¿cuánto gané de verdad?". Si te parece bajo, revisá que estén cargadas todas las facturas de compra.

## Ventas

Muestra lo facturado en el período, en dos tablas:

- **Ventas por cliente**: **Cliente**, cantidad de **Facturas** y **Total vendido**. Por ejemplo, cuánto le facturaste a Constructora Del Valle SRL este trimestre.
- **Ventas por producto**: **SKU**, **Artículo**, **Cantidad** e **Ingresos**. Por ejemplo, cuántos taladros percutores 13 mm vendiste.

> [!IMPORTANTE]
> En **Ventas** los importes incluyen el IVA y ya tienen restadas las notas de crédito. Por eso no dan igual que en **Resultados**, que es sin IVA.

## Financiero

Muestra tus cuentas de dinero (cajas, bancos, Mercado Pago, cobranzas a depositar) con su saldo. Desde acá también se crean cuentas, se transfiere entre ellas, se liquidan las tarjetas y se concilia con el banco. Está explicado paso a paso en [Cuentas de dinero y conciliación bancaria](/documentacion/contabilidad/cuentas-de-dinero).

## ¿Qué reporte uso?

| Si querés saber... | Andá a |
|---|---|
| Cuánto gané en el mes | **Contabilidad › Reportes**, pestaña **Resultados** |
| Quiénes son mis mejores clientes | **Contabilidad › Reportes**, pestaña **Ventas**, **Ventas por cliente** |
| Qué artículos se venden más | **Contabilidad › Reportes**, pestaña **Ventas**, **Ventas por producto** |
| Cuánta plata tengo en cada cuenta | **Contabilidad › Reportes**, pestaña **Financiero** |
| Cuánto IVA tengo que pagar | **Contabilidad › Impuestos**, pestaña **Libro IVA** (ver [Libro IVA](/documentacion/contabilidad/libro-iva)) |
| El saldo de una cuenta contable | **Contabilidad › Contabilidad**, pestaña **Libro Mayor** (ver [Libros Diario y Mayor](/documentacion/contabilidad/libros-diario-y-mayor)) |

Para una mirada rápida, con gráficos de ventas y compras, usá **Resumen** en el menú principal.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Sin ventas en el período** | No hay facturas en esas fechas. | Ampliá el período. |
| **Error al cargar el estado de resultados** | No hay conexión o no tenés permiso para ver Reportes. | Recargá la página. Si sigue, pedile acceso al Dueño de la empresa. |
| No ves **Reportes** en el menú | Tu usuario no tiene acceso a ese módulo. | Pedile al Dueño o a un Administrador que lo revise. |
