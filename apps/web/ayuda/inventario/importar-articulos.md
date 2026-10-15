---
title: Importar artículos desde Excel
summary: Cómo cargar o actualizar toda tu lista de artículos de una vez desde un Excel o CSV.
minutes: 7
roles: Dueño, Administrador, Inventario
---

Si ya tenés tu lista de artículos en un Excel (la que exportaste de tu sistema anterior o la lista de precios de un proveedor), la subís a Oplex de una sola vez. No hace falta acomodarla a una planilla fija: Oplex reconoce las columnas solo. También sirve para actualizar precios de muchos artículos juntos.

## Antes de empezar

- Necesitás el rol Dueño, Administrador o Inventario.
- El archivo tiene que ser Excel (.xlsx) o CSV, con hasta 20.000 artículos. Si es un Excel viejo (.xls), abrilo en Excel y guardalo como .xlsx.
- Tienen que estar, sí o sí, el **código**, el **nombre** y el **precio de venta** de cada artículo.
- Si vas a cargar existencia, también hace falta el **costo**.

> [!IMPORTANTE]
> Una importación no se puede deshacer automáticamente. Revisá bien el paso **Revisión** antes de importar.

## Pasos

La pantalla está en **Inventario › Importar artículos** y tiene cuatro pasos: **Archivo**, **Columnas**, **Revisión** e **Importar**.

### 1. Archivo

1. **Arrastrá el archivo al recuadro o hacé clic para elegirlo.** Oplex encuentra solo la hoja y la fila de los encabezados, aunque arriba haya un título. Te muestra en qué fila están los encabezados, cuántas filas con artículos hay y cuántas columnas.
2. **Tocá Continuar.**

Si arrancás de cero, tocá **Descargar planilla modelo**: te bajás una planilla con un ejemplo y una hoja "Cómo completarla" con la explicación de cada columna.

### 2. Columnas

1. **Revisá a qué campo va cada columna.** En la tabla ves la **Columna en tu archivo**, los **Primeros valores** y a dónde **Va a Oplex como**. Oplex reconoce encabezados como "Cód.", "Descripción", "P. Venta" o "Rubro". Si alguna está mal, cambiala; si no la querés, elegí **No importar**.
2. **Elegí qué pasa si el código ya existe en Oplex.** **Actualizarlo** cambia precio, nombre, categoría y marca (el stock no se toca). **Dejarlo como está** lo saltea.
3. **Indicá cómo vienen los precios de venta del archivo.** **Son sin IVA** o **Incluyen IVA**. Si incluyen IVA, Oplex guarda el precio neto según la alícuota de cada artículo. Si sos Monotributo o Exento, no te lo pregunta: los precios se guardan tal cual, porque son finales.
4. **Si el archivo trae costos, indicá si Son sin IVA o Incluyen IVA.**
5. **Si el archivo trae existencia, elegí el Depósito para el stock.** Si todavía no tenés depósitos, Oplex crea uno llamado "Depósito principal".
6. **Tocá Continuar.**

Los campos que podés asignar son: **Código (SKU)**, **Nombre**, **Precio de venta**, **Costo**, **Categoría**, **Marca**, **IVA**, **Stock inicial**, **Proveedor**, **Unidad de medida**, **Descripción larga**, **Color**, **Talle**, **Foto (link)**, **Largo comercial (barra)**, **Ancho de la plancha** y **Largo de la plancha**.

> [!NOTA]
> Las categorías y los proveedores que no existan se crean solos. Si varias filas tienen el mismo nombre con distinto **Color** o **Talle**, quedan como variantes de un mismo artículo (por ejemplo, los guantes de trabajo en talles M, L y XL).

### 3. Revisión

1. **Mirá el resumen.** Tres recuadros te dicen cuántos son **artículos nuevos**, cuántos **ya existen y se actualizan** y cuántos están **con errores, no se importan**. Tocá cada uno para filtrar la tabla. En los que se actualizan ves el precio viejo y el nuevo.
2. **Confirmá los valores que Oplex no reconoció.** Si aparece **Valores a confirmar**, elegí a qué corresponde cada uno (por ejemplo, la unidad "ROLLO" o un IVA escrito raro). Lo que elijas se aplica a todas las filas con ese valor.
3. **Si querés, pedile categorías a la IA.** Si hay artículos nuevos sin categoría, tocá **✨ Sugerir categorías con IA**. Ver más abajo.
4. **Si hay errores, bajalos.** Con **Descargar errores en Excel** te llevás las filas con problemas y el motivo de cada una. Corregilas y subilas después en otra importación.
5. **Tocá Importar N artículos.**

### 4. Importar

La importación corre en segundo plano y te muestra el avance. Al terminar ves cuántos artículos se crearon, cuántos se actualizaron y cuántos quedaron sin importar. Tocá **Ver artículos** para ir a Inventario.

## Actualizar precios de muchos artículos

1. **En el paso Archivo, tocá Exportar mis artículos.** Te bajás tu lista actual en Excel.
2. **Cambiá los precios en el Excel.** No cambies los códigos.
3. **Subí el archivo de nuevo y elegí Actualizarlo.** Los códigos que ya existen se actualizan; el stock no se modifica.

## Stock inicial

La existencia del archivo se carga sólo en los artículos **nuevos**, y necesita el **costo** en la misma fila. En los artículos que ya existían, el stock no cambia: para eso están los [movimientos de stock](/documentacion/inventario/depositos-y-movimientos) y las compras.

## Barras y planchas

- **Barras** (caños, perfiles, tubos): si el archivo tiene la columna **Largo comercial (barra)**, el artículo queda como barra, con piezas y recortes para Producción. Cada artículo usa su propio largo. El precio queda por barra entera. Si tu archivo trae el precio, el costo y la existencia por metro, elegí **Por metro** en **En las barras, el precio y la existencia son**, y Oplex los pasa a barra (precio × largo; la existencia en metros ÷ largo, que tiene que dar barras enteras).
- **Planchas** (chapas, placas): con las columnas **Ancho de la plancha** y **Largo de la plancha**.
- En **Los largos y anchos del archivo están en** elegís **Metros**, **Centímetros** o **Milímetros**. Oplex te sugiere uno según los valores: revisalo.
- En un artículo que ya existía, el largo y las medidas no se cambian al actualizar.

## Fotos

Si el archivo tiene una columna con el link de la foto, Oplex la descarga y la pone en el artículo. Sirven links de Google Drive y Dropbox compartidos públicamente. Tienen que ser JPG, PNG o WEBP de hasta 3 MB. La foto se pone sólo si el artículo todavía no tenía una. Las que no se pudieron bajar se informan al final; el artículo se importa igual, sin foto.

## Categorías sugeridas con IA

Si hay artículos nuevos sin categoría, en la revisión aparece **✨ Sugerir categorías con IA**. La IA propone una categoría según el nombre de cada artículo y reusa las que ya tenés. Ves cuántos artículos van a cada categoría y cuáles serían nuevas (marcadas "nueva"). Elegí **Usar estas categorías** o **Descartar**. Nada se guarda hasta que importás, y en la tabla las sugeridas aparecen marcadas con "IA". Si te arrepentís, tocá **Quitar sugerencias**.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| Ese archivo es de Excel viejo (.xls). Abrilo en Excel y guardalo como .xlsx, o como CSV. | El formato .xls no se lee. | Guardalo como .xlsx o CSV y subilo de nuevo. |
| El archivo tiene más de 20.000 filas: dividilo en partes | Te pasaste del máximo. | Partí el archivo en dos o más y subilos de a uno. |
| No se pudo leer el archivo de Excel. ¿Está dañado o protegido con contraseña? | El archivo está roto o tiene contraseña. | Sacale la contraseña o exportalo de nuevo. |
| Falta indicar qué columna es ... | No asignaste una columna obligatoria. | En **Columnas**, asigná **Código (SKU)**, **Nombre** y **Precio de venta**. |
| Falta el precio de venta | La fila no tiene precio. | Completalo en el Excel. |
| Para cargar el stock inicial falta el costo | La fila tiene existencia pero no costo. | Agregá el costo o sacá la existencia. |
| Código repetido en el archivo (también en la fila 12) | Dos filas tienen el mismo código. | Dejá una sola o cambiá uno de los códigos. |
| Unidad "ROLLO" no reconocida: elegí a qué unidad corresponde | Oplex no conoce esa unidad. | Elegila en **Valores a confirmar**. |
| La existencia (70 m) no da barras enteras de 6 m | Con precio por metro, la existencia tiene que dividirse justo por el largo. | Corregí la existencia o el largo. |
| No se pudieron sugerir categorías en este momento. Probá de nuevo en un rato. | La IA no respondió. | Probá más tarde, o importá sin categorías. |
| La importación se cortó. Lo importado hasta ahora quedó guardado; volvé a subir el archivo para completar el resto. | Se interrumpió a mitad de camino. | Subí el mismo archivo con **Dejarlo como está**: lo ya importado se saltea. |
