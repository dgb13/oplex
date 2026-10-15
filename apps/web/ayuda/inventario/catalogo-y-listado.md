---
title: Catálogo y listado de artículos
summary: Cómo buscar artículos, usar la vista de catálogo y armar un listado para pedir costos, cotizar o exportar a PDF.
minutes: 4
roles: Dueño, Administrador, Inventario, Ventas, Compras
---

La pantalla de Inventario te muestra todos tus artículos en una lista o como un catálogo con fotos, tipo tienda online. Desde ahí podés ir juntando artículos en un **listado** (como un carrito) para después pedir costos a los proveedores, proponerle una venta a un cliente o exportarlo a PDF.

## Buscar y filtrar

Arriba de la lista tenés:

- **Buscar por artículo o SKU...**: busca por palabra. "látex marfil" encuentra la pintura látex 20 L en su variante marfil, aunque las dos palabras no estén juntas.
- **Todas las categorías**: filtra por categoría.
- **Sólo servicios**, **Sólo publicados** y **Mostrar inactivos**: casillas para acotar la lista. Los inactivos aparecen más claros y con la etiqueta **Inactivo**.

Tocá el título de una columna (**Artículo**, **SKU**, **Categoría**, **Precio**, **Total**, **Stock mínimo**) para ordenar; tocalo de nuevo para invertir el orden.

Cada variante ocupa una fila. Debajo del nombre tenés accesos rápidos:

- El nombre del **proveedor preferido** (o **+ proveedor** si no tiene): para asignarlo o cambiarlo.
- El lápiz: abre la ficha para editar.
- El carrito: agrega 1 unidad al listado.

La miniatura de la izquierda abre la ventana **Imagen de...** para cambiar o quitar la foto principal. El precio abre el historial de precios.

## Las tres vistas

Arriba a la derecha de la lista hay tres botones:

| Botón | Qué muestra |
|---|---|
| **Vista de lista** | La tabla, con una columna de stock por depósito y el **Total**. |
| **Vista de catálogo** | Tarjetas con foto, categoría, SKU, precio y stock. |
| **Alertas de stock** | Lo que está bajo el mínimo. Ver [Stock mínimo y reposición](/documentacion/inventario/stock-minimo). |

![Vista de catálogo con tarjetas de artículos y el listado abierto](/ayuda/capturas/inventario-catalogo-listado.jpg)

## Pasos: armar un listado

1. **En la vista de catálogo, elegí la cantidad y tocá Agregar en cada tarjeta.** En la vista de lista, el ícono del carrito agrega de a 1 unidad. Los servicios y los productos que se fabrican no se pueden agregar.
2. **Abrí el listado con el ícono de la canasta, arriba a la derecha de la pantalla.** El número sobre el ícono es la cantidad de unidades que tenés. Se abre el panel **Listado de artículos**.
3. **Ajustá las cantidades.** Con **−** y **+** cambiás cada una; con el tachito la sacás.
4. **Elegí qué hacer con el listado.** Ver la tabla de abajo.

El listado es tuyo: cada usuario tiene el suyo, y queda guardado aunque cierres la sesión.

| Botón | Qué hace |
|---|---|
| **Pedido de costos** | Elegís la **Moneda**, el costo estimado y el proveedor de cada artículo, y tocás **Generar N pedido(s)**. Oplex crea un pedido de cotización por proveedor. Ver [Pedidos de cotización](/documentacion/compras/pedidos-de-cotizacion). |
| **Proponer venta** | Elegís **Cliente**, **Moneda**, **Válida hasta** y **Notas**, ajustás el precio de cada artículo y tocás **Generar cotización**. La cotización queda en **Ventas › Cotizaciones**. Ver [Cotizaciones](/documentacion/ventas/cotizaciones). |
| **Exportar PDF** | Abre un PDF con el listado, para imprimir o mandar. |
| **Vaciar lista** | Borra todo el listado. Te pide confirmar con **¿Confirmar?**. |

> [!NOTA]
> Generar pedidos o una cotización no vacía el listado. Cuando ya no lo necesites, tocá **Vaciar lista**.

## Ejemplo

Diego Ferreyra (Ventas) arma un presupuesto para Constructora Del Valle SRL: agrega 2 taladros percutores 13 mm, 4 amoladoras angulares 115 mm y 10 cajas de tornillos autoperforantes. Toca **Proponer venta**, elige el cliente, pone **Válida hasta** a 15 días y toca **Generar cotización**. Después, con el mismo listado, toca **Pedido de costos** para consultarle precios a Distribuidora Tornillos del Sur SA.

## Publicado y tienda online

La casilla **Publicado** de cada artículo decide si se ve en la tienda online. La tienda está disponible desde el plan Silver. Para que un artículo aparezca tiene que cumplir las cuatro condiciones que ves en la pestaña **Tienda online** de su ficha: estar publicado, tener categoría, tener precio de venta y tener stock (los servicios no se muestran). Ver [Tienda online](/documentacion/ventas/tienda-online).

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| Sin artículos que coincidan con la búsqueda | Ningún artículo cumple la búsqueda y los filtros. | Borrá la búsqueda, elegí **Todas las categorías** y sacá las casillas. |
| Un artículo no tiene botón **Agregar** | Es un servicio o un producto que se fabrica. | No se pueden agregar al listado. |
| No se pudo generar el pedido. Revisá los datos e intentá de nuevo. | Falta la moneda o algún dato del pedido. | Elegí la **Moneda** y revisá los costos. Los artículos que dejaste en **Sin asignar** no entran en ningún pedido. |
| Todavía no agregaste artículos. | El listado está vacío. | Agregá artículos desde Inventario. |
