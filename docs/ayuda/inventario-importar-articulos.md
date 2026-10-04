# Cómo importar artículos desde Excel

En **Inventario → Importar artículos** podés cargar o actualizar tu lista de artículos de una sola vez, con el archivo que ya tenés (Excel o CSV), tal como lo exportó tu sistema anterior o tu proveedor. No hace falta acomodarlo a una planilla fija. Entran hasta 20.000 artículos por archivo.

Son cuatro pasos:

1. **Archivo**: subís el archivo. Oplex encuentra solo la hoja y la fila de los encabezados, aunque arriba haya un título. Si arrancás de cero, con **Descargar planilla modelo** te bajás una planilla con un ejemplo y la explicación de cada columna.
2. **Columnas**: Oplex reconoce cada columna por su encabezado ("Cód.", "Descripción", "P. Venta", "Rubro", etc.) y te muestra los primeros valores para que confirmes. Podés cambiar a qué campo va cada una o marcarla como **No importar**. Son obligatorios el **código**, el **nombre** y el **precio de venta**. En este paso también elegís:
   - **Si el código ya existe en Oplex**: **Actualizarlo** (cambia precio, nombre, categoría y marca; el stock no se toca) o **Dejarlo como está**.
   - **Los precios de venta del archivo**: **Son sin IVA** o **Incluyen IVA** (si incluyen IVA, Oplex guarda el precio neto según la alícuota de cada artículo).
   - **Depósito para el stock**, si el archivo trae existencia. Si tu empresa todavía no tiene depósitos, se crea uno llamado "Depósito principal".
3. **Revisión**: ves cuántos artículos son nuevos, cuántos se actualizan (con el precio viejo y el nuevo) y cuáles tienen errores y por qué. Si Oplex no reconoce algún valor de IVA o de unidad (por ejemplo "ROLLO"), elegís a qué corresponde y se aplica a todas las filas. También avisa qué categorías y proveedores nuevos se van a crear. Las filas con error se pueden bajar con **Descargar errores en Excel**, corregir y volver a subir.
4. **Importar**: la importación corre en segundo plano y muestra el avance. Al terminar ves cuántos artículos se crearon y actualizaron.

## Actualizar precios

Con **Exportar mis artículos** te bajás tu lista actual en Excel. Cambiás los precios ahí y volvés a subir el archivo: los códigos que ya existen se actualizan y el stock no se modifica.

## Stock inicial

La existencia del archivo se carga sólo en los artículos **nuevos**, y para eso hace falta también el **costo**. En los artículos que ya existían, el stock no se cambia: para eso están los movimientos de stock y las compras.

## Barras y planchas

- **Barras** (caños, perfiles, tubos, cablecanal): si el archivo tiene una columna de **largo comercial**, que es el largo con el que te vende el proveedor, el artículo queda como barra, con piezas y recortes para Producción. Cada artículo usa su propio largo: en el mismo archivo puede haber acero de 6 m, plásticos de 2 m y material eléctrico de 1 m. El precio queda **por barra entera**. Si tu archivo trae el precio, el costo y la existencia **por metro**, elegís "Por metro" y Oplex los pasa a barra (precio × largo; la existencia en metros se divide por el largo y tiene que dar barras enteras).
- **Planchas** (chapas, placas): con columnas de **ancho** y **largo** de la plancha.
- Oplex te sugiere si los largos y anchos están en metros, centímetros o milímetros según los valores; revisalo antes de seguir.
- En un artículo que ya existía, el largo o las medidas no se cambian al actualizar.

## Fotos

Si el archivo tiene una columna con el **link de la foto**, Oplex la descarga y la pone en el artículo. Sirven links de Google Drive y Dropbox compartidos públicamente. Tienen que ser imágenes JPG, PNG o WEBP de hasta 3 MB. Sólo se pone la foto si el artículo todavía no tenía una. Las fotos que no se pudieron bajar se informan al final.

## Categorías sugeridas con IA

Si hay artículos nuevos sin categoría, en la revisión aparece **Sugerir categorías con IA**: la IA propone una categoría según el nombre de cada artículo, reusando las que ya tenés. Ves cuántos artículos van a cada una y cuáles serían nuevas, y elegís **Usar estas categorías** o **Descartar**. Nada se guarda hasta que importás, y en la tabla las sugeridas aparecen marcadas con "IA". Está incluido en todos los planes.

Una importación no se puede deshacer automáticamente: revisá bien el paso de Revisión antes de importar.
