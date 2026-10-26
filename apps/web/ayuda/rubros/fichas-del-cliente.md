---
title: Fichas del cliente
summary: Los vehículos, equipos o mascotas de tus clientes, con sus datos, su dueño y el historial de trabajos.
minutes: 5
roles: Dueño, Administrador, Ventas
---

Una ficha guarda los datos de algo de tu cliente sobre lo que trabajás: el vehículo en un taller, el equipo en un service, la mascota en una veterinaria. Cada ficha tiene un **dato principal** para buscarla (la patente, el IMEI, el nombre) y muestra todas las órdenes de trabajo que tuvo.

## Antes de empezar

- Necesitás el módulo **Fichas del cliente** prendido en **Rubro y módulos**. El nombre del menú sale de tu rubro: **Vehículos** en un taller, **Equipos** en un service, **Mascotas** en una veterinaria.
- Cargan y editan fichas el **Dueño**, los **Administradores** y **Ventas**. **Solo lectura** las consulta.
- El cliente tiene que existir en **Ventas › Clientes**.

## Cargar una ficha

1. Andá al menú de tu ficha (por ejemplo **Vehículos**) y tocá **+ Cargar vehículo**.
2. En **Cliente dueño**, buscá y elegí el cliente.
3. Completá los datos. Los obligatorios dependen de tu rubro; en un taller son **Patente**, **Marca** y **Modelo**, y además podés cargar **Año**, **Kilómetros**, **N° de motor**, **N° de chasis / VIN** y **Combustible**.
4. Tocá **Guardar**. Se abre la ficha.

> [!NOTA]
> Si ya hay otra ficha con el mismo dato principal (por ejemplo la misma patente de otro cliente), Oplex te avisa **Ya hay otro con patente …** y te dice de quién es. Si es el mismo vehículo y cambió de dueño, conviene abrir esa ficha y usar **Cambiar dueño**. Si no, tocá **Guardar igual**: no se bloquea.

También podés cargar fichas desde el cliente: en **Ventas › Clientes**, abrí el cliente y, en la sección de sus fichas, tocá **+ Agregar vehículo**.

## Buscar y ver una ficha

- En la lista, escribí en **Buscá por patente o por cliente** (o el dato principal de tu rubro). La tabla muestra el dato principal, un resumen de los datos, el cliente y cuándo se actualizó.
- Tocá una fila para abrir la ficha. Arriba ves el dato principal, el resumen, el **Dueño** con su teléfono (tocá el nombre para ver o editar el cliente) y todos los datos.
- En **Historial** están sus órdenes de trabajo con la fecha, el número, los datos del día que entró (por ejemplo los kilómetros), el trabajo y el estado. Desde ahí también abrís una orden nueva con **+ Cargar orden de trabajo**.

![Ficha de un vehículo con su historial de trabajos](/ayuda/capturas/rubros-ficha.jpg)

## Editar, cambiar de dueño o dar de baja

- **Editar datos**: cambia cualquier dato de la ficha.
- **Cambiar dueño**: para cuando se vende. Elegí el cliente nuevo y tocá **Pasar a este cliente**: la ficha y su historial pasan al nuevo dueño.
- **Dar de baja esta ficha** (abajo de todo): la marca como **Inactivo** sin borrar su historial. Con **Volver a activar** la recuperás.

## Cambiar los campos de la ficha

El Dueño o un Administrador, en tu foto › **Rubro y módulos** › **Tus fichas**:

1. Cambiá **Nombre** (por ejemplo "Vehículo") y **En el menú (plural)** ("Vehículos").
2. En la tabla, cambiá el nombre de cada campo o tildá **Obligatorio**. El campo marcado **Dato principal** es el que se usa para buscar y no se puede quitar.
3. Para sumar uno, tocá **+ Agregar campo**, ponele nombre y elegí el tipo (texto, número, fecha, lista o sí/no). En una lista, escribí las opciones separadas por coma.
4. Con **Ocultar** un campo deja de pedirse, sin borrar lo que ya cargaste; **Mostrar** lo vuelve a poner.
5. Tocá **Guardar ficha**.

> [!IMPORTANTE]
> El tipo de un campo ya guardado no se puede cambiar (por ejemplo de texto a número): creá un campo nuevo y ocultá el viejo.

Si tu rubro no traía ficha, en **Tus fichas** escribí sobre qué trabajás (por ejemplo **Equipo**) y tocá **Crear ficha**.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
| --- | --- | --- |
| Falta "…" | No completaste un dato obligatorio. | Completalo o, si no hace falta, destildá **Obligatorio** en **Tus fichas**. |
| Todavía no definiste qué fichas usás. | Prendiste Fichas pero no hay ninguna ficha creada. | Creala en **Rubro y módulos** › **Tus fichas**. |
| "…" tiene que ser un número | Escribiste letras en un campo numérico. | Escribí sólo el número (por ejemplo 85000). |
| No se puede cambiar el tipo del campo "…": creá uno nuevo | Intentaste cambiar el tipo de un campo guardado. | Agregá un campo nuevo y ocultá el viejo. |
