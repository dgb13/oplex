---
title: Configurar las cajas
summary: Dá de alta cada caja del mostrador con su sucursal y su depósito, renombrala, desactivala y activale el QR de Mercado Pago.
minutes: 3
roles: Dueño, Administrador
---

Una caja es cada puesto de cobro del mostrador (por ejemplo, *Caja 1 - Mostrador*). Cada una pertenece a una sucursal, que define el punto de venta de las facturas, y vende del stock de un depósito. Cada caja lleva su propio turno y su propio historial, independiente de las demás.

## Antes de empezar

- La condición frente al IVA de tu empresa cargada en [Datos de la empresa](/documentacion/arca/datos-de-la-empresa). Sin ella, la Caja no abre: muestra **Antes de usar el punto de venta, cargá tu condición frente al IVA**.
- Al menos una sucursal con su punto de venta, en **Sucursales** (ver [Punto de venta](/documentacion/arca/punto-de-venta)). Por ejemplo, *Casa Central*, PV 00003.
- Al menos un depósito (ver [Depósitos y movimientos](/documentacion/inventario/depositos-y-movimientos)).
- Para facturar desde la Caja, la conexión con ARCA lista: ver [Antes de empezar con ARCA](/documentacion/arca/antes-de-empezar).

## Crear una caja

1. **Abrí la administración de cajas.** Tocá tu foto o iniciales arriba a la derecha y elegí **Cajas (POS)**. También podés usar **Nueva caja** directamente en la pantalla **Caja**.
2. **Tocá Nueva caja.**
3. **Completá los datos.** **Nombre** (por ejemplo *Caja 1 - Mostrador*), **Sucursal** (*Casa Central*) y **Depósito** (*Depósito Central*): de ese depósito sale el stock de lo que se vende en esta caja.
4. **Tocá Crear caja.**

![Lista de Cajas (POS) con la columna QR Mercado Pago](/ayuda/capturas/caja-lista-cajas.jpg)

## Renombrar, activar o desactivar

En **Cajas (POS)** cada caja muestra **Nombre**, **Sucursal**, **Depósito**, **Estado** y **QR Mercado Pago**.

- **Renombrar:** tocá el lápiz al lado del nombre, escribí el nuevo y confirmá con el tilde (o `Enter`).
- **Activar o desactivar:** usá el interruptor de **Estado** (**Activa** / **Inactiva**). Una caja inactiva no aparece para abrir turnos, pero su historial se conserva.

## QR de Mercado Pago

En la columna **QR Mercado Pago**, el botón **Activar QR** le da a la caja su QR fijo para cobrar con Mercado Pago. Cuando está activo, el botón dice **QR activo**. El paso a paso está en [QR de Mercado Pago](/documentacion/caja/qr-mercado-pago).

## Elegir los colores del mostrador

En la pantalla **Caja** y en la de venta hay cuatro círculos de color: **Claro**, **Oscuro**, **Alto contraste** y **Esmeralda**. Cambian sólo cómo se ve la Caja en esa computadora; no tocan montos ni arqueos.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **No hay ninguna empresa con rol Sucursal todavía - creá una en Empresas primero.** | No hay sucursales. | Creá la sucursal con su punto de venta en **Sucursales**. |
| **Completá nombre, sucursal y depósito** | Falta algún dato. | Completá los tres campos. |
| **No tenés permiso para ver esta sección.** | Tu rol no administra cajas. | Pedíselo al Dueño o a un Administrador. |
