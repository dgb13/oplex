---
title: Subir el certificado y probar la conexión
summary: Paso 4 de Conexión con ARCA - subir a Oplex el certificado que te dio ARCA y comprobar que ARCA lo acepta, sin emitir ninguna factura.
minutes: 3
roles: Dueño, Administrador
---

Con el certificado descargado de ARCA, falta dárselo a Oplex. Antes de guardarlo, Oplex te muestra de quién es, de qué ambiente y cuándo vence, así no hay sorpresas. Después, con **Probar conexión con ARCA**, Oplex le pregunta a ARCA el último comprobante autorizado de cada punto de venta: si responde, está todo bien. La prueba **no emite nada**.

## Antes de empezar

- El archivo del certificado que bajaste en el paso 3 (por ejemplo `ferreterialosandes.crt`).
- Si elegiste **Ya tengo mis archivos** en el paso 2: también tu clave privada (archivo `.key`).
- Para que la prueba salga bien: al menos una sucursal con su punto de venta de Web Services cargado. Ver [Punto de venta](/documentacion/arca/punto-de-venta).

## Pasos

1. **Abrí el paso 4.** En **Contabilidad › Conexión con ARCA**, tocá **Subir el certificado**.
2. **Subí el certificado.** Arrastrá el archivo a la zona **Certificado de ARCA** o hacé clic ahí para elegirlo. Sirve cualquier nombre o extensión (.crt, .pem, .txt…): Oplex lo reconoce por su contenido.
3. **Fijate la clave privada.** Si generaste el pedido con Oplex, al lado ya dice **Clave privada · Guardada en Oplex (generada en el paso 2)**: no tenés que hacer nada. Si usaste tus archivos, subí la clave en la zona **Clave privada (.key)**.
4. **Revisá la vista previa.** Debajo aparecen cuatro datos del certificado:
   - **Titular**: el CUIT del certificado, con **✓ coincide** si es el de tu empresa.
   - **Ambiente**: **Producción ⚠ facturas reales** u **Homologación ✓ pruebas**.
   - **Nombre**: el alias, por ejemplo `ferreterialosandes`.
   - **Vence**: la fecha de vencimiento que trae el certificado.
5. **Tocá Guardar certificado.** Aparece **✓ Certificado guardado. Ahora probá la conexión.** y la casilla **Certificado cargado** de arriba se tilda con el alias y el vencimiento.
6. **Tocá Probar conexión con ARCA.** Mientras consulta dice **Probando con ARCA...**.
7. **Leé el resultado.** Si sale bien vas a ver, en verde: **✓ Conexión correcta.** seguido del último comprobante autorizado de cada punto de venta, por ejemplo *Último comprobante autorizado en el punto de venta 00003 (Casa Central): Factura B 00000000. Ya podés facturar.* La casilla **Autorización a facturar** se tilda con la fecha.

![Paso 4 con el certificado elegido y la vista previa de titular, ambiente, nombre y vencimiento](/ayuda/capturas/arca-paso4-vista-previa.jpg)

> [!NOTA]
> Oplex prueba con la letra que te corresponde: Factura **B** si sos Responsable Inscripto, Factura **C** si sos Monotributo o Exento. Un número 00000000 es normal si todavía no emitiste ninguna factura en ese punto de venta.

> [!IMPORTANTE]
> Si el **Ambiente** dice **Producción ⚠ facturas reales**, todo lo que factures desde ahora es real y se informa a ARCA.

## Cambiar o quitar el certificado

- Para reemplazarlo (por ejemplo al [renovarlo](/documentacion/arca/renovar-certificado) o al pasar de homologación a producción), subí el nuevo y tocá **Guardar certificado**: pisa al anterior.
- Para sacarlo, tocá **Quitar certificado cargado** (abajo a la derecha). Sin certificado no se puede facturar.

## Si algo sale mal

Al elegir el archivo:

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Ese archivo es el pedido (CSR), no el certificado. El certificado es lo que te devuelve ARCA en el paso 3.1.** | Subiste el `.csr` que generó Oplex. | Subí el archivo que descargaste de ARCA con **Ver** › **Descargar**. |
| **Ese archivo es la clave privada. Acá va el certificado que te dio ARCA.** | Subiste la clave en lugar del certificado. | Poné la clave en **Clave privada (.key)** y el certificado en **Certificado de ARCA**. |
| **No reconocemos ese archivo como un certificado de ARCA.** | El archivo está incompleto o no es un certificado. | Volvé a descargarlo de ARCA. Si lo copiaste de WSASS, revisá que tenga las líneas BEGIN y END. |
| **Ese archivo no es una clave privada (tiene que empezar con "-----BEGIN PRIVATE KEY-----").** | En la zona de la clave subiste otro archivo. | Elegí el `.key` que generaste junto con tu pedido. |
| **Titular … ✕ no coincide** | El certificado es de otro CUIT. | Sacá el certificado eligiendo tu empresa en ARCA (paso 3.1, punto 3). |
| **Este certificado no corresponde al pedido que generó Oplex. Usá el pedido del paso 2 en ARCA, o elegí "Ya tengo mis archivos" y subí también tu clave.** | En ARCA usaste un pedido viejo, o tocaste **Generar de nuevo** después de llevar el pedido. | Llevá a ARCA el pedido que muestra hoy el paso 2 y sacá el certificado otra vez. |

Al guardar:

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **El certificado es del CUIT … y la empresa tiene cargado …. ARCA rechazaría las facturas.** | El certificado es de otra empresa. | Sacalo de nuevo eligiendo tu empresa en ARCA, o corregí el CUIT en el [paso 1](/documentacion/arca/datos-de-la-empresa). |
| **Falta la clave privada: subila, o generala con Oplex en el paso 2.** | Elegiste "Ya tengo mis archivos" y no subiste la clave. | Subí el `.key`, o generá clave y pedido con Oplex y sacá el certificado de nuevo. |
| **La clave privada no corresponde al certificado** | La clave y el certificado no son pareja. | Subí la clave que se generó junto con el pedido que llevaste a ARCA. |
| **No se pudo guardar el certificado** | Falla momentánea. | Probá de nuevo. |

Al probar la conexión, los mensajes y qué hacer en cada caso están en [Errores frecuentes con ARCA](/documentacion/arca/errores-arca#al-probar-la-conexion). Los más comunes:

> [!ERROR]
> **✕ Sin autorización para facturar.** ARCA reconoce el certificado pero no lo tiene autorizado para "wsfe". Hacé el paso 3.2 y volvé a probar. Tocá **Ver paso 3.2**: Oplex te lleva directo a las instrucciones.

> [!ERROR]
> **✕ No se pudo conectar.** Falta una sucursal con punto de venta. Creala en Sucursales con el número de punto de venta de Web Services que diste de alta en ARCA y volvé a probar. Ver [Punto de venta](/documentacion/arca/punto-de-venta).
