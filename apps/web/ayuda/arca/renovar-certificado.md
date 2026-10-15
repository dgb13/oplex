---
title: Renovar el certificado
summary: Qué hacer cuando el certificado de ARCA está por vencer - pedido nuevo, certificado nuevo, volver a autorizarlo y subirlo, sin dejar de facturar.
minutes: 10
roles: Dueño, Administrador
---

El certificado de ARCA tiene fecha de vencimiento. Cuando vence, Oplex no puede pedir CAE y no se puede facturar. La renovación es repetir los pasos 2 a 4 con un certificado nuevo; mientras tanto, **el certificado actual sigue funcionando**, así que podés hacerlo con tiempo y sin cortar la facturación.

## Cómo saber cuándo vence

- En **Contabilidad › Conexión con ARCA**, la casilla **Certificado cargado** dice, por ejemplo, *ferreterialosandes · vence 12/09/2028*.
- Al facturar, arriba de **Nueva factura** aparece la etiqueta **ARCA conectado** con la fecha: *(certificado vence 12/09/2028)*.
- Cuando faltan menos de 30 días, esa etiqueta se pone ámbar y agrega **· renovalo pronto**. Todavía podés facturar.
- Si ya venció, la etiqueta dice **ARCA sin conectar** y aparece el aviso **No podés emitir facturas todavía: el certificado de ARCA venció el …** con el enlace **Ir a Conexión con ARCA →**.

![Etiqueta de estado de ARCA en Nueva factura, con aviso de renovar pronto](/ayuda/capturas/arca-pill-factura.png)

> [!NOTA]
> La vigencia la decide ARCA y viene escrita en el propio certificado. Oplex muestra esa fecha; no hay un plazo fijo que tengas que calcular.

## Pasos

1. **Generá un pedido nuevo.** En **Contabilidad › Conexión con ARCA**, paso 2, con **Generarlos con Oplex** elegido, tocá **Generar clave y pedido** (o **Generar de nuevo**). Podés dejar el mismo nombre de certificado. Oplex te avisa: *El certificado que ya está cargado sigue funcionando: la clave nueva se usa recién cuando subas el certificado que ARCA emita para este pedido.*
2. **Descargá el pedido** con **Descargar pedido (ferreterialosandes.csr)**.
3. **Sacá el certificado nuevo en ARCA.** Repetí el [paso 3.1 de producción](/documentacion/arca/certificado-produccion#3-1-crear-el-certificado) con el pedido nuevo. Si ARCA no te deja repetir el alias, usá uno nuevo (por ejemplo `ferreterialosandes2`): en ese caso cambialo también en el paso 2 antes de generar.
4. **Volvé a autorizarlo a facturar.** Repetí el [paso 3.2](/documentacion/arca/certificado-produccion#3-2-autorizarlo-a-facturar): **Nueva Relación** con **Facturación Electrónica** y el Computador Fiscal nuevo.
5. **Subilo en el paso 4.** Elegí el archivo nuevo en **Certificado de ARCA**, revisá que **Vence** muestre la fecha nueva y tocá **Guardar certificado**. Reemplaza al anterior.
6. **Tocá Probar conexión con ARCA** y esperá el **✓ Conexión correcta.**

> [!IMPORTANTE]
> No te saltees el paso 4 de esta lista. Un certificado nuevo es, para ARCA, un "computador" nuevo: si no lo autorizás, la prueba dice **✕ Sin autorización para facturar.**

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Este certificado no corresponde al pedido que generó Oplex. …** | En ARCA usaste el pedido viejo. | Repetí el 3.1 con el pedido que descargaste hoy. |
| **✕ Sin autorización para facturar.** | Falta autorizar el certificado nuevo. | Hacé el 3.2 con el alias nuevo. |
| **No podés emitir facturas todavía: el certificado de ARCA venció el …** | Se pasó la fecha. | Hacé estos pasos cuanto antes; mientras no subas el nuevo no se puede facturar. |
