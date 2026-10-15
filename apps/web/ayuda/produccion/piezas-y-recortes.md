---
title: Piezas y recortes
summary: Cómo sigue Oplex cada barra y cada recorte de los artículos por metro, para aprovechar el material en la próxima orden.
minutes: 5
roles: Dueño, Administrador, Inventario
---

Los artículos que se compran en barras (caños, perfiles, tubos, cablecanal) no se manejan como unidades sueltas: Oplex guarda cada barra con su largo y, cuando una orden de producción corta un pedazo, guarda el sobrante como un recorte con su propio largo. Así sabés exactamente qué material tenés y la próxima orden usa primero los recortes que sirven.

## Antes de empezar

- Necesitás un plan con **Producción** (desde **Bronze**; no está en **Basic Gratis**).
- El artículo tiene que estar creado en **Inventario** con **Tipo de medición** **Lineal (por metro)**. El tipo de medición queda fijo una vez creado el artículo.

## Configurar el artículo por barra

Al crear el artículo, con **Lineal (por metro)** elegido, completá:

- **Largo comercial (mm)**: el largo de la barra con el que te vende el proveedor, por ejemplo 6000 para el "Caño estructural 40x40" de Los Andes.
- **Merma mínima aprovechable (mm)** (opcional): el recorte más corto que todavía te sirve. Un sobrante más corto que esto se marca como **Descarte** y no se vuelve a ofrecer.

Si cambiás el **Largo comercial (mm)** después, se aplica a las barras que se reciban de ahora en más. Las que ya están en stock conservan su largo.

> [!IMPORTANTE]
> Las barras no tienen stock inicial ni entran por un movimiento manual de Inventario: cada barra se registra con su largo al recibir la mercadería de una orden de compra, en **Compras › Compras**, pestaña **Órdenes de Compra**, con **Recibir mercadería**. Mirá [Órdenes de compra y recepción](/documentacion/compras/ordenes-y-recepcion).

## Cómo se cortan las barras

Cuando completás una [orden de producción](/documentacion/produccion/ordenes-de-produccion), Oplex arma el plan de corte solo:

1. Junta todos los cortes que pide la receta para esa orden, de mayor a menor.
2. Pone cada corte en la pieza más chica donde entra entero, sea un recorte o una barra entera.
3. Cada corte sale de una sola pieza: nunca se empalman dos pedazos.
4. Lo que sobra de cada pieza queda como recorte **Disponible** o, si es más corto que la merma mínima aprovechable, como **Descarte**.

Por ejemplo, con barras de 6000 mm y una orden que pide 4 cortes de 1200 mm, Oplex usa una sola barra y deja un recorte de 1200 mm disponible para la próxima.

> [!NOTA]
> Al reservar, Oplex también revisa que cada corte entre en alguna pieza. Si tenés 1600 mm en dos recortes de 800 mm, alcanzan los milímetros pero no sirven para un corte de 1200 mm: la orden queda **Esperando insumos** con el aviso "Faltan piezas donde hacer los cortes".

## Ver las piezas de un artículo

1. Andá a **Producción › Piezas y recortes**.
2. Elegí el artículo en **Artículo (por metro/pieza)**.
3. Si querés, filtrá por **Depósito**. Por defecto se ven **Todos los depósitos**.

Arriba aparece un resumen: cuántas barras enteras, cuántos recortes reutilizables y cuántos milímetros disponibles en total. Abajo, la lista de piezas con:

| Columna | Qué muestra |
| --- | --- |
| Largo original | Con cuánto largo nació la pieza. |
| Largo actual | Cuánto le queda, con una barrita de lo que resta. |
| Estado | **Disponible**, **Agotada** (ya se usó entera) o **Descarte** (sobrante demasiado corto). |
| Origen | **Compra** si es una barra entera recibida, **Recorte** si es el sobrante de un corte. |
| Creada | La fecha en que entró la pieza. |

Cuando una pieza se corta, Oplex no la achica: la marca como **Agotada** y crea una pieza nueva con el sobrante. Por eso en la lista ves toda la historia de cada barra.

## El costo de cada pieza

Cada barra guarda su costo por milímetro desde la compra, y los recortes heredan ese mismo costo. Al completar una orden, el costo del insumo es el de las piezas que realmente se cortaron, incluido el descarte que quedó.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
| --- | --- | --- |
| Sin piezas registradas para este artículo. | El artículo no es por metro, o todavía no recibiste barras. | Revisá el **Tipo de medición** del artículo y recibí la mercadería desde Compras. |
| El artículo no aparece al cargar un movimiento de stock en Inventario | Los artículos por pieza no admiten movimientos manuales. | Registrá la entrada con **Recibir mercadería** en Compras. |
| No hay una pieza de … de al menos … mm para uno de los cortes de esta orden - cada corte tiene que salir entero de una sola pieza | Al completar, ninguna pieza alcanza para un corte. | Recibí barras nuevas y tocá **Reintentar reserva** en la orden. |
