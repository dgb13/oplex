---
title: "Asistente: historial, permisos y acciones"
summary: Qué le preguntó cada persona al Asistente, de qué temas puede hablar con cada rol y qué acciones puede hacer por la web y por WhatsApp.
minutes: 6
roles: Dueño, Administrador
---

En **Preferencias › Asistente** controlás cómo trabaja el [Asistente de IA](/documentacion/equipo/asistente-ia) en tu empresa: ves todo lo que se le preguntó, decidís qué puede consultar cada rol y qué cosas puede hacer por vos.

Para abrirlo, tocá tu foto arriba a la derecha, elegí **Preferencias** y, en la tarjeta **Asistente de IA**, tocá **Configurar**. Sólo lo ven el **Dueño** y los **Administradores**.

## Historial

Una fila por cada pregunta de cualquier persona de la empresa, por la web o por WhatsApp: **Hora**, **Quién**, **Canal**, **Pedido**, **Qué hizo el asistente** y **Estado**. Con **Ver detalle** ves la conversación y qué datos consultó.

- Arriba tenés los números del día: **Consultas hoy**, **Acciones hechas hoy**, **Esperando “SÍ”**, **Bloqueadas por permisos hoy** y **Sin datos para responder hoy** (preguntas sobre datos que el Asistente todavía no sabe consultar).
- Con los botones **Todo**, **WhatsApp**, **Web**, **Sólo acciones** y **Bloqueadas** filtrás la lista.
- Si el Asistente hizo algo que se puede deshacer, la fila tiene el botón **Deshacer** (ver **Deshacer una acción**, más abajo).

> [!NOTA]
> El historial se guarda 12 meses. Cada acción del Asistente también queda en **Actividad**, con *(por el Asistente)* al lado.

## Temas por rol

Una tabla con los temas que el Asistente puede consultar (**Ventas y facturación**, **Deudas de clientes**, **Caja**, **Stock y precios**, **Costos y márgenes**, **Compras y proveedores** y **Ayuda de uso de Oplex**) y una columna por rol. Tocá una casilla para prender o apagar ese tema para ese rol. Se guarda solo.

- El **Dueño** y los **Administradores** siempre pueden consultar todo.
- Una casilla con **—** no se puede prender: ese rol no tiene acceso a ese módulo en Oplex, así que el Asistente tampoco. Pasá el mouse para ver el motivo.
- Si alguien pregunta por un tema que su rol no tiene, el Asistente le contesta que no tiene permiso, y la consulta aparece como **Bloqueada** en el Historial.
- **Ventas ve sólo sus propias ventas y clientes**: prendido, un vendedor sólo ve las ventas y las deudas de las facturas que emitió él.

> [!IMPORTANTE]
> El Asistente nunca puede ver más que lo que el rol de esa persona ya ve en Oplex. Acá sólo se puede quitar, nunca agregar.

### Canales

- **Asistente en la web**: apagado, desaparece el globito del Asistente en Oplex.
- **Asistente por WhatsApp**: apagado, el Asistente le contesta a quien le escriba que está desactivado en la empresa.

## Acciones

Además de responder, el Asistente puede **hacer** algunas cosas por vos. Cada acción tiene tres niveles:

| Nivel | Qué pasa |
|---|---|
| **Apagada** | No la hace. Si se la piden, explica que no está habilitada. |
| **Borrador** | Arma todo y te muestra un resumen. No hace nada hasta que confirmes con **Confirmar** (en la web) o respondiendo **SÍ** (en la web o por WhatsApp). |
| **Directa** | La hace en el momento. Sólo existe para cosas internas que se pueden deshacer. |

Debajo de cada acción, en **Pueden pedirla:**, elegís qué roles la pueden usar. El Dueño y los Administradores siempre pueden.

| Acción | Qué hace | Niveles |
|---|---|---|
| **Agendar recordatorio o tarea** | Lo agenda en la Agenda de quien lo pide, o como tarea para alguien del equipo (lo busca por nombre). | Apagada, Borrador o Directa |
| **Cargar cliente nuevo** | Lo da de alta con nombre o CUIT y contacto. Con CUIT, los datos fiscales salen de ARCA. Avisa si ya existe. | Apagada, Borrador o Directa |
| **Crear cotización** | Busca el cliente y los artículos, usa el precio de venta de cada uno y la deja numerada. Si se lo piden, la manda por correo en el mismo “SÍ”. | Apagada o Borrador |
| **Enviar una cotización por correo** | Manda una cotización ya armada, con su PDF, al email de la ficha del cliente. | Apagada o Borrador |
| **Mandar link de pago** | Genera el link de Mercado Pago por el saldo de una factura y se lo manda al cliente por correo. | Apagada o Borrador |
| **Preparar factura** | Arma la factura con cliente y artículos y te deja un link a **Nueva factura** con todo cargado, para revisarla y emitirla vos. | Apagada o Borrador |

> [!IMPORTANTE]
> El Asistente **nunca emite una factura en ARCA**. **Preparar factura** sólo la deja lista: la emite una persona desde **Nueva factura**, como siempre.

De entrada, sólo **Agendar recordatorio o tarea** viene prendida (en **Borrador**). Todo lo demás arranca **Apagado**: lo prendés vos cuando quieras.

### Cómo se confirma

- Si el Asistente encuentra más de un cliente, artículo o factura que coincide, te pregunta cuál. Nunca elige solo.
- El “SÍ” tiene que ser la palabra sola (“sí”, “dale”, “ok”). Si contestás “sí, pero cambiá la fecha”, lo toma como un pedido nuevo.
- Sólo puede confirmar la persona que lo pidió.
- Al confirmar, Oplex vuelve a revisar todo: si mientras tanto alguien apagó esa acción o la sacó para ese rol, no se hace.
- Si nadie confirma, la propuesta vence y no se hace nada.

### Topes

- **Cotización máxima por WhatsApp**: subtotal sin IVA. Si una cotización pedida por WhatsApp lo supera, el Asistente pide armarla desde la web. Vacío = sin tope.
- **Acciones por día**: de toda la empresa. Al llegar, el Asistente avisa y pide hacerlo a mano.
- **El “SÍ” vence a los (minutos)**: después, la propuesta queda sin hacer.

A la derecha, **Así se ve en WhatsApp** muestra un ejemplo de cómo responde según el nivel de **Agendar recordatorio o tarea**.

## Deshacer una acción

En el **Historial**, las acciones hechas que se pueden revertir tienen el botón **Deshacer**. Lo puede usar quien la pidió, el Dueño o un Administrador.

| Acción | Qué hace Deshacer |
|---|---|
| Recordatorio o tarea | Lo borra de la Agenda |
| Cliente nuevo | Lo desactiva (no lo borra, por si ya se usó en algún documento) |
| Cotización | La anula, si todavía no se le mandó al cliente |

Lo que ya le llegó a un cliente (un correo, un link de pago) no se puede deshacer.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| *No tenés permiso para consultar "…" con el asistente* | El rol de esa persona no tiene ese tema | Prendelo en **Temas por rol**, si corresponde |
| *El asistente en la web está desactivado en tu empresa* | Está apagado el canal web | Prendé **Asistente en la web** en **Canales** |
| *Esta persona no tiene habilitada esa acción* | La acción está apagada, o su rol no la puede pedir | Revisá la acción en **Acciones** |
| *Esa confirmación ya venció y no se hizo nada* | Pasó el tiempo del “SÍ” | Pedíselo de nuevo al Asistente |
| *La empresa llegó al tope de … acciones del asistente por día* | Se llegó a **Acciones por día** | Hacelo desde la web, o subí el tope |
| *No se pudo hacer: …* | El sistema rechazó la acción (por ejemplo, falta Mercado Pago o el email del cliente) | Leé el motivo, corregilo y volvé a pedirlo |
| Una casilla con **—** que no se puede prender | Ese rol no tiene acceso a ese módulo en Oplex | Es normal: el Asistente no puede ver más que el rol |
