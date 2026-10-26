---
title: Roles y permisos
summary: Qué rol tiene cada persona del equipo, qué ve en el menú y quién puede cambiarlo.
minutes: 5
roles: Todos
---

En Oplex cada usuario tiene un **rol**. El rol decide qué pantallas aparecen en su menú y qué puede modificar. No es sólo esconder botones: aunque alguien escriba la dirección de una pantalla a mano, Oplex controla el permiso del lado del servidor.

## Los roles

| Rol | Cómo aparece en Equipo | Para quién es |
|---|---|---|
| **Dueño** | Dueño/a | Quien creó la cuenta. Ve y hace todo, incluido el plan y el pago de Oplex. |
| **Administrador** | Admin | Una persona de confianza que maneja todo igual que el Dueño. |
| **Ventas** | Ventas | Vendedores y cajeros: clientes, cotizaciones, facturas, cobros y Caja. |
| **Compras** | Compras | Quien compra: proveedores, pedidos, órdenes y facturas de compra. |
| **Inventario** | Inventario | Depósito y producción: stock, recepciones, compras y Producción. |
| **Contador** | Contador/a | Alguien de administración que mira facturación, cobros, pagos y cheques. |
| **Solo lectura** | Solo lectura | Quien sólo necesita consultar, sin cargar nada. |

> [!NOTA]
> En tu **Perfil** el rol aparece con el nombre largo (Dueño, Administrador, Contador). En **Equipo** aparece abreviado (Dueño/a, Admin, Contador/a). Es el mismo rol.

## Qué ve cada rol en el menú

El **Dueño** y los **Administradores** ven siempre todo. Para el resto, esta es la tabla:

| Pantalla | Ventas | Compras | Inventario | Contador | Solo lectura |
|---|---|---|---|---|---|
| Tablero, Resumen, Agenda | ✓ | ✓ | ✓ | ✓ | ✓ |
| Inventario | ✓ | ✓ | ✓ | ✓ | ✓ |
| Empresas | ✓ | ✓ | ✓ | ✓ | ✓ |
| Documentación | ✓ | ✓ | ✓ | ✓ | ✓ |
| Caja | ✓ | — | — | — | — |
| Fichas ² | ✓ | — | — | — | ✓ |
| Órdenes de trabajo ² | ✓ | ✓ | — | ✓ | ✓ |
| Órdenes de trabajo › Margen por trabajo ² | — | — | — | ✓ | — |
| Ventas › Facturación | ✓ | — | — | ✓ | ✓ |
| Ventas › Cotizaciones | ✓ | — | — | — | ✓ |
| Ventas › Pendientes de entrega | ✓ | — | ✓ | — | — |
| Ventas › Cuentas a Cobrar | ✓ | — | — | ✓ | — |
| Ventas › Clientes | ✓ | — | — | ✓ | ✓ |
| Ventas › Pedidos de la tienda ¹ | ✓ | — | — | — | — |
| Compras › Compras | — | ✓ | ✓ | ✓ | ✓ |
| Compras › Cuentas a Pagar | — | ✓ | ✓ | ✓ | — |
| Compras › Proveedores | — | ✓ | ✓ | ✓ | ✓ |
| Producción › Tablero, Recetas, Historial, Piezas y recortes ¹ | — | — | ✓ | — | ✓ |
| Producción › Configuración ¹ | — | — | ✓ | — | — |
| Contabilidad › Cartera de Cheques | ✓ | — | ✓ | ✓ | — |
| Sucursales | ✓ | — | — | — | — |
| Contadores | — | — | — | ✓ | — |

¹ Sólo si tu plan incluye ese módulo.

² Sólo si el módulo está prendido en **Rubro y módulos**. Ventas carga horas en una orden pero no ve importes ni márgenes; Compras y el Contador suman a la orden las compras hechas para ese trabajo. Ver [Costo y margen de cada trabajo](/documentacion/rubros/costo-y-margen).

**Sólo Dueño y Administrador** ven:

- **Ventas › Tienda online**.
- **Contabilidad › Conexión con ARCA**.
- **Contabilidad › Contabilidad**, **Contabilidad › Impuestos** y **Contabilidad › Reportes**. Estas tres también las ve un contador externo vinculado (ver más abajo).
- En el menú de usuario (tu foto, arriba a la derecha): **Equipo**, **Cajas (POS)**, **Rubro y módulos** y **Preferencias**.

Todos ven en el menú de usuario **Perfil** y **Planes y facturación**. Pero sólo el Dueño y los Administradores pueden pagar, cambiar de plan o pedir la baja.

> [!IMPORTANTE]
> Ver una pantalla no siempre quiere decir poder modificarla. Por ejemplo, **Solo lectura** y **Contador** ven Facturación pero no pueden emitir facturas: eso lo hacen Ventas, el Dueño y los Administradores. Y aunque todos ven **Inventario**, importar artículos lo pueden hacer sólo el Dueño, los Administradores e Inventario.

## El contador externo

Si trabajás con un estudio contable, no hace falta crearle un usuario con rol Contador: lo invitás desde **Contadores** y entra con su propia cuenta de Oplex. Entra con el rol **Contador** (ve lo mismo que la columna Contador de la tabla) y, además, por defecto puede trabajar en **Impuestos** y consultar **Contabilidad** y **Reportes**. No usa la Caja ni carga ventas o compras. En **Equipo** aparece marcado como **Contador externo**. Ver [Contadores](/documentacion/equipo/contadores).

## Quién cambia los roles

Sólo el Dueño y los Administradores, desde **Equipo**. Se explica en [Invitar a tu equipo](/documentacion/primeros-pasos/invitar-a-tu-equipo).

- Se puede asignar cualquier rol menos **Dueño**: el Dueño es quien creó la cuenta y su rol no se cambia desde la pantalla.
- Nadie puede suspender su propia cuenta.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| Falta una opción del menú que sí ve un compañero | Tu rol no incluye esa pantalla | Pedile al Dueño o a un Administrador que revise tu rol en **Equipo** |
| En **Equipo** aparece *No tenés permiso para ver esta sección.* | Sólo Dueño y Administrador gestionan el equipo | Pedíselo a alguno de ellos |
| No aparece **Producción** ni **Pedidos de la tienda** | Tu plan no incluye ese módulo | Ver [Planes y facturación](/documentacion/cuenta/planes-y-facturacion) |
