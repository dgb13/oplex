---
title: Cargar artículos y variantes
summary: Cómo dar de alta un artículo, con o sin variantes (color, talle, medida), y cómo editarlo después.
minutes: 6
roles: Dueño, Administrador, Inventario
---

Todo lo que vendés, comprás o fabricás es un **artículo**. Cuando un mismo producto viene en varias versiones (la pintura látex 20 L en blanco, gris y marfil; los guantes de trabajo en talle M, L y XL), lo cargás una sola vez y le armás **variantes**: cada variante tiene su propio código (SKU), su precio y su stock. Así no tenés que crear diez artículos casi iguales.

## Antes de empezar

- Para crear o editar artículos necesitás el rol Dueño, Administrador o Inventario. Los demás roles ven el inventario pero no lo cambian.
- Si vas a cargar stock inicial, tené al menos un depósito. Ver [Depósitos y movimientos de stock](/documentacion/inventario/depositos-y-movimientos).
- Si tenés muchos artículos en un Excel, no los cargues de a uno: usá [Importar artículos desde Excel](/documentacion/inventario/importar-articulos).

## Pasos: un artículo simple

Ejemplo: la cinta métrica 5 m, que viene en una sola versión.

1. **Andá a Inventario y tocá + Nuevo artículo.** Se abre la ventana **Nuevo artículo** con varias pestañas arriba.
2. **Completá la pestaña Datos generales.** Escribí el **Nombre** ("Cinta métrica 5 m") y elegí la **Categoría**. Si la categoría no existe, tocá **+ nueva categoría**, escribila y tocá **Crear**. La **Descripción** es opcional.
3. **Revisá los interruptores de la misma pestaña.**
   - **Es servicio**: tildalo si no lleva stock ni depósito (por ejemplo, el servicio de afilado).
   - **Publicado**: el artículo se ve en el catálogo y, si tenés tienda online, puede aparecer en ella. Viene tildado.
   - **¿Este artículo tiene variantes?**: dejalo sin tildar para un artículo simple.
   - **Se fabrica (tiene receta)**: sólo si lo producís vos con el módulo Producción.
4. **Elegí el Tipo de medición.** Para casi todo es **Unidad**. Las otras opciones son **Continuo (peso/volumen)**, **Lineal (por metro)** para barras y caños, y **Superficie (por m²)** para chapas y placas. Ver la tabla de abajo.
5. **Completá la pestaña Precios y proveedor.** Elegí el **IVA del artículo** (viene en IVA 21%), el **Proveedor preferido** si tenés uno, el **Costo inicial**, el **% remarca** y el **Precio de venta**. Si cargaste costo y remarca, aparece el precio sugerido con el botón **Usar sugerido**. El detalle está en [Precios, costos e IVA](/documentacion/inventario/precios-costos-iva).
6. **Completá la pestaña Variante.** Escribí el **SKU** (el código del artículo; podés escanear el código de barras directamente en ese campo) y elegí la **Unidad de medida**.
7. **Si querés, cargá el stock en la pestaña Stock inicial.** Elegí el **Depósito inicial**, la cantidad en **Stock inicial** y, si querés que Oplex te avise cuando quede poco, el **Stock mínimo para alertas**.
8. **Si querés, agregá archivos en la pestaña Adjuntos.** Podés subir la **Imagen principal** (JPG, PNG o WebP; la recortás antes de guardar), un **Folleto** en PDF y un **Adjunto** en ZIP.
9. **Tocá Crear artículo.** El artículo aparece en la lista de Inventario.

![Ventana Nuevo artículo con la pestaña Datos generales](/ayuda/capturas/inventario-nuevo-articulo.jpg)

> [!IMPORTANTE]
> El stock inicial se registra como una compra (entrada) y por eso necesita el **Costo inicial** cargado en **Precios y proveedor**. Si no lo cargás, Oplex no te deja crear el artículo con stock.

## Pasos: un artículo con variantes

Ejemplo: pintura látex 20 L en tres colores.

1. **Tocá + Nuevo artículo y completá Datos generales** como en el caso anterior, con el nombre "Pintura látex 20 L".
2. **Tildá ¿Este artículo tiene variantes?** La pestaña **Variante** pasa a llamarse **Variantes**.
3. **En Precios y proveedor, cargá el costo y el % remarca.** Acá no va el precio de venta: se carga por variante. El costo y la remarca sirven para calcular el precio sugerido de cada fila.
4. **Andá a la pestaña Variantes y tocá + agregar atributo.** En **Nombre del atributo** escribí "Color".
5. **Cargá los valores del atributo.** En el campo de abajo escribí "Blanco" y apretá Enter; después "Gris", Enter; "Marfil", Enter. Cada valor queda como una etiqueta; con la ✕ lo sacás.
6. **Si hace falta, agregá otro atributo.** Por ejemplo, para los guantes de trabajo un atributo "Talle" con M, L y XL. Oplex combina todos los valores de todos los atributos.
7. **Escribí el SKU base y tocá Generar combinaciones.** Con el **SKU base** "LATEX20", Oplex arma una tabla con una fila por combinación y un SKU sugerido para cada una (por ejemplo, LATEX20-BLANCO). Podés cambiarlo.
8. **Completá cada fila.** Revisá **SKU** y **Precio**, y si querés, **Stock inicial** y **Mínimo**. Con **Aplicar precio sugerido a todas** copiás el precio sugerido en todas las filas.
9. **Si cargaste stock, elegí el depósito en la pestaña Stock inicial.** Se usa el mismo **Depósito inicial** para todas las variantes.
10. **Tocá Crear artículo.** En la columna **Estado** de cada fila vas a ver **✓ creada**.

![Pestaña Variantes con el atributo Largo (40, 60 y 80 cm) y la tabla de combinaciones generada](/ayuda/capturas/inventario-variantes-matriz.jpg)

> [!NOTA]
> Entran hasta 30 combinaciones por artículo. Si te pasás, Oplex lo avisa y no deja generar la tabla: sacá algún atributo o valor.

> [!IMPORTANTE]
> Las variantes se arman al crear el artículo. Una vez creado, podés corregir el SKU y el precio de cada variante, pero no agregarle variantes nuevas. Si te falta un color o un talle, creá un artículo aparte.

## Tipos de medición

| Tipo | Para qué sirve | Qué te pide |
|---|---|---|
| **Unidad** | Lo que se cuenta de a uno: taladros, cajas de tornillos, cintas métricas. | Nada más. |
| **Continuo (peso/volumen)** | Lo que se compra en una presentación y se consume por gramo o mililitro. | **Tamaño de la presentación de compra** y **Unidad base de stock** (gr o ml). |
| **Lineal (por metro)** | Barras, caños, perfiles: Oplex sigue cada barra y cada recorte. | **Largo comercial (mm)** y, opcional, **Merma mínima aprovechable (mm)**. |
| **Superficie (por m²)** | Chapas y placas. | **Ancho de plancha estándar (mm)** y **Largo de plancha estándar (mm)**. |

> [!IMPORTANTE]
> El tipo de medición queda fijo una vez creado el artículo. Elegilo bien antes de tocar **Crear artículo**.

Los artículos **Lineal (por metro)** no tienen pestaña **Stock inicial**: su stock entra desde **Compras › Recibir mercadería**, porque Oplex necesita saber el largo de cada barra. Ver [Piezas y recortes](/documentacion/produccion/piezas-y-recortes).

## Editar un artículo

1. **En la lista de Inventario, tocá el lápiz que está debajo del nombre del artículo.** También está arriba a la derecha de cada tarjeta en la vista de catálogo.
2. **Cambiá lo que necesites en las pestañas.** La ficha tiene **Datos generales**, **Precios e IVA**, **Variantes**, **Stock**, **Fotos**, **Tienda online** y **Adjuntos**.
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
| Ya existe una variante con el SKU "LATEX20-BLANCO" | El SKU se repite: tiene que ser único en toda la empresa. | Cambiá el SKU de esa fila y volvé a tocar **Crear artículo**. |
| Algunas variantes no se pudieron crear - mirá el detalle marcado en cada fila de la grilla... | Algunas filas fallaron (casi siempre por SKU repetido). | Corregí las filas marcadas con ⚠ y tocá **Crear artículo** otra vez. Las que ya se crearon no se duplican. |
| Ingresá el costo inicial para poder registrar el stock inicial | Cargaste stock sin costo. | Completá **Costo inicial** en **Precios y proveedor**. |
| Elegí un depósito para el stock inicial o el mínimo | Cargaste stock o mínimo sin depósito. | Elegí el **Depósito inicial**. Si no tenés ninguno, tocá **Crear "Depósito principal"**. |
| No se puede cambiar la unidad de medida: ya tiene movimientos de stock | El artículo ya se usó. | Si la unidad está mal, desactivá el artículo y creá uno nuevo con la unidad correcta. |
| No se puede desactivar: es el producto de una orden de producción en curso | Hay una orden de producción abierta con ese artículo. | Terminá o cancelá la orden y probá de nuevo. |
