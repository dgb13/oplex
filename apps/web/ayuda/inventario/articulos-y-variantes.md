---
title: Cargar artículos y variantes
summary: Cómo dar de alta un artículo respondiendo tres preguntas, cómo cargar insumos y artículos con variantes (talle, color), y cómo editarlos después.
minutes: 7
roles: Dueño, Administrador, Inventario
---

Todo lo que vendés, comprás o fabricás es un **artículo**. Para darlo de alta, Oplex te hace tres preguntas: qué es, cómo lo comprás o lo vendés, y los datos. Vos contás las cosas como las ves ("la bolsa de 25 kg me sale $20.000 y tengo 20") y Oplex hace las cuentas: pasa el stock a la unidad en que lo guarda, calcula el costo por gramo o por metro y propone el código.

Cuando un mismo producto viene en varias versiones (los guantes de trabajo en talle M, L y XL; la pintura látex en blanco, gris y marfil), lo cargás una sola vez con **variantes**: cada variante tiene su propio código (SKU), su precio y su stock.

## Antes de empezar

- Para crear o editar artículos necesitás el rol Dueño, Administrador o Inventario. Los demás roles ven el inventario pero no lo cambian.
- Si tenés muchos artículos en un Excel, no los cargues de a uno: usá [Importar artículos desde Excel](/documentacion/inventario/importar-articulos).
- No hace falta crear un depósito antes: si cargás stock y no tenés ninguno, Oplex crea el **Depósito principal**.

## Pasos: un producto que vendés

Ejemplo: el nivel de aluminio 60 cm, que viene en una sola versión.

1. **Andá a Inventario y tocá + Nuevo artículo.** Se abre la ventana **Nuevo artículo**.
2. **En ¿Qué es?, elegí Un producto que vendo.** Las otras opciones son **Un insumo** (lo usás para fabricar y no lo vendés, ver más abajo) y **Un servicio** (no lleva stock, por ejemplo el servicio de afilado). En un servicio, **Se cobra** te deja elegir **Por trabajo**, **Por hora** o **Por día**: con **Por hora** cargás el **Precio por hora** y en la factura o la cotización ponés la cantidad de horas (por ejemplo 2,5).
3. **En ¿Cómo lo vendés?, elegí Por unidad.** **Por kilo** es para lo que se pesa al vender. **En talles o colores** es para un artículo con variantes (ver más abajo). Esta respuesta define cómo se cuenta el stock y no se puede cambiar después.
4. **Completá Los datos.** Escribí el **Nombre**, el **Precio de venta**, el **Costo** y cuántas unidades tenés hoy en **¿Cuántas unidades tenés?**. Al lado del costo elegí si lo escribiste **sin IVA** o **con IVA**.
5. **Mirá el resumen verde.** Te muestra cómo va a quedar el stock (y el costo, en insumos) antes de guardar.
6. **Si querés, poné una foto.** Ver [Fotos](#fotos) más abajo.
7. **Tocá Guardar.** El artículo aparece en la lista de Inventario. Si vas a cargar varios parecidos, tocá **Guardar y cargar otro**: la ventana queda abierta con las dos primeras respuestas elegidas, y arriba vas a ver **✓ Cargados ahora** con los que ya guardaste.

![Alta de un producto por unidad con precio, costo y stock, y el resumen del stock](/ayuda/capturas/inventario-nuevo-articulo.jpg)

Si te falta algo, Oplex no te avisa de a uno: al tocar **Guardar** te muestra **Para guardar falta:** con todo lo que falta junto, y lo marca en rojo.

### Más datos (opcional)

Abajo de todo, **Más datos (opcional)** tiene lo que casi nunca hace falta tocar:

| Campo | Para qué sirve |
|---|---|
| **Código** | El SKU. Oplex lo **propone a partir del nombre** ("Nivel de aluminio 60 cm" → NIV-ALU) sin repetir uno que ya exista. Podés cambiarlo o escanear el código de barras. |
| **Avisame cuando quede menos de** | El stock mínimo. Cuando quede menos, el artículo aparece en las alertas de stock. En insumos se escribe en bolsas, barras o planchas. |
| **Proveedor habitual** | A quién se lo comprás normalmente. |
| **IVA** | La alícuota del artículo. Viene en IVA 21%. |
| **Categoría** | Para ordenar el inventario y el catálogo. |
| **Depósito del stock** | Aparece sólo si tenés más de un depósito. |
| **Mostrar en el catálogo y la tienda** | Viene tildado en lo que vendés y destildado en los insumos. |

> [!IMPORTANTE]
> El stock inicial se registra como una compra (entrada) y por eso necesita el costo. Si cargás stock sin costo, Oplex te lo pide en **Para guardar falta:**.

## Pasos: un insumo

Un **insumo** es algo que usás para fabricar y no vendés: la harina de una panadería, los caños de una herrería. Al elegir **Un insumo**, Oplex no te pide precio de venta y la pregunta pasa a ser **¿Cómo lo comprás?**:

| Opción | Para qué | Qué te pide | Cómo queda el stock |
|---|---|---|---|
| **En bolsa, bidón o caja** | Lo que se compra por peso o volumen: harina, aceite. | **Viene en** (bolsa, bidón, caja, paquete, balde o lata) de cuántos kg, g, L o ml, y cuánto te cuesta cada una. | En gramos o mililitros. 20 bolsas de 25 kg son 500.000 gr. |
| **Por unidad** | Lo que se cuenta: huevos, cajas, bandejas. | El costo por unidad. | En unidades. |
| **En barras** | Lo que se corta por largo: caños, perfiles. | **Largo de cada barra** en mm y cuánto te cuesta cada barra. | En milímetros; cada barra entera queda como pieza para los cortes de Producción. |
| **En planchas** | Lo que se corta por superficie: chapa, MDF. | **Ancho de la plancha** y **Largo de la plancha** en mm. | En m². |

Ejemplo: 10 caños estructurales 20x20 de 6 metros, a $28.000 cada barra. Oplex muestra en el resumen **Stock: 10 barras de 6.000 mm (60 m en total)** y **Costo: $ 4.666,67 por metro**.

![Alta de un insumo en barras con el resumen del stock en metros y el costo por metro](/ayuda/capturas/inventario-alta-insumo.jpg)

Lo que pasa con un insumo:

- En la lista de Inventario, en **Precio de venta** dice **Insumo** en lugar de un precio.
- No aparece en Caja, facturas ni cotizaciones. Si alguien lo busca para venderlo, Oplex le avisa que es un insumo y dónde se cambia.
- Sí aparece en Compras y en las recetas de Producción.
- Si después lo empezás a vender, abrí su ficha y destildá **Es un insumo (no se vende)** (ver [Editar un artículo](#editar-un-articulo)).

> [!NOTA]
> Si estás armando una receta y el insumo todavía no existe, no hace falta ir a Inventario: escribí el nombre en el buscador del insumo y tocá **+ Crear "…" como insumo**. Se abre esta misma ventana y, al guardar, el insumo queda puesto en la receta.

## Fotos

En **Foto** podés poner la foto del artículo mientras lo cargás. Es opcional.

1. **Tocá Buscar fotos de "…".** Oplex busca con el nombre que escribiste en bancos de fotos de uso libre. Para productos de almacén suele encontrar el envase real; para otros, fotos parecidas.
2. **Elegí una y tocá Usar esta.** Con las flechas ves más opciones. Debajo de cada foto figura de dónde sale; ese crédito queda guardado con la foto.
3. **Si ninguna te sirve,** tocá **Ninguna me sirve**, o **Subir la mía** para elegir una foto de tu computadora o tu celular (la recortás antes de guardar).

Si cambiás el nombre después de buscar, tocá **Buscar de nuevo**. Con **Cambiar** y **Quitar** cambiás o sacás la foto elegida.

## Pasos: un artículo con variantes

Ejemplo: guantes de trabajo en talle M, L y XL.

1. **Tocá + Nuevo artículo, elegí Un producto que vendo y después En talles o colores.** Se abre el formulario completo de artículos con **¿Este artículo tiene variantes?** ya tildado y los atributos **Talle** y **Color** preparados. Si ya habías escrito el nombre, abre directo en la pestaña **Variantes**.
2. **En Datos generales, revisá el Nombre y la Categoría.**
3. **En Precios y proveedor, cargá el costo y el % remarca.** Acá no va el precio de venta: se carga por variante. El costo y la remarca sirven para calcular el precio sugerido de cada fila.
4. **En la pestaña Variantes, cargá los valores de cada atributo.** En el campo de **Talle** escribí "M" y apretá Enter; después "L", Enter; "XL", Enter. Cada valor queda como una etiqueta; con la ✕ lo sacás. Si no usás **Color**, dejalo vacío o tocá **Quitar atributo**. Con **+ agregar atributo** sumás otro (por ejemplo, "Largo"). Oplex combina todos los valores de todos los atributos.
5. **Escribí el SKU base y tocá Generar combinaciones.** Con el **SKU base** "GUANTE", Oplex arma una tabla con una fila por combinación y un SKU sugerido para cada una (por ejemplo, GUANTE-M). Podés cambiarlo.
6. **Completá cada fila.** Revisá **SKU** y **Precio**, y si querés, **Stock inicial** y **Mínimo**. Con **Aplicar precio sugerido a todas** copiás el precio sugerido en todas las filas.
7. **Si cargaste stock, elegí el depósito en la pestaña Stock inicial.** Se usa el mismo **Depósito inicial** para todas las variantes.
8. **Tocá Crear artículo.** En la columna **Estado** de cada fila vas a ver **✓ creada**.

![Pestaña Variantes con el atributo Largo (40, 60 y 80 cm) y la tabla de combinaciones generada](/ayuda/capturas/inventario-variantes-matriz.jpg)

> [!NOTA]
> Entran hasta 30 combinaciones por artículo. Si te pasás, Oplex lo avisa y no deja generar la tabla: sacá algún atributo o valor.

> [!IMPORTANTE]
> Las variantes se arman al crear el artículo. Una vez creado, podés corregir el SKU y el precio de cada variante, pero no agregarle variantes nuevas. Si te falta un color o un talle, creá un artículo aparte.

## El formulario completo

Abajo a la izquierda de **Nuevo artículo** está **¿Talles, colores o adjuntos? Formulario completo**. Abre el formulario de siempre, con pestañas (**Datos generales**, **Precios y proveedor**, **Variante**, **Stock inicial** y **Adjuntos**). Lo que ya habías cargado pasa solo: nombre, precio, costo, stock, código, depósito y, si la subiste vos, la foto. Usalo cuando necesitás:

- Subir un **Folleto** en PDF o un **Adjunto** en ZIP.
- Cargar el **% remarca** o la **Merma mínima aprovechable** de las barras.
- Marcar **Se fabrica (tiene receta)** para elegirlo en Recetas antes de cargarle la primera receta.

La foto que elegiste de las sugeridas no pasa al formulario completo: subila de nuevo en **Adjuntos**.

## Cómo se guarda el stock

Lo que elegís en la segunda pregunta define el **tipo de medición** del artículo. Queda fijo una vez creado.

| Respuesta | Tipo de medición | El stock se guarda en |
|---|---|---|
| **Por unidad** | Unidad | Unidades |
| **Por kilo** | Unidad, en kilos | Kilos |
| **En bolsa, bidón o caja** | Continuo (peso/volumen) | Gramos o mililitros |
| **En barras** | Lineal (por metro) | Milímetros, con cada barra y cada recorte como pieza. Ver [Piezas y recortes](/documentacion/produccion/piezas-y-recortes). |
| **En planchas** | Superficie (por m²) | Metros cuadrados |

## Editar un artículo

1. **En la lista de Inventario, tocá el lápiz que está debajo del nombre del artículo.** También está arriba a la derecha de cada tarjeta en la vista de catálogo.
2. **Cambiá lo que necesites en las pestañas.** La ficha tiene **Datos generales**, **Precios e IVA**, **Variantes**, **Stock**, **Fotos**, **Tienda online** y **Adjuntos**. En **Datos generales** están **Es servicio**, **Se fabrica** y **Es un insumo (no se vende)**.
3. **Tocá Guardar cambios.** Mientras haya algo sin guardar vas a ver "● Tenés cambios sin guardar". Si cerrás la ventana antes, Oplex te pregunta si querés **Seguir editando** o **Cerrar sin guardar**.

Las fotos y los adjuntos se guardan en el momento, sin necesidad de **Guardar cambios**. En la pestaña **Fotos** podés subir hasta 8 fotos; con la estrella elegís la **Principal**, que es la que se ve en el catálogo, en la Caja y en la tienda.

Hay cosas que la ficha no deja cambiar a propósito:

- **El costo**: sale de las compras, la producción y los movimientos de stock.
- **El stock actual**: se mueve con compras, ventas, producción o un **+ Nuevo movimiento**.
- **El tipo de medición**.
- **La unidad de medida**, si el artículo ya tiene movimientos, recetas, comprobantes o stock mínimo. Oplex te dice el motivo debajo del campo.

## Desactivar un artículo

Si dejaste de trabajar un artículo, no lo borres: desactivalo. Abrí la ficha y tocá **Desactivar artículo** (abajo a la izquierda). Deja de aparecer en la lista, pero su historia queda guardada. Para verlo de nuevo, tildá **Mostrar inactivos** en Inventario; desde su ficha lo volvés a activar con **Activar artículo**.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Para guardar falta:** y una lista | Faltan datos para guardar. | Completá lo que dice la lista; los campos marcados en rojo son los que faltan. |
| el costo, para valorizar el stock que cargaste | Cargaste stock sin costo. | Escribí el costo, o borrá la cantidad si no querés cargar stock todavía. |
| las barras, en números enteros | Escribiste barras con decimales. | Las barras se cargan enteras. Los recortes entran después, desde Producción. |
| El artículo quedó creado, pero falló un paso: ... Tocá Guardar de nuevo para reintentarlo. | Se guardó el artículo pero no el stock o la foto (por ejemplo, se cortó internet). | Tocá **Guardar** otra vez: Oplex completa lo que faltó sin duplicar el artículo. |
| Ya existe una variante con el SKU "GUANTE-M" | El SKU se repite: tiene que ser único en toda la empresa. | Cambiá el SKU y volvé a guardar. |
| Algunas variantes no se pudieron crear - mirá el detalle marcado en cada fila de la grilla... | Algunas filas fallaron (casi siempre por SKU repetido). | Corregí las filas marcadas con ⚠ y tocá **Crear artículo** otra vez. Las que ya se crearon no se duplican. |
| No se puede cambiar la unidad de medida: ya tiene movimientos de stock | El artículo ya se usó. | Si la unidad está mal, desactivá el artículo y creá uno nuevo con la unidad correcta. |
| No se puede desactivar: es el producto de una orden de producción en curso | Hay una orden de producción abierta con ese artículo. | Terminá o cancelá la orden y probá de nuevo. |
