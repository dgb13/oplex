---
title: Cobrar con Point de Mercado Pago
summary: Cobrá en tu posnet Point (Mini, Plus o Smart) como siempre y dejá que Oplex controle cada cobro contra tu cuenta de Mercado Pago.
minutes: 5
roles: Dueño, Administrador, Ventas
---

Si cobrás con un posnet **Point de Mercado Pago**, en la Caja elegí la forma de pago **Point de Mercado Pago**. El cajero cobra en el posnet como siempre, escribiendo el monto. Después Oplex busca ese pago en tu cuenta de Mercado Pago y lo marca como confirmado solo. Lo que no coincide queda en **Control de cobros con Point** para revisar.

Sirve con cualquier modelo de Point: Mini, Plus o Smart.

## Antes de empezar

- La cuenta de Mercado Pago conectada en la sección **Mercado Pago** (Dueño o Administrador). Sin eso, **Point de Mercado Pago** se puede elegir igual, pero Oplex no puede controlar los cobros.
- El Point vinculado a esa misma cuenta de Mercado Pago.

## Cobrar en la Caja

1. **Cargá el ticket y tocá Cobrar**, como siempre.
2. **En el medio de pago elegí Point de Mercado Pago.** Aparece el recuadro **Cobralo en el posnet** con el monto en grande.
3. **Escribí ese monto en el Point y pasá la tarjeta.**
4. **Cuando el Point diga aprobado, tocá Confirmar cobro.** La venta se factura como cualquier otra.

En **Venta confirmada** vas a ver **⏳ Esperando el pago en Mercado Pago**. No hace falta esperar: cuando el pago llega a tu cuenta, Oplex lo empareja y la venta pasa a **✓ Pago confirmado en Mercado Pago**.

> [!NOTA]
> **Point de Mercado Pago** es distinto de **Tarjeta** (un posnet de otro banco) y de **Mercado Pago (QR)** (el QR de la caja). Elegí el que corresponde: así cada cobro queda en la cuenta correcta y se puede controlar.

## Cómo empareja Oplex

Mientras haya ventas con Point sin pago, Oplex consulta tu cuenta de Mercado Pago cada 2 minutos. Una venta se confirma sola cuando hay **un y sólo un** pago de Point que cumple:

- **Mismo monto**, exacto al centavo.
- **Hecho entre 2 minutos antes y 20 minutos después** de confirmar la venta.

Si hay dos pagos que encajan (por ejemplo, dos ventas iguales seguidas), Oplex no adivina: la deja **Para elegir** y lo decide una persona.

## Control de cobros con Point

Está en **Mercado Pago › Point** (Dueño, Administrador y Contador lo ven; lo resuelven el Dueño o un Administrador). Arriba ves cuántos cobros se confirmaron hoy y cuántos hay para revisar. **A revisar** muestra sólo lo pendiente; **Todos**, el día completo. **Actualizar ahora** consulta a Mercado Pago sin esperar los 2 minutos.

Tocá una fila para ver el detalle y resolverla:

| Estado | Qué pasó | Qué podés hacer |
|---|---|---|
| **Sin pago en MP** | La venta se cargó como Point, pero a los 30 minutos no apareció el pago. Oplex avisa en la campana. | **Fue en efectivo** (pasa la plata a la caja y suma al arqueo del turno, si sigue abierto), **Fue con tarjeta de otro posnet** (la pasa a Cobranzas a depositar) o **Esperar**: se confirma sola si el pago aparece. La factura no cambia. |
| **Para elegir** | Más de un pago de Point encaja con la venta. | Tocá **Es este** en el pago que corresponde. El otro queda para la venta que sea. |
| **Pago sin venta** | Entró a la cuenta un pago de Point que no coincide con ninguna venta. | **Es de una venta ya hecha…** (elegís la venta con Point sin pago del mismo monto), **Cargar la venta ahora** (abre la Caja con ese pago: cargás los artículos y no se le vuelve a cobrar al cliente) o **No es una venta** (una seña, un arreglo). |

## Al cerrar el turno

En **Cerrar turno** aparece aparte **Point de Mercado Pago**, con cuántos cobros ya confirmó Mercado Pago y cuántos siguen sin pago. El Point no entra en el arqueo del cajón: esa plata va a la cuenta de Mercado Pago. Podés cerrar el turno igual; lo pendiente sigue en **Control de cobros con Point**.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **La cuenta de Mercado Pago no está conectada: …** | Falta conectar la cuenta. | Conectala en la sección **Mercado Pago**. |
| **El turno de esa venta ya se cerró: …** | Elegiste **Fue en efectivo** en una venta de un turno cerrado. Si la plata entró al cajón, ya quedó como sobrante en ese arqueo. | Elegí **Fue con tarjeta de otro posnet** o dejala esperando. |
| **El pago es de $… y la venta de $…: tienen que ser iguales** | Quisiste emparejar un pago con una venta de otro monto. | Elegí la venta correcta o cargala con **Cargar la venta ahora**. |
| Un cobro con Point nunca se confirma | Se cobró en un Point de otra cuenta, o el cobro fue rechazado en el posnet. | Revisá en el posnet y resolvelo desde **Sin pago en MP**. |
