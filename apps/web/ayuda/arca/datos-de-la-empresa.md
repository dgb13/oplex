---
title: Datos de la empresa
summary: Paso 1 de Conexión con ARCA - cargá CUIT, razón social, condición frente al IVA, domicilio fiscal, Ingresos Brutos e inicio de actividades subiendo tu constancia.
minutes: 5
roles: Dueño, Administrador
---

En este paso cargás los datos de tu empresa tal como figuran en ARCA. Son los que salen como emisor en cada factura, y la **condición frente al IVA** define qué letra emitís (A, B o C). La forma más rápida es subir tu Constancia de Inscripción: Oplex la lee y completa todo solo.

## Antes de empezar

- El CUIT de tu empresa (en el ejemplo, 30-71589632-1).
- No hace falta clave fiscal: la constancia se saca de una consulta pública de ARCA.

## Pasos

1. **Abrí la pantalla.** Andá a **Contabilidad › Conexión con ARCA** y tocá **Datos de la empresa** (si es la primera vez, ya aparece abierto).
2. **Tocá Abrir la consulta en ARCA.** Se abre el sitio de ARCA en otra pestaña del navegador. Oplex no se cierra.
3. **Escribí tu CUIT.** En el campo **CUIT del Contribuyente** escribí el CUIT sin guiones (por ejemplo `30715896321`). Si Oplex ya lo conoce, te lo muestra con un botón **Copiar** para pegarlo.
4. **Resolvé el código de seguridad.** Podés elegir **Texto distorsionado** o **Cálculo matemático**. Escribí la respuesta en **Ingresá los caracteres visibles** y tocá **Consultar**.
5. **Guardá la constancia como PDF.** ARCA te muestra la constancia. Tocá **Imprimir** (o `Ctrl + P`), elegí **Guardar como PDF** y guardala en la computadora. También sirve una foto con el celular.
6. **Subila a Oplex.** Volvé a la pestaña de Oplex y arrastrá el archivo a la zona **Arrastrá la constancia acá**, o tocá **elegí el archivo**. Mientras la lee vas a ver **Leyendo la constancia...**.
   ![Paso 1 con el instructivo y la zona para subir la constancia](/ayuda/capturas/arca-paso1-constancia.jpg)
7. **Revisá los datos.** Oplex muestra lo que leyó: **CUIT**, **Razón social**, **Condición frente al IVA**, **Domicilio fiscal**, **Ingresos Brutos** e **Inicio de actividades**. Lo que salió de la constancia tiene la marca **de la constancia**. Si algo está mal, tocá **✎ corregir** debajo de ese dato y escribilo bien.
8. **Tocá Guardar datos.** Aparece **✓ Guardado** y la casilla **Datos de la empresa** de arriba se tilda.

![Los datos de la empresa en el paso 1, cada uno con su opción corregir y el botón Guardar datos](/ayuda/capturas/arca-paso1-revision.jpg)

> [!NOTA]
> El archivo de la constancia no se guarda en Oplex: se lee con inteligencia artificial, se toman los datos y se descarta.

### Qué te confirma Oplex según tu condición

En **Condición frente al IVA** vas a ver también qué factura te corresponde:

- **Responsable Inscripto** · emitís Factura A o B.
- **Monotributo** (con tu categoría, si la leyó) · emitís Factura C.
- **Exento** · emitís Factura C.

Además, Oplex compara lo que leyó con el padrón de ARCA. Si todo coincide, ves un aviso verde: **Leímos tu constancia** … **y los datos coinciden con el padrón de ARCA. Revisalos y guardá.** Si algo no coincide (por ejemplo, el domicilio), el aviso es ámbar y te dice qué dato revisar antes de guardar.

## Sin constancia: cargar sólo con el CUIT

Si ahora no podés sacar la constancia, abajo de la zona de subida tocá **Cargar sólo con el CUIT**.

1. **Escribí el CUIT** en **CUIT de tu empresa**. Al completar los 11 números, Oplex consulta ARCA (**⟳ Consultando ARCA...**) y, si lo encuentra (**✓ Encontrado en ARCA**), completa **Razón social**, **Domicilio fiscal** y **Condición frente al IVA**.
2. **Completá a mano Ingresos Brutos e Inicio de actividades.** ARCA no los informa con el CUIT. En **Ingresos Brutos** elegí el tipo (**Régimen Simplificado**, **Número local**, **Convenio Multilateral**, **Exento** o **No inscripto**) y escribí el detalle que querés que salga en la factura. Si la fecha de inicio dice **mes estimado**, confirmala con tu constancia.
3. **Tocá Guardar datos.**

Cuando quieras, podés volver y tocar **Actualizar con una constancia** para completar lo que falte.

## Cambiar la condición frente al IVA

Si pasás de Monotributo a Responsable Inscripto (o al revés), subí la constancia nueva o corregí el dato y tocá **Guardar datos**. Oplex te pide confirmación (**¿Cambiar de Monotributo a Responsable Inscripto?**) porque cambia cómo se toman los costos y los precios de venta de ahí en adelante. Tocá **Cambiar condición** para confirmar.

> [!IMPORTANTE]
> El stock que ya tenés conserva su costo y las ventas anteriores no cambian. Avisale a tu contador antes de cambiar la condición.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **✕ Esa constancia es del CUIT … y tu empresa tiene el … Sacá la de tu empresa.** | Subiste la constancia de otra persona o empresa. | Volvé a consultar en ARCA con el CUIT de tu empresa. |
| **✕ No pudimos leer el CUIT de la constancia. Probá con otra foto o con el PDF.** | La foto está borrosa o cortada. | Subí el PDF (paso 5) o una foto más nítida y completa. |
| **✕ Ese archivo no parece una constancia de ARCA.** | Subiste otro documento. | Sacá la constancia desde **Abrir la consulta en ARCA**. |
| **✕ Subí la constancia en PDF o como foto (JPG/PNG).** | El archivo tiene otro formato. | Guardala como PDF o sacale una foto. |
| **✕ No se pudo leer la constancia con IA en este momento.** | Falla momentánea del servicio de lectura. | Probá en unos minutos o usá **Cargar sólo con el CUIT**. |
| **✕ ARCA no encontró ese CUIT. Revisalo o cargá los datos a mano.** | El CUIT está mal escrito. | Revisá los números. |
| **✕ ARCA no responde ahora. Probá en unos minutos o cargá los datos a mano.** | El padrón de ARCA no está respondiendo. | Esperá un rato o tocá **✎ corregir** y cargá los datos a mano. |
