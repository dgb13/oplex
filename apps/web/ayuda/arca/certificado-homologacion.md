---
title: Certificado de homologación (pruebas)
summary: Paso 3 de Conexión con ARCA para probar sin validez fiscal - crear el certificado en WSASS y autorizarlo al servicio wsfe.
minutes: 10
roles: Dueño, Administrador
---

Homologación es el ambiente de pruebas de ARCA: las facturas que emitas reciben un CAE de prueba y **no tienen validez fiscal**. Sirve para practicar o para que tu contador revise cómo salen los comprobantes antes de facturar en serio. Si lo que querés es facturar, no hace falta pasar por acá: andá a [Certificado de producción](/documentacion/arca/certificado-produccion).

## Antes de empezar

- **Clave fiscal de una persona** (no la de la sociedad). WSASS se adhiere con la clave fiscal personal.
- El pedido (CSR) generado en el [paso 2](/documentacion/arca/clave-y-pedido-csr). Acá se **pega como texto**: en Oplex usá **Copiar pedido**.
- En Oplex, en el paso 3 **Obtener el certificado en ARCA**, tocá la opción **Homologación (pruebas)**. Ahí ves estos mismos pasos con tu alias y tu CUIT.

> [!NOTA]
> Las pantallas de ARCA de este artículo son ejemplos simplificados y pueden verse distintas.

## 3.1 · Crear el certificado

1. **Entrá a ARCA con tu clave fiscal y abrí WSASS - Autogestión Certificados Homologación.** Si no aparece, adherilo en **Administrador de Relaciones de Clave Fiscal** › **Adherir servicio** (con la clave fiscal de una persona, no la de la sociedad).
2. **Tocá Nuevo certificado.**
3. **Completá Nombre simbólico.** Poné el alias del paso 2, por ejemplo `ferreterialosandes`. Desde Oplex podés tocar **Copiar**.
4. **Pegá el pedido.** En **Solicitud de certificado** pegá el pedido que copiaste con **Copiar pedido**. Empieza con `-----BEGIN CERTIFICATE REQUEST-----` y termina con `-----END CERTIFICATE REQUEST-----`; tiene que ir completo.
5. **Tocá Crear DN y obtener certificado.** WSASS te muestra un texto largo que empieza con `-----BEGIN CERTIFICATE-----`.
6. **Guardá ese texto como archivo.** Copialo completo, pegalo en el Bloc de notas y guardalo como `ferreterialosandes.crt`. Ese es tu certificado de homologación.

![WSASS: Nuevo certificado (pantalla de ejemplo)](/ayuda/capturas/arca-sitio-wsass-nuevo-certificado.png)

## 3.2 · Autorizarlo a facturar

1. **En WSASS tocá Crear autorización de acceso.**
2. **En Nombre simbólico del DN elegí tu alias** (`ferreterialosandes`).
3. **En Servicio elegí wsfe - Facturación Electrónica.** Ojo: la lista trae muchos servicios parecidos.
4. **En CUIT representada dejá la de tu empresa** (por ejemplo `30715896321`).
5. **Tocá Crear autorización.** El mensaje de ARCA tiene que decir `SERVICIO=ws://wsfe`.

![WSASS: Crear autorización de acceso (pantalla de ejemplo)](/ayuda/capturas/arca-sitio-wsass-autorizacion.png)

Después seguí con [Subir el certificado y probar la conexión](/documentacion/arca/subir-y-probar). Cuando lo subas, la etiqueta de arriba va a decir **Homologación (pruebas)** en color ámbar.

> [!IMPORTANTE]
> Un certificado de homologación **nunca** sirve para facturar de verdad. Cuando quieras pasar a producción, tenés que sacar un certificado nuevo en Administración de Certificados Digitales ([Certificado de producción](/documentacion/arca/certificado-produccion)) y subirlo en el paso 4: reemplaza al de pruebas.

## Pasar de homologación a producción

1. En el paso 2, generá un pedido nuevo con **Generar clave y pedido** (si ya generaste uno que todavía no usaste, el botón dice **Generar de nuevo**). Podés repetir el mismo alias. Descargalo con **Descargar pedido**.
2. Hacé el [certificado de producción](/documentacion/arca/certificado-produccion) (3.1 y 3.2).
3. Subilo en el paso 4 y tocá **Probar conexión con ARCA**.
4. Si en Facturación aparece el aviso **ARCA tiene … comprobantes autorizados que no están en Oplex** después del cambio, revisá [Errores frecuentes con ARCA](/documentacion/arca/errores-arca#comprobantes-de-arca-que-no-estan-en-oplex).

> [!NOTA]
> Las facturas de prueba que hayas emitido en homologación quedan en Oplex. No tienen validez fiscal.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| No aparece **WSASS** en tus servicios | No está adherido, o entraste con la clave de la sociedad. | Entrá con tu clave fiscal personal y adherilo en Administrador de Relaciones de Clave Fiscal. |
| WSASS rechaza la solicitud | El pedido se pegó incompleto. | En Oplex tocá **Copiar pedido** otra vez y pegalo entero, con las líneas BEGIN y END. |
| En Oplex: **✕ Sin autorización para facturar.** | Falta la autorización o se eligió otro servicio. | Hacé el 3.2 eligiendo **wsfe - Facturación Electrónica**. |
| En Oplex: **ARCA no aceptó el certificado. Revisá que sea del ambiente elegido (homologación o producción) y que no esté vencido.** | Mezcla de ambientes. | Revisá que el certificado y su autorización sean ambos de homologación. |
