---
title: Ajuste por inflación
summary: Cómo calcular el resultado por exposición a la inflación (RECPAM) de un período y emitir el asiento definitivo.
minutes: 6
roles: Dueño, Administrador, Contador externo
---

Con inflación, la plata que tenés en caja o en el banco y lo que te deben los clientes pierden valor mes a mes, y lo que vos debés también se "achica". Esa ganancia o pérdida se llama **RECPAM** (resultado por exposición a cambios en el poder adquisitivo de la moneda). Oplex la calcula por vos con el índice de precios oficial (IPC) y, cuando estás conforme, la registra con un asiento.

Está en **Contabilidad › Contabilidad**, pestaña **Ajuste por Inflación**.

## Antes de empezar

- Tenés que ser **Dueño** o **Administrador** para emitir el asiento. El contador externo puede calcular la vista previa.
- Revisá que las cuentas de Activo, Pasivo y Patrimonio estén bien clasificadas como **Monetaria** o **No monetaria** en la pestaña **Plan de Cuentas**, columna **Tipo de partida**. Por ejemplo, Caja, Bancos y Deudores por ventas son monetarias; Mercaderías y Bienes de uso no lo son. Si dudás, consultalo con tu contador.
- Oplex carga solo el índice de cada mes desde una fuente pública. Si el último mes todavía no se publicó, no vas a poder calcular hasta ese mes.

## Cómo calcula Oplex

Usa el método del activo y pasivo monetario neto. Toma el saldo de cada cuenta monetaria al empezar el período (valuado al mes de inicio) y reexpresa cada movimiento posterior con el índice de su propio mes. La diferencia entre el saldo nominal y el reexpresado es el aporte de esa cuenta al RECPAM.

## Pasos

1. Andá a **Contabilidad › Contabilidad** y abrí la pestaña **Ajuste por Inflación**.
2. Elegí el mes de inicio en **Desde** y el mes de cierre en **Hasta**. Por ejemplo, de enero a diciembre para un ejercicio anual.
3. Tocá **Calcular vista previa**. Todavía no se guarda nada.
4. Revisá el resultado. Arriba a la derecha ves el **RECPAM** y si es **Pérdida**, **Ganancia** o **Neutro**. La tabla muestra, por cuenta: **Apertura**, **Movimientos**, **Saldo nominal**, **Saldo reexpresado** y **Aporte al RECPAM**.
5. Si algo no te cierra, corregí la clasificación de las cuentas en **Plan de Cuentas** y volvé a tocar **Calcular vista previa**.
6. Cuando estés conforme, tocá **Emitir asiento definitivo**.
7. Oplex te pregunta **¿Confirmás? Es un asiento real e inmutable.** Tocá **Confirmar emisión**.

Al terminar ves **Asiento emitido - RECPAM** con el importe. El período queda en la lista **Ajustes ya emitidos**, con el **Período**, el **RECPAM** y la fecha en que se **Emitió**.

> [!NOTA]
> Si el RECPAM da exactamente $0,00, no se postea ningún asiento: Oplex sólo registra el período y te avisa **Período registrado - el RECPAM dio exactamente $0.00, no hizo falta postear ningún asiento.**

> [!IMPORTANTE]
> Un mismo período se emite una sola vez y el asiento no se puede borrar. Revisá bien la vista previa antes de confirmar.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Elegí el mes de inicio y el mes de cierre** | Falta completar **Desde** o **Hasta**. | Completá los dos meses. |
| **Falta cargar el índice de** (un mes) | El IPC de ese mes todavía no está disponible en Oplex, o hay un mes salteado en el rango. | Si el mes es reciente, esperá a que se publique el índice. Si es un mes viejo, escribí a soporte. |
| **No hay cuentas monetarias clasificadas - revisá "Tipo de partida" en Plan de Cuentas.** | Ninguna cuenta está marcada como **Monetaria**. | Marcá las cuentas monetarias en **Plan de Cuentas**. |
| **Ya se emitió el ajuste por inflación de este período** (con la fecha) **- no se emite dos veces.** | Ese mismo rango de meses ya se emitió. | No hace falta hacer nada. Lo ves en **Ajustes ya emitidos**. |
