---
title: Importar datos
summary: Cómo traer a Oplex tus artículos, clientes y proveedores desde Excel o desde tu sistema anterior, y en qué orden conviene hacerlo.
minutes: 5
roles: Dueño, Administrador, Ventas, Compras, Inventario
---

Si ya tenés tus artículos, clientes o proveedores en otro sistema o en una planilla, no hace falta cargarlos uno por uno. Oplex los importa desde el archivo que ya tenés, **Excel (.xlsx) o CSV**, con tus propias columnas: no hay que acomodarlo a un formato fijo. Entran hasta **20.000 filas por archivo**.

## Qué se puede importar

| Qué | Dónde está el botón | Quién puede | Detalle |
|---|---|---|---|
| Artículos (con precios, stock inicial, barras, planchas y fotos) | **Inventario** › **Importar artículos** | Dueño, Administrador, Inventario | [Importar artículos](/documentacion/inventario/importar-articulos) |
| Proveedores | **Compras › Proveedores** › **Importar proveedores** | Dueño, Administrador, Compras, Inventario | Ver abajo |
| Clientes | **Ventas › Clientes** › **Importar clientes** | Dueño, Administrador, Ventas | Ver abajo |

## El orden recomendado

1. **Proveedores.** Así los artículos que importes después quedan asociados a su proveedor.
2. **Artículos.** Si el archivo trae una columna de proveedor que todavía no existe, Oplex lo crea sólo con el nombre. Después lo podés completar importando proveedores otra vez: Oplex lo reconoce por la razón social y llena lo que falta.
3. **Clientes.** En cualquier momento, antes de empezar a facturar.

## Cómo funciona el importador

Los tres importadores tienen los mismos cuatro pasos:

1. **Archivo.** Subís el archivo (o lo arrastrás). Oplex encuentra solo la hoja y la fila de los encabezados, aunque arriba haya un título. Si arrancás de cero, tocá **Descargar planilla modelo**: te baja una planilla con un ejemplo y la explicación de cada columna.
2. **Columnas.** Oplex reconoce cada columna por su encabezado ("Razón Social", "C.U.I.T.", "Cód.", "P. Venta", etc.). Podés cambiar a qué dato va cada una o marcarla como **No importar**. También elegís qué hacer con lo que ya existe en Oplex.
3. **Revisión.** Ves cuántos registros son nuevos, cuántos se actualizan y cuáles tienen errores y por qué. Las filas con error se bajan con **Descargar errores en Excel** para corregirlas y volver a subirlas.
4. **Importar.** Corre en segundo plano y te muestra el avance. Podés seguir usando Oplex mientras tanto.

> [!IMPORTANTE]
> Una importación no se puede deshacer automáticamente. Revisá bien el paso **Revisión** antes de tocar el botón de importar.

## Clientes y proveedores

1. **Entrá a la lista.** Andá a **Ventas › Clientes** y tocá **Importar clientes** (o **Compras › Proveedores** › **Importar proveedores**).
2. **Elegí qué son.** Arriba elegí si las empresas del archivo son **Proveedores**, **Clientes** o **Las dos cosas**, y subí el archivo.
3. **Revisá las columnas.** La única obligatoria es la **razón social**. Elegí qué hacer si la empresa ya existe:
   - **Completar lo vacío**: sólo llena los datos que faltan; lo que cargaste a mano no se toca.
   - **Reemplazar**: los datos del archivo reemplazan a los de Oplex (un dato vacío en el archivo no borra nada).
   - **Dejarla como está**: las que ya existen no se modifican.
4. **Verificá los CUIT con ARCA (opcional).** Completa la condición frente al IVA y el domicilio fiscal que falten y avisa si la razón social no coincide. Tarda unos minutos más.
5. **Revisá la condición frente al IVA.** Oplex muestra cómo interpretó lo que dice tu archivo ("RI" → Responsable Inscripto, "Monot." → Monotributo, "CF" → Consumidor Final). Si alguna no la reconoce, elegí a cuál corresponde. Es importante: decide si a ese cliente le hacés Factura A o B.
6. **Importá.** Tocá **Importar … empresas**.

Oplex reconoce una empresa que ya existe por su **CUIT** (con o sin guiones) y, si no tiene CUIT, por la **razón social**. Si Talleres Rivera SA ya era cliente y ahora viene en un archivo de proveedores, se le suma el rol de proveedor: no se duplica.

> [!NOTA]
> Con **Exportar mis clientes** (o proveedores) te bajás tu lista actual en Excel, con las mismas columnas, para corregirla y volver a subirla. Con **Exportar mis artículos** pasa lo mismo en Inventario: es la forma más rápida de actualizar precios.

## Lo que todavía no se importa

- Los **saldos de cuenta corriente** (lo que le debés a cada proveedor o te debe cada cliente).

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| *No se pudo leer el archivo* | El archivo no es Excel o CSV, o está dañado | Abrilo y guardalo de nuevo como .xlsx o .csv |
| *El archivo tiene más de 20.000 filas: dividilo en partes* | Superaste el máximo por archivo | Partilo en dos o más archivos e importalos de a uno |
| Filas con error por el límite de clientes | Tu plan permite una cantidad de clientes y el archivo la supera | Importá menos clientes o pasá a un plan más grande |
| No ves el botón de importar | Tu rol no puede cargar ese tipo de datos | Pedíselo al Dueño o a un Administrador |
