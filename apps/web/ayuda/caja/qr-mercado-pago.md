---
title: QR de Mercado Pago
summary: Activá el QR fijo de cada caja y cobrá con Mercado Pago: el cliente escanea, paga y la venta se confirma sola con su factura.
minutes: 5
roles: Dueño, Administrador (activar); Ventas (cobrar)
---

Con el QR de Mercado Pago, el cliente paga desde la app de Mercado Pago escaneando un código en la pantalla o el QR impreso pegado en el mostrador. Cuando Mercado Pago avisa que el pago se acreditó, Oplex confirma la venta sola: emite la factura con CAE, descuenta el stock y registra el cobro. La plata entra en tu propia cuenta de Mercado Pago.

## Antes de empezar

- La cuenta de Mercado Pago conectada: abrí **Mercado Pago** en el menú de la izquierda y tocá **Conectar Mercado Pago**. Te lleva a Mercado Pago para autorizar a Oplex y volvés sola. Tiene que decir **Conectado** (ver [Mercado Pago](/documentacion/ventas/mercado-pago)).
- La caja creada (ver [Configurar las cajas](/documentacion/caja/configurar-cajas)).
- El link de Google Maps (o las coordenadas) del local.

## Activar el QR de una caja

1. **Abrí Cajas (POS)** desde tu foto o iniciales arriba a la derecha, o la sección **Mercado Pago** del menú (**QR por caja**).
2. **Tocá Activar QR** en la fila de la caja (en la sección Mercado Pago, **Crear QR**). Se abre **Activar QR · Caja 1 - Mostrador** con la marca **Sin activar**.
3. **Revisá la dirección.** **Calle**, **Número**, **Provincia** y **Ciudad** (o **Barrio**, en Capital Federal) vienen con la dirección de la sucursal; corregila si no coincide. Mercado Pago muestra la sucursal con esta dirección en el mapa de su app.
4. **Pegá la ubicación.** En **Ubicación en el mapa** pegá el link de Google Maps o las coordenadas. Si está bien, ves **Ubicación detectada:** con los números. Si no sabés cómo copiarla, abrí **¿Cómo copio la ubicación?**.
5. **Tocá Activar QR.** La ventana pasa a **QR activo** y muestra el **QR fijo** de la caja.
6. **Imprimilo.** Tocá **Descargar QR para imprimir (PDF)** y pegalo en el mostrador.

> [!NOTA]
> Si la sucursal ya está dada de alta en Mercado Pago (por ejemplo, porque activaste otra caja de la misma sucursal), la dirección no se puede cambiar: la nueva caja se suma a esa sucursal.

Para dejar de cobrar con QR en una caja, abrí **QR activo** y tocá **Desactivar QR**.

## Cobrar con QR

1. **Armá el ticket y tocá Cobrar.** Igual que siempre (ver [Vender y cobrar](/documentacion/caja/vender-y-cobrar)).
2. **Elegí Mercado Pago** como medio de pago. Debajo aparece **Al confirmar se muestra un QR por el monto de Mercado Pago. La venta se cierra cuando Mercado Pago avise que el pago se acreditó.**
3. **Tocá Generar QR.** Aparece **Escaneá con la app de Mercado Pago**, el QR, el monto y **Esperando pago** con una cuenta regresiva de 10 minutos. El cliente puede escanear el de la pantalla o el impreso.
4. **Esperá el pago.** Cuando se acredita, ves **Mercado Pago · pago acreditado** y Oplex confirma la venta sola. Después aparece **Venta confirmada**, con el número de operación de Mercado Pago.
5. **Imprimí el ticket** con **Imprimir ticket**, o seguí con **Nueva venta**.

Podés combinar medios: por ejemplo, una parte en efectivo y el resto con QR. Lo único es que haya **una sola** fila de Mercado Pago.

## Si el pago no llega

- **El pago fue rechazado** (**Mercado Pago rechazó el pago**): el cliente puede probar con otra tarjeta o con saldo. La venta sigue abierta y no se emitió factura.
- **El QR venció** (**Pasaron 10 minutos sin pago**): la venta sigue abierta. Tocá **Generar QR nuevo** o **Cambiar medio de pago**.
- **Cancelar cobro:** si el cliente se arrepiente mientras está **Esperando pago**, cancelás el QR y volvés a la ventana **Cobrar**. Si justo pagó en ese momento, la venta sigue igual.

> [!IMPORTANTE]
> Si el pago se acreditó pero la venta no se pudo confirmar (por ejemplo, ARCA no respondió), el cobro queda guardado y no se le vuelve a cobrar al cliente. Tocá **Reintentar confirmar venta**. Si cerraste la ventana, lo vas a ver en el aviso de [Cobros QR sin venta](/documentacion/caja/cobros-qr-sin-venta).

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **La cuenta de Mercado Pago de esta empresa no está conectada - conectala desde la sección Mercado Pago** | Mercado Pago no está conectado o se desconectó. | Conectalo en la sección **Mercado Pago** del menú. Si dice **Necesita reconexión**, tocá **Reconectar Mercado Pago**. |
| **Esas coordenadas quedan fuera de Argentina. Revisá que hayas copiado el lugar correcto.** | La ubicación pegada no es la del local. | Copiá de nuevo la ubicación desde Google Maps. |
| **Ese link corto no trae las coordenadas. …** | Pegaste un link corto de Google Maps. | Copiá los números de las coordenadas como indica el mensaje. |
| **Mercado Pago no aceptó los datos de la sucursal** / **Mercado Pago rechazó los datos: …** | La dirección no pasó la validación de Mercado Pago. | Revisá calle, número, ciudad y provincia. |
| **No se pudo generar el QR** | Mercado Pago no respondió. | Tocá **Probar de nuevo** o **Volver** y cobrá con otro medio. |
| **El monto mínimo para cobrar con QR de Mercado Pago es $…** | El monto es menor al mínimo de Mercado Pago. | Cobrá ese importe con otro medio. |
| **Para cobrar con QR dejá una sola fila de Mercado Pago** | Hay dos filas de Mercado Pago. | Uní las dos en una. |
