---
title: Precios, costos e IVA
summary: Cómo se cargan el precio de venta, la remarca y el IVA de cada artículo, y de dónde sale el costo.
minutes: 5
roles: Dueño, Administrador, Inventario
---

Cada artículo tiene un **precio de venta**, una **alícuota de IVA** y un **costo**. El precio lo ponés vos; el costo lo calcula Oplex a partir de tus compras. Con esos datos Oplex te sugiere precios, factura con el IVA correcto y calcula tu ganancia real.

## Antes de empezar

- Cargá tu condición frente al IVA en **Contabilidad › Conexión con ARCA** (datos de la empresa). Sin ese dato, Oplex no sabe si el precio que escribís es neto o final, ni si tiene que sacarle o sumarle el IVA al costo. Mientras falte, vas a ver el aviso **Falta tu condición frente al IVA.** Ver [Datos de la empresa](/documentacion/arca/datos-de-la-empresa).
- Si querés una remarca general para todos los artículos, configurala en **Preferencias › Precios de Inventario** (menú de tu usuario, arriba a la derecha). Ver [Preferencias](/documentacion/cuenta/preferencias).

## Precio con IVA o sin IVA

Al lado del campo **Precio de venta** aparece una etiqueta que te dice cómo se interpreta:

| Tu condición | Etiqueta | Qué significa |
|---|---|---|
| Responsable Inscripto | **sin IVA** | Es el precio neto. Al facturar, Oplex le suma el IVA del artículo. Ejemplo: taladro a $100.000 sin IVA, el cliente paga $121.000. |
| Monotributo o Exento | **final** | Es lo que paga el cliente. Facturás con comprobante C, sin IVA discriminado. |

Ferretería Los Andes es Responsable Inscripto, así que carga todos sus precios sin IVA.

## Pasos: cambiar el precio de un artículo

1. **En Inventario, tocá el precio del artículo en la columna Precio.** Se abre la ventana **Precio**, con el costo actual arriba y el historial abajo.
2. **Escribí el nuevo Precio de venta.** Si querés usar la remarca, completá **% de remarca del artículo** y tocá **Usar sugerido**: Oplex calcula costo × remarca.
3. **Tocá Guardar.** El cambio queda registrado en el **Historial**, con la fecha, el precio y el costo.

También podés cambiar el precio desde la ficha del artículo (el lápiz), en la pestaña **Precios e IVA**. Si el artículo tiene variantes, el precio de cada una se cambia en la pestaña **Variantes**.

![Ventana Precio con el historial de precios del taladro percutor](/ayuda/capturas/inventario-precio-historial.jpg)

> [!NOTA]
> La remarca sólo te sugiere un precio. Oplex nunca cambia el precio de venta solo cuando sube el costo: si una compra sale más cara, revisá vos el precio.

## La remarca

La remarca es el porcentaje que le sumás al costo para llegar al precio. Se busca en este orden:

1. El **% remarca** propio del artículo, si lo cargaste.
2. Si no, la remarca general de **Preferencias › Precios de Inventario**. En el campo vacío del artículo la vas a ver como "Default: 40" (o el número que hayas puesto).

Ejemplo: amoladora angular 115 mm con costo $50.000 y remarca 40 % → precio sugerido $70.000.

## El IVA del artículo

1. **Abrí la ficha del artículo con el lápiz y andá a Precios e IVA.**
2. **Elegí la alícuota en IVA del artículo.** Las opciones son IVA 21%, IVA 10,5%, IVA 27%, IVA 5%, IVA 2,5%, Exento y No gravado (según lo que tenga cargado tu empresa).
3. **Tocá Guardar cambios.**

Cambiar el IVA afecta sólo a las facturas **nuevas**; las ya emitidas no cambian.

### Artículos sin IVA cargado

Si algún artículo no tiene alícuota, arriba de la lista de Inventario aparece un aviso amarillo: "N artículos no tienen IVA cargado. Se facturan con IVA 0 % y no se puede calcular su costo real." Desde ese mismo aviso podés:

- Tocar **Ver cuáles son** para filtrar la lista.
- Elegir una alícuota y tocar **Asignar a los N** para cargársela a todos de una vez. Sólo toca los que no tenían ninguna.

> [!IMPORTANTE]
> Un artículo sin IVA se factura con IVA 0 %. Asignale la alícuota antes de facturarlo.

## De dónde sale el costo

El costo no se escribe a mano en la ficha: Oplex lo calcula con cada entrada de mercadería.

- **Último costo real**: lo que pagaste en la última compra.
- **Costo promedio del stock**: el promedio ponderado de lo que tenés en depósito.

Los dos se ven en la pestaña **Precios e IVA** de la ficha, junto con **Sugerido (costo × remarca)** y el botón **Usar este precio**.

Cuando cargás un costo (en el alta del artículo, en un movimiento de stock o en una compra), elegís si el número que escribís es **sin IVA** o **con IVA**. Oplex guarda el **costo real**:

- Si sos Responsable Inscripto, lo guarda **sin IVA**, porque ese IVA lo recuperás como crédito fiscal.
- Si sos Monotributo o Exento, lo guarda **con IVA**, porque no lo recuperás.

Debajo del campo vas a ver cómo queda. Por ejemplo, si Los Andes escribe $100.000 con IVA en un artículo de IVA 21%: "Costo real que guarda Oplex: $82.644,63 (sin IVA, porque el IVA lo recuperás)".

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| Falta tu condición frente al IVA. | La empresa no tiene cargada su condición. | Cargala en **Contabilidad › Conexión con ARCA** › Datos de la empresa. Mientras tanto los costos se guardan tal cual los escribís. |
| Ingresá un precio de venta válido | El precio está vacío o en cero. | Escribí un precio mayor a 0. |
| No aparece el precio sugerido | El artículo todavía no tiene costo, o no hay remarca cargada. | Registrá una compra o cargá un **% remarca**. |
| No se pudo asignar. Probá de nuevo. | Falló la asignación de IVA en lote. | Volvé a tocar **Asignar a los N**. Si sigue, asignalo desde la ficha de cada artículo. |
