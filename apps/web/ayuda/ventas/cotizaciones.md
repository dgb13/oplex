---
title: Cotizaciones
summary: Armá un presupuesto con bonificaciones y condiciones, mandalo por email o WhatsApp y convertilo en factura cuando el cliente lo acepta.
minutes: 6
roles: Dueño, Administrador, Ventas
---

Una cotización (presupuesto) es lo que le mandás al cliente antes de venderle. Se arma igual que una factura, sale en PDF con tu logo y, cuando el cliente la acepta, la convertís en factura en un clic, sin volver a cargar nada.

## Antes de empezar

- Tener cargada la condición frente al IVA de tu empresa en [Datos de la empresa](/documentacion/arca/datos-de-la-empresa). Sin ella no se puede generar el PDF, porque de eso depende si el IVA va discriminado.
- Conviene completar antes [Tu empresa en los documentos](/documentacion/primeros-pasos/tu-empresa-en-los-documentos): logo, color, datos de contacto y las condiciones que se cargan solas en cada cotización.

## Armar la cotización

1. **Abrí Cotizaciones.** Andá a **Ventas › Cotizaciones** y tocá **Nueva cotización**.
2. **Elegí el cliente.** Escribí en **Buscá el cliente por nombre o CUIT** y elegilo. Si no existe, tocá **+ Nuevo cliente**.
3. **Agregá los artículos.** En **Agregar artículo: buscá por nombre o SKU (o escaneá el código)** escribí y tocá `Enter`. Tip: escribí `3*taladro` para agregar 3 de una vez. Con el lápiz (**Agregar detalle**) de cada línea escribís un detalle que sale en el PDF; al convertir la cotización en factura, el detalle pasa a la factura.
4. **Ajustá cada línea.** Cambiá cantidad y precio si hace falta. En **Bonif. %** poné el descuento de esa línea. Con el botón **Agregar detalle** de la línea podés sumar un texto que sale en el PDF (**Detalle de la línea (aparece en el PDF)**).
5. **Elegí si los precios llevan IVA.** El interruptor **Precios con IVA incluido** indica cómo escribiste los precios. Si sos Monotributo, ves **Sin IVA (Factura C): el precio es el final**.
6. **Completá el costado.** **Moneda** (por ejemplo ARS $ o USD), **Válida hasta** (botones de **7 días**, **15 días**, **30 días** o **Sin vencimiento**) y **Dirigida a** (un contacto del cliente).
7. **Revisá las condiciones.** En **Condiciones** están **Forma de pago**, **Plazo de entrega**, **Lugar de entrega** y **Garantía**, ya cargadas con tus valores por defecto. En **Notas para el cliente** escribí lo que quieras que figure como observación.
8. **Tocá Crear cotización** (o `Ctrl` + `Enter`). Queda en estado **Borrador**.

![Nueva cotización con artículos, bonificación y condiciones](/ayuda/capturas/ventas-cotizacion-nueva.jpg)

## Mandarla al cliente

Tocá la cotización en la lista para abrir su detalle.

- **Descargar PDF:** elegí el estilo (**Moderno**, **Compacto**, **Tradicional**, **Natural** o **Letras grandes**) y tocá **Descargar PDF**.
- **Enviar por email:** le manda la cotización con el PDF adjunto al email del cliente. El botón está apagado si el cliente no tiene email cargado.
- **Enviar...:** abre **Enviar por WhatsApp**. Escribí el **Número de WhatsApp**, tocá **Abrir WhatsApp**, adjuntá el PDF a mano en WhatsApp y volvé a tocar **Confirmar enviado**.

Al enviarla, pasa a **Enviada**. Si se pasa la fecha de **Válida hasta** sin respuesta, se ve como **Vencida**.

> [!NOTA]
> Mientras está en **Borrador** la podés cambiar con **Editar**. Una vez enviada ya no se edita: si cambió algo, armá una nueva.

## Cuando el cliente responde

En el detalle de una cotización **Enviada**:

- **Marcar aceptada** si el cliente dijo que sí.
- **Marcar rechazada** si dijo que no.
- **Cancelar** si la querés dar de baja.

## Convertir a factura

1. **Abrí una cotización Aceptada** y tocá **Convertir a factura**.
2. **Revisá los datos.** Elegí **Sucursal / PV**, **Depósito** (de ahí sale el stock) y **Tipo de comprobante**. La letra se sugiere sola, igual que en Nueva factura (ver [Letra del comprobante](/documentacion/ventas/letra-del-comprobante)).
3. **Tocá Convertir a factura.** Si falta stock, Oplex te avisa y podés facturar igual: lo que falta queda en [Pendientes de entrega](/documentacion/ventas/pendientes-de-entrega).

Después de facturarla, el detalle muestra **Ya facturada** con el número de la factura.

> [!IMPORTANTE]
> Si la cotización está en dólares, la factura sale en tu moneda base convertida a la cotización vigente. Revisá que la cotización del dólar esté al día antes de convertir.

Para emitir la factura necesitás la conexión con ARCA lista: ver [Antes de empezar con ARCA](/documentacion/arca/antes-de-empezar).

## Configuración

En la pestaña **Configuración** de Cotizaciones:

- **Numeración de tus cotizaciones:** cada usuario elige su **Prefijo** (por ejemplo `DF` para Diego Ferreyra) y lleva su propia numeración. Abajo ves **Así se verá:** `DF-000001`.
- **Estilo preferido de PDF:** el estilo que se usa por defecto al descargar o mandar por email.

Tocá **Guardar cambios**.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Cargá tu condición frente al IVA para generar cotizaciones: de eso depende si el PDF discrimina el IVA.** | Falta la condición de tu empresa. | Tocá **Ir a Datos de la empresa** y cargala. |
| **Hay líneas sin precio: cargalo en la línea marcada.** | Algún artículo no tiene precio de venta. | Escribí el precio en esa línea. |
| **Elegí a quién le cotizás.** | No elegiste cliente. | Buscalo arriba o crealo con **+ Nuevo cliente**. |
| El botón **Enviar por email** no se puede tocar. | El cliente no tiene email. | Cargale el email en su ficha (**Ventas › Clientes**). |
