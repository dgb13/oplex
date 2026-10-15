---
title: ARCA rechaza la factura
summary: Qué hacer cuando al tocar Emitir factura aparece un error de ARCA - cómo leer el mensaje, las causas más comunes y cómo volver a emitir.
minutes: 5
roles: Dueño, Administrador, Ventas, Contador
---

Cuando tocás **Emitir factura** (en **Ventas › Facturación** o en **Caja**), Oplex le pide el CAE a ARCA en ese momento. Si ARCA dice que no, la factura **no se emite** y Oplex te muestra el motivo en rojo, debajo de los totales. Acá te explicamos cómo leerlo y qué hacer.

> [!NOTA]
> Si ARCA rechaza, **no queda nada a medias**: la factura no se guarda, no se descuenta stock, no se genera asiento y el número no se pierde. Corregís y volvés a emitir con el mismo número.

## Pasos

1. **Leé el mensaje completo.** Los errores que vienen de ARCA empiezan así: **AFIP WSFE no autorizó el comprobante:** y siguen con uno o más códigos entre corchetes y su texto, por ejemplo `[10016] …`. El código es lo que más importa.
2. **Fijate si es un error de datos o de conexión.** Usá las tablas de abajo.
3. **Corregí y volvé a tocar Emitir factura.** No hace falta cargar todo de nuevo: la ventana sigue abierta con lo que cargaste.
4. **Si no lo podés resolver, copiá el mensaje completo** y mandáselo a tu contador o a soporte.

![Nueva factura con el mensaje de rechazo de ARCA en rojo debajo de los totales](/ayuda/capturas/problemas-rechazo-arca.jpg)

## Antes de llegar a ARCA: Oplex frena la factura

Estos avisos aparecen sin consultar a ARCA, para que no pierdas tiempo con una factura que ARCA rechazaría:

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **ARCA sin conectar** y **No podés emitir facturas todavía: falta el certificado de ARCA de tu empresa.** | No hay certificado cargado. | El Dueño o un Administrador tiene que hacer la [Conexión con ARCA](/documentacion/arca/antes-de-empezar). |
| **No podés emitir facturas todavía: el certificado de ARCA venció el …** | Venció el certificado. | [Renovar el certificado](/documentacion/arca/renovar-certificado). |
| **ARCA WSAA rechazó la solicitud: [ns1:cms.cert.untrusted] Certificado no emitido por AC de confianza** | El certificado cargado no lo emitió ARCA para ese ambiente: es de homologación (pruebas) y estás en producción, o al revés, o no es un certificado de ARCA. | Revisá el **Ambiente** del certificado en [Subir el certificado y probar la conexión](/documentacion/arca/subir-y-probar) y sacá el del ambiente correcto ([producción](/documentacion/arca/certificado-produccion)). |
| **Antes de emitir, cargá tu condición frente al IVA en Contabilidad → Conexión con ARCA → Datos de la empresa** | Tu empresa no tiene condición frente al IVA. | [Datos de la empresa](/documentacion/arca/datos-de-la-empresa). |
| **Falta la condición frente al IVA del cliente "…": ARCA la exige para facturar a un CUIT.** | El cliente tiene CUIT pero no condición frente al IVA. Desde la RG 5616 es obligatoria. | Abrí el cliente en **Ventas › Clientes**, tocá **Editar empresa** y **Actualizar desde ARCA**, o cargala a mano. |
| **Tu empresa es Monotributo: sólo puede emitir Factura C, no …** | Se eligió una letra que no te corresponde. | Elegí C. Ver [La letra del comprobante](/documentacion/ventas/letra-del-comprobante). |
| **Tu empresa es Responsable Inscripto: no puede emitir Factura C (corresponde A o B)** | Ídem. | Elegí A (cliente Responsable Inscripto) o B (el resto). |
| **Alícuota de IVA …% no reconocida por ARCA (0/10.5/21/27)** | Un artículo tiene un IVA que ARCA no acepta. | Corregí el IVA del artículo o de la línea. |
| **Moneda "…" no tiene un MonId de AFIP mapeado (sólo ARS/USD por ahora)** | Facturaste en una moneda que Oplex todavía no puede informar. | Facturá en pesos o en dólares. |

## Rechazos de ARCA más comunes

| Código o texto | Qué significa | Qué hacer |
|---|---|---|
| **[10016]** (el número o la fecha no es el próximo a autorizar) | Otro sistema emitió con ese punto de venta al mismo tiempo, o la factura tiene una fecha anterior a la última autorizada. | Volvé a emitir: Oplex toma de nuevo el último número de ARCA. Si se repite, revisá que nadie esté facturando con ese punto de venta desde otro lado. |
| **[11002]** (punto de venta no habilitado) | El punto de venta de la sucursal no es de Web Services. | Ver [Punto de venta](/documentacion/arca/punto-de-venta). |
| Mensajes sobre la **condición frente al IVA del receptor** | La condición del cliente no coincide con lo que ARCA tiene. | Abrí el cliente y tocá **Actualizar desde ARCA** para traer la condición correcta. |
| Mensajes sobre el **documento** o **CUIT del receptor** | El CUIT del cliente está mal o no existe. | Corregí el CUIT en la ficha del cliente. Si es consumidor final sin CUIT, facturale sin CUIT. |
| Mensajes sobre **importes** o **IVA** | Los totales no cierran para ARCA. | Revisá descuentos, precios con o sin IVA y alícuotas de las líneas. Si no encontrás el problema, mandá el mensaje a soporte. |

> [!NOTA]
> ARCA escribe sus mensajes en un lenguaje técnico, a veces sin tildes. Oplex los muestra tal cual para que puedas copiarlos y buscarlos.

## Errores de conexión

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **No se pudo conectar con ARCA WSFE: …** | Los servidores de ARCA no responden. | Esperá unos minutos y volvé a emitir. Pasa en días de vencimientos o cortes de ARCA. |
| **ARCA WSAA rechazó la solicitud: …** con "Computador no autorizado" o "notAuthorized" | El certificado no está autorizado a facturar. | Hacé el paso 3.2 de [Certificado de producción](/documentacion/arca/certificado-produccion#3-2-autorizarlo-a-facturar). |
| **ARCA ya entregó un ticket de acceso vigente para este certificado que Oplex no tiene guardado. …** | El mismo certificado se usó desde otro sistema. | Esperá unas horas (máximo 12) y volvé a intentar. |
| **No se puede numerar el comprobante: ARCA informa como último autorizado el … pero Oplex ya tiene registrado el …** | Mezcla de ambientes (homologación y producción) en el mismo punto de venta. | Revisá el ambiente del certificado en **Contabilidad › Conexión con ARCA**. Consultá con soporte. |

La lista completa de mensajes está en [Errores frecuentes con ARCA](/documentacion/arca/errores-arca).

## Cómo confirmar que una factura sí salió

Una factura emitida tiene **CAE**. Podés verificarla en el servicio público de ARCA **Constatación de comprobantes** (https://serviciosweb.afip.gob.ar/genericos/comprobantes/cae.aspx) o escaneando el QR del PDF.
