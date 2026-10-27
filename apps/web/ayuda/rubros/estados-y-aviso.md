---
title: Estados y aviso al cliente
summary: Los pasos de cada orden de trabajo, cuál avisa al cliente por WhatsApp, cuál la cierra, a cuál pasa sola cuando el cliente responde el presupuesto y cómo cambiarlos.
minutes: 4
roles: Dueño, Administrador
---

Cada orden de trabajo pasa por estados: los pasos de tu trabajo, desde que entra hasta que se entrega. Vienen armados según tu rubro y los podés cambiar. En un taller mecánico son **Recibido**, **Diagnóstico**, **Esperando aprobación**, **Presupuesto rechazado**, **En reparación**, **Listo para retirar** y **Entregado**.

## Antes de empezar

- Cambian los estados el **Dueño** y los **Administradores**, en tu foto › **Rubro y módulos**, sección **Tus órdenes de trabajo** (aparece con el módulo prendido).
- Hay dos marcas por estado:
  - **Avisa al cliente**: en ese estado la orden muestra el botón **Avisar por WhatsApp**.
  - **Cierra la orden**: al llegar ahí la orden sale de las **Abiertas**. Tiene que haber al menos uno.

## Avisar al cliente por WhatsApp

1. Cuando la orden llega a un estado que avisa (por ejemplo **Listo para retirar**), aparece **Avisale al cliente que está listo**.
2. Tocá **Avisar por WhatsApp**. Se abre WhatsApp con el mensaje armado para el teléfono del cliente, por ejemplo: *Hola Martín Sosa, tu vehículo AB123CD ya se puede retirar. — Taller del Ejemplo*.
3. Revisalo y mandalo desde WhatsApp.

> [!NOTA]
> Oplex no manda el mensaje solo: abre WhatsApp con el texto listo para que lo envíes vos. El mensaje sale del número del teléfono o la computadora donde lo abrís.

## Cuando el cliente responde el presupuesto

Si la orden tiene un presupuesto vinculado, cambia de estado sola cuando marcás la respuesta del cliente en el presupuesto:

- **Lo acepta:** pasa al estado de trabajo (en un taller, **En reparación**). Si la orden ya estaba más adelante (por ejemplo **Listo para retirar**), no vuelve atrás.
- **Lo rechaza:** pasa a **Presupuesto rechazado**. Si te quedás con el vehículo o el equipo (taller, service), la orden sigue abierta hasta que el cliente lo retira: el botón te ofrece **Pasar a "Entregado"**. En los rubros sin nada que devolver (obras, proyectos, reservas, viajes), **Presupuesto rechazado** cierra la orden.

En la orden, **Presupuesto rechazado** aparece aparte, con borde rojo punteado: es un desvío, no un paso más del camino. También lo podés elegir a mano. Si el cliente cambia de idea, tocá **Armar otro presupuesto** en la orden.

Qué estado recibe cada respuesta se elige en **Tus órdenes de trabajo**, abajo de la tabla, en **Cuando el cliente responde el presupuesto**: **Si lo acepta, pasa a** y **Si lo rechaza, pasa a**. Con **No cambia sola**, el estado lo cambiás vos.

## Cambiar los estados

1. En **Tus órdenes de trabajo**, cambiá **Cómo se llama el documento** si tu negocio usa otro nombre (por ejemplo "Orden de servicio" o "Presupuesto de obra").
2. En la tabla, cambiá el nombre de cada estado y tildá **Avisa al cliente** o **Cierra la orden**.
3. Con las flechas cambiás el orden de los pasos.
4. Con **+ Agregar estado** sumás uno nuevo (por ejemplo **Esperando repuesto**).
5. Abajo, en **Cuando el cliente responde el presupuesto**, elegí a qué estado pasa la orden si el cliente lo acepta y si lo rechaza.
6. Si un estado ya no lo usás, tocá **Desactivar**: deja de ofrecerse, pero las órdenes que pasaron por él conservan su historial. **Activar** lo vuelve a poner.
7. Tocá **Guardar estados**.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
| --- | --- | --- |
| No aparece **Avisar por WhatsApp**. | El estado actual no tiene tildado **Avisa al cliente**. | Tildalo en **Tus órdenes de trabajo**, o pasá la orden al estado que avisa. |
| El cliente no tiene teléfono cargado | El cliente no tiene teléfono. | Cargalo en la ficha del cliente. |
| Marcá al menos un estado que cierre la orden (ej. Entregado) | Ningún estado activo tiene **Cierra la orden**. | Tildalo en el último paso. |
| El primer estado no puede cerrar la orden | El primer paso tiene **Cierra la orden**. | Destildalo o mové ese estado más abajo. |
| Tiene que haber al menos dos estados activos | Desactivaste casi todos. | Activá o agregá otro estado. |
| Marcá un solo estado para cuando el cliente acepta (o rechaza) el presupuesto | Hay dos estados con la misma respuesta. | Elegí uno solo en **Cuando el cliente responde el presupuesto**. |
| Rechazaron el presupuesto y la orden no cambió | La orden no tiene ese presupuesto vinculado, o está en **No cambia sola**. | Armá el presupuesto desde la orden (**Armar presupuesto**) y elegí el estado en **Si lo rechaza, pasa a**. |
