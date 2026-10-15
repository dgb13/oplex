---
title: Plan de cuentas y asientos
summary: Cómo ver y ampliar el plan de cuentas, y cómo cargar un asiento manual cuando Oplex no lo genera solo.
minutes: 6
roles: Dueño, Administrador, Contador externo
---

Oplex lleva la contabilidad de tu empresa en segundo plano: cada factura, cobro, compra y pago genera su asiento solo, sin que tengas que hacer nada. En este artículo vas a ver dónde está el plan de cuentas, cómo agregar una cuenta propia y cómo cargar un asiento manual para los casos que el sistema no cubre (por ejemplo, un ajuste que te pide tu contadora).

Todo esto está en **Contabilidad › Contabilidad**, pestaña **Plan de Cuentas**.

## Antes de empezar

- Tenés que ser **Dueño** o **Administrador**. El contador externo que vinculaste desde **Contadores** puede ver estas pantallas, pero no cargar cuentas ni asientos.
- Si no sabés qué cuenta usar, consultalo con quien lleva tu contabilidad (en el ejemplo, Paula Ríos, del estudio "Ríos & Asoc."). Un asiento mal cargado no se borra.

## El plan de cuentas

La pestaña **Plan de Cuentas** muestra todas las cuentas con su **Código**, **Nombre**, **Tipo** (**Activo**, **Pasivo**, **Patrimonio**, **Ingreso** o **Gasto**) y **Tipo de partida**.

La columna **Tipo de partida** sólo aparece en las cuentas de Activo, Pasivo y Patrimonio. Es una casilla que marca si la cuenta es **Monetaria** o **No monetaria**. Sólo importa para el [Ajuste por inflación](/documentacion/contabilidad/ajuste-por-inflacion): si no lo usás, no la toques.

![Pestaña Plan de Cuentas con la lista de cuentas y el botón para crear una nueva](/ayuda/capturas/contabilidad-plan-de-cuentas.jpg)

## Pasos para agregar una cuenta

1. Tocá **+ Nueva cuenta**. Se abre la ventana **Nueva cuenta**.
2. Completá el **Código**. Seguí la numeración que ya usa tu plan (por ejemplo, `1.1.03`).
3. Completá el **Nombre**, por ejemplo "Caja chica Sucursal Norte".
4. Elegí el **Tipo**: **Activo**, **Pasivo**, **Patrimonio**, **Ingreso** o **Gasto**.
5. Tocá **Crear cuenta**.

> [!NOTA]
> Desde la pantalla no se puede cambiar el nombre ni el código de una cuenta que ya existe. Sólo se puede cambiar la casilla de **Tipo de partida**.

## Qué asientos se generan solos

No hace falta cargar a mano lo que ya pasa por Oplex. Se asientan solos, entre otros:

- Las facturas y notas de crédito de venta.
- Los cobros a clientes y los pagos a proveedores.
- Las facturas de compra.
- Los movimientos de dinero, transferencias y liquidaciones de tarjeta de **Reportes › Financiero** (ver [Cuentas de dinero](/documentacion/contabilidad/cuentas-de-dinero)).
- El ajuste por inflación, cuando lo emitís.

Los ves todos en la pestaña **Libro Diario** (ver [Libros Diario y Mayor](/documentacion/contabilidad/libros-diario-y-mayor)).

## Pasos para cargar un asiento manual

1. Andá a la pestaña **Libro Diario** y tocá **+ Nuevo asiento**. Se abre **Nuevo asiento manual**.
2. Escribí la **Descripción**. Que se entienda dentro de un año: por ejemplo, "Ajuste de caja Casa Central - faltante del 30/09".
3. Completá la primera línea: elegí la cuenta en **Cuenta...**, dejá **Debe** y escribí el importe.
4. Completá la segunda línea: elegí la cuenta, dejá **Haber** y escribí el importe.
5. Si el asiento tiene más de dos cuentas, tocá **+ agregar línea** y completala igual. Con la ✕ de la derecha borrás una línea de más.
6. Mirá el recuadro de abajo: muestra el total del **Debe** y del **Haber**. Cuando los dos son iguales aparece **Balanceado ✓**.
7. Tocá **Postear asiento**.

El asiento se guarda con la fecha de hoy y aparece primero en el **Libro Diario**.

![Ventana Nuevo asiento manual con dos líneas completas y el recuadro Balanceado](/ayuda/capturas/contabilidad-nuevo-asiento.jpg)

> [!IMPORTANTE]
> Un asiento posteado no se puede editar ni borrar. Si te equivocaste, cargá otro asiento manual con las mismas cuentas e importes pero al revés (lo que estaba en el Debe, al Haber, y viceversa). Así quedan los dos movimientos registrados y el saldo vuelve a estar bien.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Código y nombre son obligatorios** | Dejaste vacío el código o el nombre de la cuenta. | Completá los dos campos. |
| **La descripción es obligatoria** | El asiento no tiene descripción. | Escribí una descripción. |
| **Cada línea necesita cuenta e importe mayor a cero** | Alguna línea quedó sin cuenta o con importe vacío o en cero. | Completá la línea o borrala con la ✕. |
| **El asiento no balancea: débitos $... vs créditos $...** | La suma del Debe no es igual a la del Haber. | Revisá los importes hasta que aparezca **Balanceado ✓**. El botón **Postear asiento** no se activa hasta entonces. |
