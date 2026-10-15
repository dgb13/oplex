---
title: Historial y costos de producción
summary: Cuánto tardó y cuánto costó cada producción terminada, y cómo repetir una orden en dos clics.
minutes: 5
roles: Dueño, Administrador, Inventario
---

El Historial junta todas las órdenes de producción completadas. Te sirve para saber cuánto tarda en promedio fabricar cada producto, cuánto te costó la última vez y para volver a lanzar una orden igual sin cargarla de nuevo.

## Antes de empezar

- Necesitás un plan con **Producción** (desde **Bronze**; no está en **Basic Gratis**).
- Sólo aparecen las órdenes **Completadas**. Las que están en curso o canceladas se ven en el [Tablero](/documentacion/produccion/ordenes-de-produccion).

## Ver el historial

1. Andá a **Producción › Historial**. Se abre **Historial de producción**.
2. Elegí la vista: **Por producto** (agrupa las órdenes de cada producto) o **Todas las órdenes** (una sola lista).
3. Si buscás algo puntual, escribí en **Buscar producto u orden...** el nombre, el código o el número de orden.

### Vista Por producto

Cada producto muestra una tarjeta con:

- **Veces**: cuántas órdenes se completaron.
- **Última**: la fecha de la última.
- **Fabricación prom.**: cuántos días tarda en promedio, desde que se tocó **Iniciar producción** hasta que se completó. Si ninguna orden pasó por **Iniciar producción**, dice **Demora prom.** y cuenta desde que se creó la orden. Las barritas muestran lo que tardó cada orden, de la más vieja a la más nueva.
- **Costo unit. últ.**: el costo por unidad de la última orden.

Tocá la flecha con el número para ver las órdenes de ese producto.

![Historial por producto con el Kit de fijación y su primera orden](/ayuda/capturas/produccion-historial.jpg)

### Columnas de las órdenes

| Columna | Qué muestra |
| --- | --- |
| Orden | El número. Tocalo para abrir el detalle. |
| Inició / Terminó | Fecha de inicio real y de fin. |
| Fabricación | Días entre el inicio y el fin. En verde si tardó igual o menos que el promedio del producto; en ámbar si tardó más. |
| Espera previa | Días entre que se creó la orden y se inició. |
| Total | Días entre que se creó y se completó. |
| Cantidad | Unidades fabricadas. |
| Costo unit. | Costo por unidad de esa orden. |
| Receta | Versión de la receta usada. Si hoy hay otra, dice por ejemplo "v1 (hoy v2)" en ámbar. |
| Creó | Quién creó la orden. |

## Cómo se calcula el costo

El costo de una orden es la suma de lo que costaron los insumos consumidos:

- Insumos comunes (unidades, gramos, mililitros): al costo promedio que tienen en el depósito.
- Insumos por barra: al costo por milímetro de cada barra o recorte que se cortó, incluido el descarte que quedó. Mirá [Piezas y recortes](/documentacion/produccion/piezas-y-recortes).

Ese total, dividido por la cantidad fabricada, es el costo unitario con el que el producto entra al stock. En el detalle de cada orden, el cuadro **Consumo real** muestra cantidad, merma y costo de cada insumo, y el cuadro **Producido** el costo total del producto.

> [!NOTA]
> El costo del producto fabricable sale de la receta y de los insumos: no se carga a mano. Usá el **Costo unit. últ.** como referencia para fijar o revisar el precio de venta en Inventario.

## Repetir una orden

1. En la vista **Por producto**, tocá **Repetir última**. O, en cualquier fila, tocá **Repetir**.
2. En la ventana **Repetir** revisá **Cantidad a producir**, **Depósito** e **Inicio programado**. **Terminaría aprox.** te da una fecha estimada según el promedio del producto.
3. Mirá el aviso de la receta. Si cambió desde aquella orden, Oplex te dice qué versión se usó antes y que la nueva orden se arma con la versión vigente.
4. Tocá **Crear orden**. Se reservan los insumos y se abre la orden nueva.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
| --- | --- | --- |
| Todavía no completaste ninguna orden de producción. | No hay órdenes completadas. | Completá una orden desde el Tablero. |
| No hay producciones terminadas que coincidan. | La búsqueda no encontró nada. | Borrá o cambiá el texto de búsqueda. |
| Este producto ya no tiene una receta activa - activá una en Recetas para poder repetirlo. | El producto se quedó sin receta. | Cargá una receta en **Producción › Recetas**. |
| **Fabricación** muestra "—" | La orden se completó sin tocar **Iniciar producción**. | En las próximas, tocá **Iniciar producción** cuando empiece el trabajo. |
