---
title: Mercado Pago
summary: Conectá tu cuenta de Mercado Pago desde su sección del menú, mirá cada cobro con su comisión y cuándo se libera, manejá los links de pago, activá el QR de cada caja y elegí dónde se registra la plata.
minutes: 5
roles: Dueño, Administrador (todo); Contador (Resumen y Movimientos)
---

**Mercado Pago** tiene su propia sección en el menú de la izquierda. Ahí conectás la cuenta de Mercado Pago del negocio, ves cada cobro con lo que descontó Mercado Pago y activás el QR de cada caja. Con la cuenta conectada podés cobrar facturas con un link de pago (ver [Cobrar](/documentacion/ventas/cobrar)) y cobrar con QR en la Caja (ver [QR de Mercado Pago](/documentacion/caja/qr-mercado-pago)). La plata entra en tu propia cuenta de Mercado Pago, no en la de Oplex.

## Antes de empezar

- Entrar con un usuario **Dueño** o **Administrador**. El **Contador** ve sólo **Resumen** y **Movimientos**; los demás roles no ven la sección.
- Tener a mano la cuenta de Mercado Pago **donde querés recibir la plata** (la del negocio, no una personal).

## Conectar la cuenta

1. **Abrí Mercado Pago** en el menú de la izquierda. Mientras no está conectada, al lado dice **Conectar**.
2. **Tocá Conectar Mercado Pago.** Oplex te lleva a la página de Mercado Pago.
3. **Entrá con tu cuenta y tocá Autorizar.** Oplex nunca ve tu contraseña.
4. **Volvés sola a Oplex.** Arriba dice **Conectado** y el nombre de la cuenta, y aparece **Listo: la cuenta de Mercado Pago quedó conectada.**

Si volvés y dice **Volviste sin conectar**, cancelaste en Mercado Pago o no tocaste **Autorizar**: no se conectó nada y podés probar de nuevo.

> [!NOTA]
> En el **Tablero** también aparece el aviso **Cobrá con QR y links de pago** con el botón **Conectar**, hasta que la cuenta quede conectada. Lo podés ocultar con la cruz.

## Resumen

La pestaña **Resumen** muestra, para el **Período** que elijas:

- **Cobrado**: lo que entró por Mercado Pago, sin lo que se devolvió.
- **Comisiones e impuestos de MP**: lo que descontó Mercado Pago, y qué porcentaje es de lo cobrado.
- **Neto que te queda**: cobrado menos comisiones.
- **Por liberarse**: plata ya cobrada que Mercado Pago todavía no te liberó (de cualquier fecha). En **Próximas liberaciones** la ves por día.
- **De dónde vinieron los cobros**: cuánto entró por la Caja (QR), por links de facturas y cotizaciones y fuera de Oplex.

Los totales son en pesos. Si hubo cobros en otra moneda, se avisan aparte. Si hay cobros con QR sin asignar a una venta, aparece el aviso con **Ver y asignar**, que te lleva a **Movimientos** ya filtrado.

> [!NOTA]
> El Resumen usa los mismos movimientos que la pestaña **Movimientos**. Si acabás de cobrar algo y no aparece, tocá **Actualizar movimientos** ahí.

## Movimientos

En la pestaña **Movimientos** ves cada cobro que entró a tu cuenta de Mercado Pago:

- **Fecha** y **Origen**: de dónde vino el cobro. Puede ser una caja (**QR**), una factura o una cotización (**Link**) o **Fuera de Oplex** (lo que cobraste directo en Mercado Pago, sin pasar por Oplex).
- **Medio**: por ejemplo **Crédito · 3 cuotas**, **Débito** o **Dinero en cuenta**.
- **Cobrado**, **Comisión** y **Neto**: la comisión es todo lo que descontó Mercado Pago (comisión, costo de las cuotas e impuestos), o sea, cobrado menos neto.
- **Se libera**: la fecha en que Mercado Pago te deja disponible la plata, o **Disponible** si ya la liberó.
- **En Oplex**: si el cobro está registrado. **Cobro en la factura** o el número de la factura de la venta quiere decir que sí. **Pagada, sin facturar** es una cotización pagada con link: Oplex no registra ese pago como cobro, así que acordate de registrarlo cuando hagas la factura. **Fuera de Oplex** quiere decir que no tiene nada que ver con Oplex.

Tocá un movimiento para ver el **N.º de operación** de Mercado Pago, quién pagó y si hubo una devolución.

1. **Filtrá** con **Todos**, **Caja (QR)**, **Facturas y cotizaciones**, **Fuera de Oplex** o **Sin asignar**, y elegí el **Período**.
2. **Actualizá.** La primera vez Oplex trae solo los últimos 90 días. Después se actualiza cada noche y cada vez que entra un pago de un link. Para traer lo último en el momento, tocá **Actualizar movimientos**.
3. **Exportá.** **Exportar a Excel** baja la lista con los filtros que elegiste.

> [!IMPORTANTE]
> **Sin asignar a una venta** es un cobro con QR que entró en Mercado Pago pero no quedó en ninguna venta. Tocá **Asignar a venta**: te lleva a la Caja con la lista de cobros sin venta (ver [Cobros QR sin venta](/documentacion/caja/cobros-qr-sin-venta)). La caja tiene que tener un turno abierto; si no lo tiene, abrilo y tocá **Resolver** en el aviso de arriba.

## Links de pago

La pestaña **Links de pago** lista los links que mandaste desde facturas, cotizaciones o el asistente, con el cliente, el monto, la fecha y el estado (**Esperando pago**, **Pagado**, **Cancelado** o **Con error**). Con un link que está **Esperando pago** podés:

- **Copiar link**, para mandarlo vos por WhatsApp o donde quieras.
- **Reenviar por correo**: le llega al cliente al correo que tiene cargado en Empresas. Si no tiene correo, el botón no se puede tocar.
- **Cancelar** y después **Sí, cancelar**: el link deja de aceptar pagos.

Si un link quedó **Cancelado** o **Con error** y la factura todavía tiene saldo (o la cotización sigue aceptada), aparece **Generar uno nuevo**.

> [!NOTA]
> Una cotización pagada con link no registra el cobro: cuando hagas la factura, registrá el cobro como siempre.

## Configuración

En **Dónde cobrás con Mercado Pago**:

- **Links de pago en facturas y cotizaciones**: si lo apagás, no aparece **Cobrar con Mercado Pago** en Facturación y el asistente no manda links. Los links que ya mandaste siguen andando hasta que los canceles.
- **QR en las cajas**: se prende en cada caja (ver abajo).
- **Asistente**: con **Configurar** vas a sus permisos.
- **Tienda online**: **Próximamente**.

En **Dónde se registra la plata en Oplex** elegís la cuenta de dinero de Mercado Pago a la que entran los cobros por link y por QR. Si tenés una sola, ya está elegida. Para tener otra (por ejemplo, una por sucursal), creala en **Contabilidad › Reportes**, pestaña **Financiero** (ver [Cuentas de dinero](/documentacion/contabilidad/cuentas-de-dinero)).

## Activar el QR de una caja

En la pestaña **Configuración**, en **QR por caja** ves cada caja con su estado:

- **QR activo**: la caja ya cobra con QR. Tocalo para ver el QR, descargarlo para imprimir o desactivarlo.
- **Crear QR**: abre la ventana para darla de alta en Mercado Pago. Los pasos están en [QR de Mercado Pago](/documentacion/caja/qr-mercado-pago).

## Si la conexión venció

Arriba dice **Necesita reconexión** y aparece **La conexión con Mercado Pago venció**. Pasa si Mercado Pago dejó de aceptar la autorización (por ejemplo, porque se quitó el permiso desde Mercado Pago). Tocá **Reconectar Mercado Pago** y repetí los pasos de conectar. Mientras tanto no se pueden crear links ni cobrar con QR, pero los cobros anteriores no se pierden.

## Desconectar

En **Configuración › Cuenta conectada** ves la cuenta, quién la conectó y cuándo. Para cortar la conexión tocá **Desconectar Mercado Pago** y después **Sí, desconectar**. Se dejan de crear links y de cobrar con QR hasta que la vuelvas a conectar.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **No se pudo terminar la conexión** | Mercado Pago no confirmó la autorización. | Probá de nuevo y fijate de entrar con la cuenta del negocio. |
| **No tenés permiso para ver esta sección.** | Tu rol no es Dueño, Administrador ni Contador. | Pedile a un Dueño o Administrador lo que necesites de Mercado Pago. |
| **Crear QR** no se puede tocar. | La conexión venció. | Tocá **Reconectar Mercado Pago** arriba. |
| **Los links de pago de Mercado Pago están apagados. Se prenden en Mercado Pago › Configuración.** | Se apagaron los links en Configuración. | Prendé **Links de pago en facturas y cotizaciones**. |
| **… no tiene correo cargado. Cargalo en Empresas o copiá el link y mandalo vos.** | El cliente no tiene correo. | Cargalo en **Empresas** o usá **Copiar link**. |
| No aparece un cobro que acabás de recibir. | Todavía no se actualizó la lista. | Tocá **Actualizar movimientos**. |
| **Se trajeron … movimientos. Hay más: tocá "Actualizar movimientos" otra vez para seguir.** | Había muchos movimientos para traer de una vez. | Tocá **Actualizar movimientos** de nuevo hasta que diga **Movimientos al día**. |
