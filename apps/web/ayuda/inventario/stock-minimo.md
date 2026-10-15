---
title: Stock mínimo y reposición
summary: Cómo configurar el stock mínimo por depósito, ver las alertas y pedir cotización para reponer.
minutes: 4
roles: Dueño, Administrador, Inventario
---

El **stock mínimo** es la cantidad por debajo de la cual querés reponer un artículo. Cuando el stock de un depósito baja de ese número, Oplex te avisa y te arma el pedido de cotización al proveedor, con la cantidad justa para volver al mínimo. Incluso puede generarlo solo, todos los días.

## Antes de empezar

- Necesitás el rol Dueño, Administrador o Inventario.
- Para pedir cotización en un clic, el artículo tiene que tener un **Proveedor preferido**. Lo cargás tocando **+ proveedor** debajo del nombre del artículo en la lista de Inventario, o en la pestaña **Precios e IVA** de su ficha.

## Pasos: configurar el mínimo

1. **En Inventario, tocá el lápiz del artículo.** Se abre su ficha.
2. **Andá a la pestaña Stock.** Ves una fila por depósito (y por variante, si tiene) con el **Stock actual**.
3. **Escribí el número en Stock mínimo para alertas.** Por ejemplo, 5 taladros percutores en el Depósito Central y 2 en la Sucursal Norte.
4. **Tocá Guardar cambios.**

También podés cargar el mínimo al crear el artículo, en la pestaña **Stock inicial** (o en la columna **Mínimo** de cada variante).

> [!NOTA]
> Las alertas sólo te avisan. No bloquean ninguna venta ni ningún movimiento.

## Ver las alertas

Tenés tres lugares donde ver qué está bajo el mínimo:

- **En la lista de Inventario**: la fila se pinta de rojo y el total muestra ⚠ cuando el **Total** (la suma de todos los depósitos) está por debajo del **Stock mínimo** (la suma de los mínimos de todos los depósitos).
- **En la vista Alertas de stock**: tocá el ícono del triángulo, arriba a la derecha de la lista. Acá la comparación es **depósito por depósito**.
- **En el Tablero**: la tarjeta **Alertas de stock** cuenta los productos bajo mínimo.

> [!NOTA]
> Como la lista compara el total y las alertas comparan cada depósito, un artículo puede estar en las alertas sin estar en rojo en la lista. Por ejemplo: 0 taladros en la Sucursal Norte (mínimo 2) y 20 en el Depósito Central (mínimo 5). El total, 20, supera la suma de mínimos, 7, pero la Sucursal Norte está vacía.

![Vista Alertas de stock con dos artículos bajo mínimo](/ayuda/capturas/inventario-alertas-stock.jpg)

## Pasos: reponer desde las alertas

Cada alerta muestra el stock actual contra el mínimo (por ejemplo, "1 / 5 mín") y la cantidad a pedir ("Pedir 4"), que es lo que falta para llegar al mínimo.

1. **Para un solo artículo, tocá Pedir cotización en su fila.** Se abre el pedido de cotización con el artículo, la cantidad y el proveedor preferido ya cargados. Revisalo y guardalo.
2. **Para varios a la vez, tildalos y tocá Crear pedidos de cotización.** Con **Seleccionar todas con proveedor** tildás todas las que tienen proveedor preferido. Oplex arma un pedido por proveedor: si dos artículos son de Distribuidora Tornillos del Sur SA, van en el mismo pedido.

Los pedidos quedan en Compras. Ver [Pedidos de cotización](/documentacion/compras/pedidos-de-cotizacion).

> [!NOTA]
> Las alertas sin proveedor preferido no se pueden tildar. Asignales un proveedor o resolvelas de a una con **Pedir cotización**.

## Reposición automática

Si tildás **Automático** en una alerta, Oplex crea el pedido de cotización solo, una vez por día a la madrugada, sin que nadie entre a la pantalla. Arma un pedido por proveedor con todos los artículos marcados que estén bajo el mínimo.

- Como mucho genera un pedido automático por proveedor por día.
- El pedido lleva la nota "Generado automáticamente por reposición de stock (mínimo configurado en Inventario)."
- Sólo se puede activar en artículos con proveedor preferido.

Si no querés esperar a la madrugada, el Dueño o un Administrador puede ir a **Preferencias › Reposición automática de stock** (menú de tu usuario, arriba a la derecha) y tocar **Ejecutar reposición ahora**.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| Sin alertas — todo está por encima del mínimo configurado en cada depósito. | No hay nada bajo el mínimo, o no cargaste mínimos. | Revisá la pestaña **Stock** de la ficha de tus artículos. |
| No puedo tildar una alerta ni marcar **Automático** | El artículo no tiene proveedor preferido. | Asignale uno con **+ proveedor** en la lista de Inventario. |
| Sin novedades: ningún artículo con reposición automática activada está bajo su mínimo ahora mismo | Tocaste **Ejecutar reposición ahora** y no había nada para pedir. | No hace falta hacer nada. |
| "1 proveedor(es) ya tenían uno generado hoy" | Ese proveedor ya tiene su pedido automático del día. | Revisalo en Compras. Lo nuevo entra en la corrida de mañana, o pedilo a mano con **Pedir cotización**. |
