---
title: Cuentas de dinero y conciliación bancaria
summary: Cómo crear tus cajas, bancos y cuentas de Mercado Pago, mover plata entre ellas, liquidar tarjetas y conciliar con el extracto del banco.
minutes: 8
roles: Dueño, Administrador, Contador externo
---

Las cuentas de dinero son los lugares donde está la plata de tu empresa: la caja, cada cuenta bancaria, Mercado Pago. Oplex lleva el saldo de cada una y lo asienta en su propia cuenta contable, así el saldo de Tesorería y el de la contabilidad coinciden. En este artículo vas a crear las cuentas, registrar movimientos sueltos, pasar plata de una a otra, liquidar las ventas con tarjeta y conciliar con el extracto del banco.

Todo está en **Contabilidad › Reportes**, pestaña **Financiero**.

## Antes de empezar

- Tenés que ser **Dueño** o **Administrador** para crear cuentas y registrar movimientos. El contador externo puede verlas.
- Tené a mano el saldo actual de cada cuenta, para cargarlo como saldo inicial.

## La lista de cuentas

En **Cuentas financieras** ves cada cuenta con su **Nombre**, su **Proveedor** (**Banco**, **MercadoPago**, **PayPal**, **Efectivo** o **Cobranzas a depositar**) y su **Saldo**.

**Cobranzas a depositar** la crea Oplex sola. Ahí queda lo que cobraste con tarjeta, o sin decir dónde entró la plata, hasta que llega al banco.

## Pasos para crear una cuenta

1. Tocá **+ Nueva cuenta**.
2. Escribí el **Nombre**, por ejemplo "Cuenta corriente Banco Nación".
3. Elegí el **Proveedor**: **Banco**, **MercadoPago**, **PayPal** o **Efectivo**.
4. Si tu empresa usa más de una moneda, elegí la **Moneda**. Si la dejás vacía, la cuenta queda en pesos.
5. Si la cuenta ya tiene plata, cargala en **Saldo inicial (opcional)**.
6. Tocá **Crear cuenta**.

## Pasos para registrar un ingreso o un egreso suelto

Para lo que no viene de una factura: un gasto bancario, un aporte de los socios, intereses.

1. Tocá la cuenta en la lista. Abajo se abre su panel **Conciliación**.
2. Tocá **+ Nuevo movimiento**.
3. Elegí **Egreso** o **Ingreso**.
4. Escribí el **Importe**.
5. Elegí el **Concepto**. Arriba están los más usados (**Gastos bancarios**, **Gastos generales**, **Impuestos y tasas**, **Retiro de socios**, **Intereses ganados**, **Otros ingresos**, **Aporte de socios**) y abajo, en **Otra cuenta del plan**, cualquier otra cuenta contable.
6. Revisá la **Fecha** y, si querés, agregá un **Detalle (opcional)**.
7. Tocá **Registrar movimiento**.

## Pasos para transferir entre cuentas

Por ejemplo, para depositar en el banco el efectivo de la caja de Casa Central. El botón aparece cuando tenés al menos dos cuentas.

1. Tocá **Transferir entre cuentas**.
2. Elegí la cuenta **Desde** y la cuenta **Hacia**.
3. Escribí el **Importe** y, si querés, una **Nota (opcional)**.
4. Tocá **Transferir**.

> [!IMPORTANTE]
> Para pasar plata entre tus propias cuentas usá siempre **Transferir entre cuentas**, no **+ Nuevo movimiento**. Si no, el asiento queda mal.

## Pasos para liquidar las ventas con tarjeta

Cuando la procesadora de la tarjeta te deposita lo vendido, te descuenta comisiones e impuestos. Con la liquidación registrás todo de una vez.

1. Tocá **Liquidación de tarjeta**.
2. En **Sale de** dejá **Cobranzas a depositar**. En **Se acredita en** elegí tu banco.
3. Completá la **Fecha de acreditación** y, si querés, el **N° de liquidación (opcional)**.
4. Escribí el **Total de ventas liquidadas** (el bruto que figura en la liquidación).
5. Cargá cada descuento con **+ Agregar descuento**: **Arancel / comisión**, **IVA sobre el arancel**, **Costo financiero (cuotas)**, **Retención IIBB**, **Retención IVA**, **Retención Ganancias** u **Otro gasto**, con su importe.
6. Controlá el **Neto que entra al banco**: tiene que coincidir con lo que ves acreditado en el banco.
7. Tocá **Registrar liquidación**.

## Cuentas en dólares

Si una cuenta está en otra moneda, en su fila aparece **Actualizar cotización**. Tocalo para revaluarla con la última cotización cargada: el saldo en dólares no cambia, pero se registra la diferencia de cambio en pesos.

## Conciliación bancaria

Conciliar es comprobar que lo que dice el banco coincide con lo que registraste en Oplex.

1. Tocá la cuenta bancaria en la lista. Abajo se abre **Conciliación**, con el **Saldo contable**, lo **Conciliado**, lo **Sin conciliar** y lo **Pendiente de conciliación**.
2. Tocá **Importar extracto** y después **Descargar plantilla**.
3. Completá la plantilla con los movimientos del extracto de tu banco: **Fecha**, **Descripción** e **Importe** (los débitos, en negativo). Entran hasta 500 filas por archivo.
4. Subí el archivo .xlsx y tocá **Importar**.
5. Oplex busca solo, para cada línea, un movimiento con el mismo importe y una fecha de hasta 3 días de diferencia. Al terminar te dice cuántas líneas se importaron, cuántas se matchearon solas y cuántas quedaron pendientes.
6. Revisá **Líneas de extracto pendientes de revisión**. Para cada una:
   - **Vincular**: la unís con un movimiento que ya está en Oplex.
   - **Crear movimiento**: para algo que está en el banco pero no en Oplex, como una comisión. Se registra como **Gasto bancario** o **Ingreso bancario**.
   - **Ignorar**: la descartás.
7. En **Movimientos sin conciliar** están los movimientos de Oplex que todavía no se cruzaron con el banco. Si comprobás que están bien, tocá **Conciliar**.

> [!NOTA]
> Los cheques no se manejan acá: tienen su propia pantalla, [Cartera de cheques](/documentacion/contabilidad/cartera-de-cheques).

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **El nombre es obligatorio** | Creaste una cuenta sin nombre. | Escribí el nombre. |
| **La cuenta de origen y destino no pueden ser la misma** | Elegiste la misma cuenta en **Desde** y **Hacia**. | Elegí dos cuentas distintas. |
| **Elegí un concepto** | El movimiento no tiene concepto. | Elegí uno de la lista. |
| **Para pasar plata entre cuentas de dinero usá "Transferencia entre cuentas"** | Elegiste como concepto otra cuenta de dinero. | Cancelá y usá **Transferir entre cuentas**. |
| **Los descuentos no pueden ser iguales o mayores al total liquidado** | La suma de descuentos es igual o mayor al bruto. | Revisá los importes de la liquidación. |
| **No hay ninguna cotización cargada para la moneda de esta cuenta** | Oplex no tiene cotización para esa moneda. | Escribí a soporte. |
| **Este archivo ya se importó el** (fecha) **... - no se importa dos veces.** | Subiste un extracto que ya habías importado. | No hace falta volver a subirlo. |
| **Faltan columnas obligatorias en el archivo** | El archivo no respeta la plantilla. | Bajá de nuevo la plantilla y copiá ahí los datos. |
| **Fecha inválida o faltante (formato esperado DD/MM/AAAA)** | Una fila tiene la fecha vacía o mal escrita. | Corregí la fila indicada. No se importa nada hasta que el archivo no tenga errores. |
| **Importe inválido: debe ser un número distinto de 0** | Una fila tiene el importe vacío, en cero o con texto. | Corregí la fila indicada. |
