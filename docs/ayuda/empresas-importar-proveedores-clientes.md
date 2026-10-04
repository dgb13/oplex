# Cómo importar proveedores y clientes desde Excel

Si ya tenés tus proveedores o clientes en otro sistema o en una planilla, los podés traer a Oplex de una sola vez: en **Compras → Proveedores → Importar proveedores** o en **Ventas → Clientes → Importar clientes**. Sirve el archivo que ya tenés (Excel .xlsx o CSV), con tus propias columnas. Entran hasta 20.000 empresas por archivo.

Son cuatro pasos:

1. **Archivo**: elegís si las empresas del archivo son **Proveedores**, **Clientes** o **Las dos cosas**, y subís el archivo. Oplex encuentra solo la fila de los encabezados. Si arrancás de cero, con **Descargar planilla modelo** te bajás una planilla con un ejemplo y la explicación de cada columna.
2. **Columnas**: Oplex reconoce cada columna por su encabezado ("Razón Social", "C.U.I.T.", "Cond. IVA", "Dirección", "Contacto", etc.). Podés cambiar a qué campo va cada una o marcarla como **No importar**. La única obligatoria es la **razón social**. También elegís:
   - **Si la empresa ya existe en Oplex**: **Completar lo vacío** (sólo llena los datos que faltan; lo que cargaste a mano no se toca), **Reemplazar** (los datos del archivo reemplazan a los de Oplex; un dato vacío en el archivo no borra nada) o **Dejarla como está**.
   - **Verificar los CUIT con ARCA**: completa la condición de IVA y el domicilio fiscal que falten y avisa si la razón social no coincide con la de ARCA.
3. **Revisión**: ves cuántas empresas son nuevas, cuántas ya existen y se completan, y cuáles tienen errores y por qué (por ejemplo, un CUIT mal escrito). Oplex muestra cómo interpretó la **condición de IVA** de tu archivo ("RI" → Responsable Inscripto, "Monot." → Monotributo, "EX" → Exento, "CF" → Consumidor Final). Si alguna no la reconoce, elegís a qué corresponde. Es importante porque decide si al cliente le hacés Factura A o B. Las filas con error se pueden bajar con **Descargar errores en Excel**.
4. **Importar**: corre en segundo plano. Si elegiste verificar con ARCA, primero termina esa verificación y después guarda.

## Cómo reconoce una empresa que ya existe

Por **CUIT**. Si la empresa no tiene CUIT (ni en el archivo ni en Oplex), por **razón social**. Así se completan los proveedores que se crearon al importar artículos, que sólo tienen el nombre. Si una empresa ya era cliente y ahora viene como proveedor, se le agrega el rol de proveedor: no se duplica.

## Contactos

Cada fila puede traer un contacto (nombre, cargo, email y celular). Si la misma empresa aparece en varias filas con distintos contactos, se cargan todos en esa empresa.

## Otros datos

- El CUIT se acepta con o sin guiones. Para clientes consumidor final se acepta el DNI.
- Si importás clientes, se respeta el límite de clientes de tu plan: las filas que lo superan aparecen con error en la revisión.
- Con **Exportar mis proveedores** (o clientes) te bajás tu lista en Excel con las mismas columnas, para corregirla y volver a subirla.
- Los **saldos de cuenta corriente** (lo que le debés a cada proveedor o te debe cada cliente) todavía no se importan.

Una importación no se puede deshacer automáticamente: revisá bien el paso de Revisión antes de importar.
