---
title: Recetas de producción
summary: Cómo cargar qué insumos y en qué cantidad lleva cada producto que fabricás, y cómo se versionan los cambios.
minutes: 6
roles: Dueño, Administrador, Inventario
---

La receta dice qué insumos lleva cada producto que fabricás y en qué cantidad. Con la receta cargada, Oplex calcula cuántas unidades podés producir con el stock que tenés, reserva los insumos para cada orden y saca el costo del producto terminado. Por ejemplo, en Los Andes arman un "Soporte de estante reforzado" con caño estructural, tornillos autoperforantes y pintura.

## Antes de empezar

- El módulo de **Producción** depende del plan: viene incluido desde el plan **Bronze** y no está en **Basic Gratis**. Si tu plan no lo tiene, el menú **Producción** no aparece y, si entrás a la pantalla, ves el aviso "Tu plan actual (Basic Gratis) no incluye el módulo de Producción." con el link **Mejorar plan →**.
- Para crear o cambiar recetas necesitás el rol Dueño, Administrador o Inventario. Con **Solo lectura** podés verlas, pero no guardarlas.
- Los insumos tienen que existir como artículos en **Inventario**. Si un insumo es una barra (caños, perfiles), creálo con **Tipo de medición** **Lineal (por metro)** y su **Largo comercial (mm)**. Mirá [Piezas y recortes](/documentacion/produccion/piezas-y-recortes).

## Pasos

1. Andá a **Producción › Recetas**. Se abre la pantalla **Recetas de producción**.
2. Elegí el producto en **Producto a fabricar**. Sólo aparecen los artículos marcados como fabricables. Si el producto todavía no existe, tocá **Nuevo producto fabricable** (ver más abajo).
3. Escribí el **Nombre de la receta**. Si el producto ya tenía receta, el formulario se completa con la receta activa para que la uses de punto de partida.
4. Cargá cada insumo en una línea. Buscalo en **Insumo...** y completá **Cantidad**: es lo que lleva **una** unidad del producto, en la unidad de stock del insumo (unidades, gramos, mililitros o milímetros).
5. Si el insumo se corta de una barra, completá también **Largo (mm)** (el largo de cada corte) y **Cortes** (cuántos cortes de ese largo lleva una unidad). Los campos de largo, ancho y cortes sólo hacen falta para artículos por metro o por pieza.
6. Si se pierde material en el proceso, completá **Merma %**. Oplex suma ese porcentaje a lo que reserva para cada orden.
7. Tocá **Agregar insumo** para sumar otra línea, o el tachito para quitar una.
8. Tocá **Crear receta** (o **Guardar como nueva versión** si el producto ya tenía una).

![Receta del Kit de fijación con sus dos insumos cargados](/ayuda/capturas/produccion-receta.jpg)

> [!IMPORTANTE]
> En los insumos por barra, la **Cantidad** son los milímetros totales que lleva una unidad. Si el soporte lleva 2 cortes de 450 mm de caño, cargá **Largo (mm)** 450, **Cortes** 2 y **Cantidad** 900. Oplex usa la cantidad para reservar y el largo y los cortes para planificar dónde se hace cada corte, así que tienen que coincidir.

## Crear un producto fabricable desde Recetas

Si el producto no existe todavía, no hace falta ir a Inventario:

1. Tocá **Nuevo producto fabricable**. Se abre una ventana en dos pasos: **El producto** y **Lista de materiales**.
2. Completá **Nombre del producto**, **Código (SKU)** (Oplex te sugiere uno a partir del nombre), **Categoría** y **Se vende por** (**Unidad** o **Kilo**). La **Foto** y el **Precio de venta** son opcionales: el precio lo podés cargar después, cuando veas el costo.
3. Tocá **Crear y armar receta →**. Volvés a la receta con el aviso **Paso 2 de 2 - lista de materiales.** Cargá los insumos y guardá.

> [!NOTA]
> Un producto creado así queda marcado como fabricable, sin stock inicial (el stock entra al completar cada orden) y con el costo calculado desde la receta. Si preferís crearlo desde Inventario, tildá **Se fabrica (tiene receta)** en la ficha del artículo.

## Versiones de la receta

Cada vez que guardás cambios, Oplex no pisa la receta anterior: crea una versión nueva (v1, v2, v3…) y la marca como **Receta activa**. Las órdenes que ya estaban creadas siguen usando la versión con la que nacieron. En el [Historial](/documentacion/produccion/historial-y-costos) ves qué versión usó cada orden.

## Documentación de la receta

Una vez guardada la receta, aparece el cuadro **Documentación**. Ahí podés tocar **Subir archivo** para adjuntar planos u hojas de corte en PDF o ZIP de hasta 20 MB. Los archivos quedan asociados a esa versión y se ven en cada orden de producción, en **Documentos de la receta**. Si guardás una versión nueva, los adjuntos no se copian: subilos de nuevo si siguen valiendo.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
| --- | --- | --- |
| Ingresá un nombre para la receta | El nombre está vacío. | Escribí un nombre en **Nombre de la receta**. |
| Agregá al menos un insumo con cantidad | Ninguna línea tiene insumo y cantidad a la vez. | Completá al menos un insumo con su **Cantidad**. |
| Una receta no puede usar su propio producto como insumo | Elegiste el mismo producto como insumo. | Quitá esa línea. |
| Sólo se permiten archivos PDF o ZIP | Intentaste adjuntar otro tipo de archivo. | Guardalo como PDF o comprimilo en ZIP. |
| No encuentro el producto en **Producto a fabricar** | El artículo no está marcado como fabricable. | Tildá **Se fabrica (tiene receta)** en Inventario o creálo con **Nuevo producto fabricable**. |
