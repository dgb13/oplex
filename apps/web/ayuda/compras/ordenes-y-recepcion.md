---
title: Órdenes de compra y recepción
summary: Cómo emitir una orden de compra, enviarla por email o WhatsApp, recibir la mercadería en el depósito y devolverla si viene mal.
minutes: 7
roles: Dueño, Administrador, Compras, Inventario
---

La orden de compra es tu pedido en firme al proveedor: qué artículos, cuántos y a qué costo. Cuando la mercadería llega, la recibís contra esa orden y el stock sube en el depósito que elijas, con el costo correcto. Así sabés siempre qué pediste, qué llegó y qué falta.

Todo está en **Compras › Compras**, pestaña **Órdenes de Compra**.

## Antes de empezar

- El proveedor tiene que tener un **email** o algún **contacto** con email o WhatsApp para poder enviarle la orden (ver [Proveedores](/documentacion/compras/proveedores)).
- Tenés que tener al menos un depósito creado (ver [Depósitos y movimientos](/documentacion/inventario/depositos-y-movimientos)).
- Cargá tu condición frente al IVA, así Oplex calcula bien el costo real con el que entra la mercadería (ver [Precios, costos e IVA](/documentacion/inventario/precios-costos-iva)).

## Pasos: crear la orden

Podés crear la orden desde un pedido de cotización (con **Emitir Orden de Compra** o **Elegir este proveedor**, ver [Pedidos de cotización](/documentacion/compras/pedidos-de-cotizacion)) o directamente:

1. **Tocá Nueva orden.** Se abre **Nueva orden de compra**.
2. **Elegí Proveedor y Moneda.** Opcionalmente, **Modo de transporte**, **Forma de pago**, **Plazo de entrega** y **Notas**.
3. **Indicá cómo vienen los costos.** Al lado de **Líneas · los costos de esta orden están** elegí **sin IVA** o **con IVA**, según cómo te los pasó el proveedor.
4. **Cargá las líneas.** Artículo, cantidad y **Costo unit.** A la derecha Oplex te muestra el costo **real** con que va a entrar al stock: si sos Responsable Inscripto le saca el IVA (porque lo recuperás); si sos Monotributo o Exento se lo suma.
5. **Tocá Crear orden de compra.** La orden queda en **Borrador**, con un número como OC-000001.

## Pasos: enviar la orden al proveedor

1. **Abrí la orden con Ver y tocá Enviar.** Cuando la orden viene de un pedido de cotización, esta ventana se abre sola.
2. **Elegí a quién se la mandás.** Aparecen la casilla institucional del proveedor y sus contactos. Si falta alguien, usá **+ agregar email institucional** o **+ agregar contacto (vendedor, comprador...)**.
3. **Tocá Enviar por Email** o **Enviar por WhatsApp.** Por email, Oplex manda la orden en PDF. Por WhatsApp, se abre WhatsApp con el mensaje listo para que lo mandes vos.
4. **Listo.** La orden pasa a **Enviada** y en la columna **Enviada vía** ves por qué medio salió, cuándo y a quién.

> [!IMPORTANTE]
> Sólo se puede recibir mercadería de una orden **Enviada**. Si elegiste **Sólo guardar (no enviar ahora)**, la orden queda en Borrador y no vas a ver **Recibir mercadería** hasta que la envíes.

Para reclamarle al proveedor, tocá el ícono de **Enviada vía** y elegí **Mensaje rápido**: hay mensajes armados ("¿nos confirmás si ya despachaste...?") que mandás con **Enviar por WhatsApp** o **Enviar por correo**. Desde ahí también podés **Reenviar (email o WhatsApp)**.

![Lista de órdenes de compra con el estado de recepción y la columna Enviada vía](/ayuda/capturas/compras-ordenes-lista.jpg)

## Pasos: recibir la mercadería

1. **Tocá el ícono de Recibir mercadería** (la caja con tilde) en la fila de la orden, o abrila con **Ver** y tocá **Recibir mercadería**.
2. **Elegí el Depósito** donde entra la mercadería. Por ejemplo, Depósito Central.
3. **Completá la Fecha de recepción** y el número del **Remito / comprobante de proveedor**. Podés adjuntar **Foto o escaneo del remito** (desde el celular abre la cámara).
4. **En A recibir ahora, poné lo que llegó de cada artículo.** Si llegó todo, dejalo como está. Si llegó una parte, poné sólo esa cantidad: lo que falta queda **Pendiente** para una próxima recepción.
5. **Tocá Registrar recepción.** El stock sube en ese depósito con el costo de la orden.

La orden muestra cuánto se recibió con una barra de avance en la columna **Estado**. En el detalle, la sección **Recepciones** lista cada entrega con su remito.

> [!NOTA]
> Cuando recibís mercadería antes de que llegue la factura, Oplex la registra en la cuenta contable **Mercadería Recibida No Facturada**. Esa cuenta se cancela sola cuando cargás la factura y marcás los remitos que cubre (ver [Facturas de compra](/documentacion/compras/facturas-de-compra)).

## Pasos: devolver mercadería al proveedor

1. **Abrí la orden con Ver.** En **Recepciones**, buscá la entrega que trajo el problema.
2. **Tocá Devolver mercadería.**
3. **Escribí el Motivo** (por ejemplo "tapa en mal estado") y, en **A devolver**, la cantidad de cada artículo. No puede superar lo **Disponible**.
4. **Tocá Registrar devolución.** El stock baja y la devolución queda anotada debajo de esa recepción.

## Cancelar una orden

En el detalle, **Cancelar orden** y después **Confirmar cancelación**. Si la orden ya tiene mercadería recibida, cancelarla no revierte lo recibido: sólo impide seguir recibiendo lo pendiente.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Este proveedor no tiene email institucional ni contactos cargados - agregá uno para poder enviarla.** | No hay a quién mandarle la orden. | Usá **+ agregar email institucional** o **+ agregar contacto**. |
| El botón **Enviar por WhatsApp** está gris | El contacto elegido no tiene WhatsApp cargado. | Elegí otro contacto o cargale el WhatsApp en la ficha del proveedor. |
| No aparece **Recibir mercadería** | La orden está en **Borrador** o ya se recibió todo. | Enviala con **Enviar**. Si ya se recibió todo, no hay nada pendiente. |
| **Elegí un depósito** | No elegiste depósito en la recepción. | Elegí uno. |
| **Ingresá una cantidad mayor a cero en al menos una línea** | Todas las cantidades a recibir (o a devolver) están en 0. | Poné lo que efectivamente llegó (o lo que devolvés). |
| **Ingresá el motivo de la devolución** | El campo **Motivo** está vacío. | Escribí por qué devolvés. |
