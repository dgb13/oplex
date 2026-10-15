---
title: Carga de facturas con IA
summary: Cómo cargar una factura de proveedor sacándole una foto, para que la inteligencia artificial complete los datos y vos sólo revises.
minutes: 4
roles: Dueño, Administrador, Compras, Inventario
---

Con la carga con IA no tipeás la factura del proveedor: le sacás una foto (o subís el PDF) y Oplex lee proveedor, número, fecha, neto, IVA y percepciones. Vos revisás, corregís lo que haga falta y confirmás. Es un atajo: la carga a mano sigue estando siempre disponible.

Está en **Compras › Compras**, pestaña **Carga con IA**.

## Antes de empezar

- **Depende de tu plan.** Cada plan trae un cupo mensual de facturas leídas con IA. En la misma pantalla ves cuántas usaste este mes. Ver [Planes y facturación](/documentacion/cuenta/planes-y-facturacion).
- Una foto nítida, derecha y con buena luz. Si la factura tiene el código QR de ARCA y se ve bien, mejor: los datos que salen del QR son exactos.

## Pasos

1. **Mirá el aviso de arriba.** **🟢 Escaneo con IA disponible** quiere decir que podés usarlo. Si está en amarillo, funciona pero más lento. Si está en rojo, cargá la factura a mano desde la pestaña **Facturas**. Debajo ves tu cupo: **Cupo IA (plan): usados/total usados este mes**.
2. **Subí la factura.** Arrastrá la foto o el PDF al recuadro, o tocá **Elegir archivo / sacar foto**. Desde el celular se abre directamente la cámara.
3. **Esperá unos segundos.** Mientras tanto ves **Leyendo el comprobante...** y después se abre **Revisar comprobante**.
4. **Mirá el nivel de confianza.** Arriba aparece **🟢 Confianza alta**, **🟡 Confianza media** o **🔴 Confianza baja**. Con confianza baja, revisá todos los campos, no sólo los marcados.
5. **Revisá el proveedor.** Si el CUIT de la factura coincide con un proveedor tuyo, aparece con **(vinculado por CUIT)**. Si no existe, tocá **+ Crear proveedor**, revisá el nombre y tocá **Crear**.
6. **Revisá cada campo.** **Nº de factura**, **Fecha**, **Letra**, **Moneda**, **Punto de venta**, **Número**, **Subtotal (neto)** y las líneas de **Impuestos** (**Tipo**, **Concepto**, **Monto**). Cada campo tiene una etiqueta: **QR** si salió del código QR (dato exacto) o **IA** con un porcentaje de confianza. Corregí lo que no coincida con el papel.
7. **Tocá Confirmar y crear factura.** La factura queda creada en la pestaña **Facturas**, con la foto adjunta, y la deuda aparece en Cuentas a Pagar.

> [!IMPORTANTE]
> La IA puede equivocarse. Antes de confirmar, comprobá siempre que el total que muestra Oplex sea igual al total de la factura.

> [!NOTA]
> La factura cargada con IA no queda vinculada a ninguna orden de compra ni a remitos. Si esa compra tiene orden y recepción, cargala a mano desde la pestaña **Facturas** para que se cancele la cuenta de mercadería recibida sin facturar (ver [Facturas de compra](/documentacion/compras/facturas-de-compra)).

## Galería IA

En la pestaña **Galería IA** ves todas las facturas que cargaste con IA, con su foto. Podés filtrar por **Proveedor**, fechas (**Desde** / **Hasta**), **Confianza** y **Editada antes de confirmar** (**Sí, se corrigió algo** o **No, tal cual la leyó la IA**). Sirve para controlar qué tan bien está leyendo tus comprobantes.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Tu plan actual (...) no incluye la carga de comprobantes con IA.** | Tu plan no tiene esta función. | Tocá **Mejorar plan →** o cargá la factura a mano. |
| **Alcanzaste el límite mensual de carga de comprobantes con IA de tu plan actual (...)** | Usaste todo el cupo del mes. | Esperá al mes que viene, mejorá el plan o cargá a mano. |
| **No se pudo leer el comprobante con IA en este momento. Cargá la factura manualmente.** | Falló la lectura (servicio caído, archivo dañado). | Probá de nuevo más tarde o cargala desde **Facturas**. |
| **El escaneo automático no está disponible en este momento. Podés cargar la factura manualmente.** | El servicio de IA no responde. | Cargá la factura desde la pestaña **Facturas**. |
| El botón **Confirmar y crear factura** está gris | Falta resolver el proveedor. | Elegilo o crealo con **+ Crear proveedor**. |
| **Moneda "..." no encontrada** | La IA leyó una moneda que no tenés configurada. | Cambiá la **Moneda** por una de tus monedas. |
