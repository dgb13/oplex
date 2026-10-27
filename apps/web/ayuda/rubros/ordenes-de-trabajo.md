---
title: Órdenes de trabajo
summary: Registrar cada trabajo desde que entra hasta que se entrega, con comprobante de ingreso, presupuesto y factura.
minutes: 6
roles: Dueño, Administrador, Ventas
---

La orden de trabajo sigue cada trabajo de punta a punta: qué pidió el cliente, cómo vino, quién lo hace, para cuándo está prometido y en qué estado está. Desde la orden armás el presupuesto, imprimís el comprobante de ingreso y avisás al cliente por WhatsApp.

## Antes de empezar

- Necesitás el módulo **Órdenes de trabajo** prendido en **Rubro y módulos**. El nombre del documento sale de tu rubro: **Orden de trabajo** en un taller, **Orden de servicio** en un service, **Proyecto** en una carpintería. Lo podés cambiar (ver [Estados y aviso al cliente](/documentacion/rubros/estados-y-aviso)).
- Cargan y editan órdenes el **Dueño**, los **Administradores** y **Ventas**. **Solo lectura** las consulta.
- Con **Fichas del cliente** prendido, la orden se asocia a la ficha (el vehículo, el equipo) y queda en su historial.

## Cargar una orden

1. Andá a **Órdenes de trabajo** y tocá **+ Cargar orden de trabajo**. (También desde la ficha de un vehículo, con el cliente y el vehículo ya elegidos.)
2. Elegí el **cliente**.
3. Elegí su vehículo o equipo. Si todavía no lo cargaste, tocá **+ Cargar vehículo** sin salir de la orden.
4. En **Al ingresar**, actualizá los datos que cambian en cada visita (por ejemplo los kilómetros). Quedan guardados en la orden y en la ficha.
5. Escribí **¿Qué hay que hacer?** (obligatorio) y, si querés, **Cómo vino** (rayones, accesorios que dejó, lo que viste al recibirlo).
6. Elegí el **Responsable** y la fecha en **Prometido para**.
7. Tocá **Crear orden de trabajo**. Se abre la orden con su número (por ejemplo **OT-000001**) en el primer estado.

## La lista de órdenes

- Arriba, las pestañas **Abiertas**, **Cerradas** y **Todas**, y una pastilla por estado con cuántas órdenes abiertas hay en cada uno.
- En el buscador encontrás cualquier orden por número, por el dato principal de la ficha (la patente, el IMEI), por cliente o por el trabajo.
- La columna **Prometido** se pone en rojo con **· atrasada** cuando pasó la fecha y la orden sigue abierta.

![Lista de órdenes de trabajo abiertas por estado](/ayuda/capturas/rubros-ordenes.jpg)

## Dentro de la orden

- **Estados.** Arriba ves todos los pasos, con el actual marcado. **Pasar a "…"** avanza al siguiente; también podés tocar cualquier paso para ir directo. Cada cambio queda en el historial de abajo, con quién y cuándo. Ver [Estados y aviso al cliente](/documentacion/rubros/estados-y-aviso).
- **Comprobante de ingreso.** Imprime una hoja con el cliente, el vehículo o equipo, el trabajo pedido, cómo ingresó y lugar para las firmas. No es una factura.
- **Hoja de trabajo.** Imprime una hoja A4 para quien hace el trabajo, para dejar en el vehículo o el equipo (por ejemplo en el parabrisas). Lleva bien grande el número de orden y el dato principal (la patente, el IMEI), qué hay que hacer, cómo vino, para cuándo está prometido y el responsable. Abajo tiene renglones para completar a mano el trabajo realizado, los repuestos usados, las horas, la fecha en que terminó y lo que conviene avisarle al cliente. No lleva precios ni el teléfono del cliente.
- **El trabajo.** Podés corregir **Qué hay que hacer** y **Cómo vino**, cambiar el **Responsable** y **Prometido para**, y con **+ Agendar turno en la Agenda** reservar día y hora.
- **Presupuesto y factura.** Tocá **Armar presupuesto**: se abre la cotización con el cliente y el trabajo ya cargados. Sumá los repuestos y la mano de obra; los servicios que se cobran por hora se cargan con la cantidad de horas. Con **Ver presupuesto** lo mandás por WhatsApp o email.

## Facturar el trabajo

Cuando el cliente acepta, tocá **Ver presupuesto** y después **Convertir a factura**. La factura conserva los precios, los descuentos, el IVA y el detalle de cada línea del presupuesto. La orden la reconoce sola y muestra **Ver en Facturación**.

> [!NOTA]
> Si el cliente supera su límite de crédito, al facturar aparece un aviso con su saldo y su límite. Podés emitirla igual; el límite se cambia en la ficha del cliente.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
| --- | --- | --- |
| El módulo está apagado. | **Órdenes de trabajo** no está prendido. | Prendelo en tu foto › **Rubro y módulos**. |
| Elegí el cliente | No elegiste el cliente. | Buscalo y elegilo, o crealo en **Ventas › Clientes**. |
| Escribí qué hay que hacer | El campo **¿Qué hay que hacer?** está vacío. | Escribí el trabajo pedido. |
| El cliente no tiene teléfono cargado | No se puede armar el WhatsApp. | Cargá el teléfono en el cliente (tocá su nombre en la orden o en la ficha). |
