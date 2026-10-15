---
title: Errores frecuentes con ARCA
summary: Todos los mensajes que puede mostrar Oplex al conectar con ARCA, al probar la conexión y al facturar, con la causa y qué hacer en cada caso.
minutes: 8
roles: Dueño, Administrador, Contador
---

Esta página junta en un solo lugar los mensajes que puede mostrar Oplex sobre ARCA. Buscá el texto que estás viendo (podés usar `Ctrl + F`) y seguí la columna **Qué hacer**. Los mensajes entre comillas son textuales; donde dice "…" va un dato tuyo (un CUIT, un número, una fecha).

> [!NOTA]
> Cuando el mensaje termina con **Detalle de ARCA:** y un texto técnico, ese detalle es lo que respondió ARCA tal cual. Si tenés que pedir ayuda, copiá el mensaje completo.

## Dónde mirar primero

En **Contabilidad › Conexión con ARCA**, la tarjeta de estado de arriba te dice qué paso falta:

| Casilla | Lo que dice | Qué significa |
|---|---|---|
| **Datos de la empresa** | **Falta CUIT o condición IVA** | Completá el [paso 1](/documentacion/arca/datos-de-la-empresa). |
| **Clave y pedido (CSR)** | **Sin generar** | Hacé el [paso 2](/documentacion/arca/clave-y-pedido-csr). |
| **Certificado cargado** | **Todavía no** | Falta el [paso 4](/documentacion/arca/subir-y-probar). |
| **Autorización a facturar** | **Sin probar** | Tocá **Probar conexión con ARCA** en el paso 4. |
| **Autorización a facturar** | **Falta autorizar "wsfe"** (en rojo) | Falta el paso 3.2. Tocá **Ver cómo hacerlo**. |
| **Autorización a facturar** | **ARCA rechazó la conexión** (en rojo) | Leé el mensaje rojo debajo de las casillas y buscalo en esta página. |

## Al cargar los datos y el certificado

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Esa constancia es del CUIT … y tu empresa tiene el …. Sacá la de tu empresa.** | Constancia de otro CUIT. | Consultá la constancia con el CUIT de tu empresa. |
| **No pudimos leer el CUIT de la constancia. Probá con otra foto o con el PDF.** | Imagen poco legible. | Subí el PDF o una foto nítida. |
| **Leímos tu constancia (…), pero no coincide con el padrón de ARCA en: …** | La constancia es vieja o hubo un cambio reciente en ARCA. | Revisá los datos que nombra antes de guardar; si dudás, sacá una constancia nueva. |
| **Cargá primero el CUIT de la empresa (paso 1).** | Generaste el pedido sin CUIT. | Guardá el paso 1. |
| **Ese archivo es el pedido (CSR), no el certificado. …** | Subiste el `.csr`. | Subí el certificado que descargaste de ARCA. |
| **Ese archivo es la clave privada. Acá va el certificado que te dio ARCA.** | Archivo en la zona equivocada. | Poné cada archivo en su zona. |
| **No reconocemos ese archivo como un certificado de ARCA.** | Archivo incompleto o equivocado. | Descargalo de nuevo de ARCA. |
| **Este certificado no corresponde al pedido que generó Oplex. …** | Se usó otro pedido en ARCA. | Llevá a ARCA el pedido actual del paso 2 y sacá el certificado de nuevo. |
| **El certificado es del CUIT … y la empresa tiene cargado …. ARCA rechazaría las facturas.** | Certificado de otra empresa. | En ARCA, elegí tu empresa al crear el certificado. |
| **Falta la clave privada: subila, o generala con Oplex en el paso 2.** | Falta el `.key`. | Subilo o usá **Generarlos con Oplex**. |
| **La clave privada no corresponde al certificado** | Clave y certificado no son pareja. | Usá la clave generada con el mismo pedido. |

## Al probar la conexión

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **✕ Sin autorización para facturar.** ARCA reconoce el certificado pero no lo tiene autorizado para "wsfe". | Falta el paso 3.2, o se autorizó otro servicio. | Hacé la relación con **Facturación Electrónica** ([producción](/documentacion/arca/certificado-produccion#3-2-autorizarlo-a-facturar)) o **wsfe - Facturación Electrónica** ([homologación](/documentacion/arca/certificado-homologacion#3-2-autorizarlo-a-facturar)). |
| **✕ No se pudo conectar.** Falta una sucursal con punto de venta. … | Ninguna sucursal activa tiene punto de venta. | Cargalo en **Sucursales** ([Punto de venta](/documentacion/arca/punto-de-venta)). |
| **✕ No se pudo conectar.** El punto de venta … de la sucursal "…" no está habilitado para Web Services en ARCA. … | Es un punto de venta de Comprobantes en línea, está mal escrito, dado de baja, o todavía no se habilitó (código **11002** de ARCA). | Usá uno de la lista **Puntos de venta habilitados para Web Services según ARCA**, o creá uno de Web Services. |
| **ARCA no informa ningún punto de venta habilitado para Web Services en este CUIT.** | No hay ninguno de Web Services, o es muy nuevo. | Creá uno en ARCA y probá más tarde. |
| **✕ No se pudo conectar.** ARCA no aceptó el certificado. Revisá que sea del ambiente elegido (homologación o producción) y que no esté vencido. | Certificado vencido, o la autorización se hizo en el otro ambiente. | Mirá la fecha en **Certificado cargado**. Si venció, [renovalo](/documentacion/arca/renovar-certificado). Si es de homologación, recordá que no sirve para producción. |
| **✕ No se pudo conectar.** No se pudo llegar a ARCA. Probá de nuevo en unos minutos. | Los servidores de ARCA no responden. | Esperá y volvé a probar. Pasa seguido en horarios de mucho uso y en vencimientos. |
| **ARCA ya entregó un ticket de acceso vigente para este certificado que Oplex no tiene guardado. Vence solo en unas horas (máximo 12); después de eso se normaliza.** | El mismo certificado se usó desde otro sistema hace poco. | Esperá unas horas y volvé a probar. No hace falta cambiar nada. |
| **Falta cargar el certificado o el CUIT de la empresa.** | Falta el paso 1 o el 4. | Completalos. |

## Al emitir una factura o nota de crédito

> [!NOTA]
> Si ARCA rechaza una factura, **no se guarda nada**: ni la factura, ni el movimiento de stock, ni el asiento. Corregí lo que dice el mensaje y volvé a tocar **Emitir factura**.

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **ARCA sin conectar** y **No podés emitir facturas todavía: falta el certificado de ARCA de tu empresa.** | No hay certificado cargado. | Tocá **Ir a Conexión con ARCA →** y completá los pasos. |
| **No podés emitir facturas todavía: el certificado de ARCA venció el ….** | Venció el certificado. | [Renovalo](/documentacion/arca/renovar-certificado). |
| **Antes de emitir, cargá tu condición frente al IVA en Contabilidad → Conexión con ARCA → Datos de la empresa** | Falta la condición de tu empresa. | Completá el [paso 1](/documentacion/arca/datos-de-la-empresa). |
| **Falta la condición frente al IVA del cliente "…": ARCA la exige para facturar a un CUIT.** | El cliente tiene CUIT pero no condición frente al IVA. ARCA la pide obligatoriamente. | Abrí el cliente, tocá **Editar empresa** y luego **Actualizar desde ARCA**, o cargá la condición a mano. Ver [Clientes](/documentacion/ventas/clientes). |
| **Tu empresa es Monotributo: sólo puede emitir Factura C, no …** / **Tu empresa es Responsable Inscripto: no puede emitir Factura C (corresponde A o B)** | La letra no corresponde a tu condición. | Revisá tu condición en el paso 1. Ver [La letra del comprobante](/documentacion/ventas/letra-del-comprobante). |
| **No se puede numerar el comprobante: ARCA informa como último autorizado el … en el punto de venta …, pero Oplex ya tiene registrado el …. Revisá que el certificado ARCA sea del ambiente correcto (homologación o producción).** | Oplex tiene facturas con ese número que ARCA no conoce: típico al pasar de homologación a producción usando el mismo punto de venta, o con datos cargados antes de conectar ARCA. | Revisá el ambiente del certificado. Si recién pasaste a producción, consultá con soporte antes de seguir. |
| **AFIP WSFE no autorizó el comprobante: [código] …** | ARCA rechazó la factura; el código y el texto explican por qué. | Ver [ARCA rechaza la factura](/documentacion/problemas/arca-rechaza-la-factura). |
| **No se pudo conectar con ARCA WSFE: …** | ARCA no responde. | Esperá unos minutos y volvé a emitir. |

## Comprobantes de ARCA que no están en Oplex

Si en **Ventas › Facturación** aparece el aviso **ARCA tiene 1 comprobante autorizado que no está en Oplex**, significa que en ese punto de venta ARCA autorizó un número que Oplex no tiene registrado (por ejemplo, alguien facturó desde otro sistema o desde Comprobantes en línea con ese mismo punto de venta). Oplex no se saltea ese número en silencio: te avisa.

1. Tocá **Revisar**.
2. Para cada comprobante elegí una de dos opciones:
   - **Anular con nota de crédito** (sólo en facturas): después confirmás con **Emitir nota de crédito**. Se emite en ARCA una nota de crédito por el mismo importe y al mismo cliente. Si estás en producción, es un comprobante fiscal real y no se puede deshacer: hacelo sólo si la venta no se hizo o ya se volvió a facturar con otro número.
   - **Marcar como resuelto**: no se emite nada en ARCA, sólo queda anotado el motivo: **La emitió otro sistema en este punto de venta**, **Era una prueba** u **Otro motivo** (en ese caso la nota es obligatoria). Confirmá con **Marcar como resuelto**.

> [!IMPORTANTE]
> Usá un punto de venta de Web Services **sólo** para Oplex. Si otro sistema factura con el mismo número, los comprobantes se mezclan.

## Para verificar una factura en ARCA

Cualquiera puede comprobar que una factura es válida en el servicio público **Constatación de comprobantes** de ARCA (https://serviciosweb.afip.gob.ar/genericos/comprobantes/cae.aspx), cargando los datos de la factura y su CAE, o escaneando el código QR impreso en el PDF.
