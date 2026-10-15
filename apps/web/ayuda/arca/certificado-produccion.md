---
title: Certificado de producción
summary: Paso 3 de Conexión con ARCA para facturar de verdad - crear el certificado en Administración de Certificados Digitales y autorizarlo a Facturación Electrónica.
minutes: 10
roles: Dueño, Administrador
---

Este es el paso central: entrás al sitio de ARCA con tu clave fiscal, le das el pedido que generó Oplex y ARCA te devuelve el **certificado** (3.1). Después le das permiso a ese certificado para emitir facturas electrónicas (3.2). Son dos trámites distintos dentro de ARCA y **hacen falta los dos**.

## Antes de empezar

- **Clave fiscal nivel 3 o superior** del titular. En una sociedad, la de quien administra sus relaciones en ARCA.
- El archivo del pedido, por ejemplo `ferreterialosandes.csr`, que descargaste en el [paso 2](/documentacion/arca/clave-y-pedido-csr).
- El nombre del certificado (alias) que elegiste en el paso 2, por ejemplo `ferreterialosandes`.
- Dejá Oplex abierto en otra pestaña, en **Contabilidad › Conexión con ARCA**, paso 3 **Obtener el certificado en ARCA**, con la opción **Producción (facturas reales)** elegida (es la que viene marcada). Ahí ves los mismos pasos con tu alias y un botón **Copiar**.

![Paso 3 de Oplex con la opción Producción elegida](/ayuda/capturas/arca-paso3-produccion.jpg)

> [!NOTA]
> Las pantallas de ARCA de este artículo son ejemplos simplificados. El sitio de ARCA cambia seguido y en algunos lugares todavía dice "AFIP": si un nombre no coincide exacto, buscá el más parecido.

## 3.1 · Crear el certificado

1. **Entrá a ARCA con tu clave fiscal.** Ingresá con tu CUIT (el personal, si es una sociedad) y tu clave fiscal.
2. **Abrí el servicio Administración de Certificados Digitales.** Buscalo en tus servicios. Si no aparece, primero hay que adherirlo (ver más abajo [Si el servicio no aparece](#si-el-servicio-no-aparece)).
3. **Elegí tu empresa.** Si representás a más de un contribuyente, ARCA te pregunta con cuál vas a trabajar. Elegí la empresa que va a facturar (en el ejemplo, FERRETERIA LOS ANDES SRL).
4. **Tocá Agregar alias.**
5. **Completá Alias.** Escribí exactamente el nombre del paso 2: `ferreterialosandes`. Desde Oplex podés tocar **Copiar** y pegarlo.
6. **Elegí el archivo del pedido.** En **Archivo**, buscá `ferreterialosandes.csr` (normalmente en la carpeta Descargas).
7. **Tocá Agregar alias.** ARCA crea el certificado y vuelve a la lista de alias, donde ahora aparece `ferreterialosandes`.
8. **Descargá el certificado.** En la lista, tocá **Ver** al lado del alias y después **Descargar**. Se baja un archivo, por ejemplo `ferreterialosandes.crt` (el nombre y la extensión pueden variar; no importa). Ese archivo es el **certificado** que vas a subir en el paso 4.

![Administración de Certificados Digitales: Agregar alias (pantalla de ejemplo)](/ayuda/capturas/arca-sitio-certificados-agregar-alias.png)

> [!IMPORTANTE]
> No confundas los archivos: el `.csr` es el **pedido** que vos le diste a ARCA; el que ARCA te devuelve en el paso 8 es el **certificado**. A Oplex se sube el certificado.

## 3.2 · Autorizarlo a facturar

Ahora ARCA ya conoce tu certificado, pero todavía no lo deja facturar. Hay que crear una "relación" que diga: este certificado (en ARCA lo llaman **Computador Fiscal**) puede usar el servicio de **Facturación Electrónica** en nombre de tu empresa.

1. **Volvé al menú de ARCA y abrí Administrador de Relaciones de Clave Fiscal.**
2. **Elegí tu empresa** como contribuyente representado, igual que en 3.1.
3. **Tocá Nueva Relación.**
4. **Elegí el servicio.** Tocá **Buscar** y navegá: **ARCA** (puede decir AFIP) › **WebServices** › **Facturación Electrónica**.
5. **Elegí el representante.** En **Representante** tocá el **segundo** botón **Buscar**. En el tipo, elegí **Computador Fiscal**, y en la lista elegí tu alias, `ferreterialosandes`.
6. **Tocá Confirmar.** ARCA te muestra el formulario **F.3283**: es la constancia de que la autorización quedó hecha. Podés imprimirlo o guardarlo, no hace falta subirlo a Oplex.

![Administrador de Relaciones: nueva relación con Facturación Electrónica y Computador Fiscal (pantalla de ejemplo)](/ayuda/capturas/arca-sitio-relaciones-nueva.png)

> [!IMPORTANTE]
> Si te salteás el 3.2, el certificado se sube bien a Oplex pero la prueba de conexión dice **✕ Sin autorización para facturar.** y no vas a poder emitir.

Listo. Seguí con [Subir el certificado y probar la conexión](/documentacion/arca/subir-y-probar).

## Si el servicio no aparece

Si en tus servicios de ARCA no está **Administración de Certificados Digitales**, hay que agregarlo una vez:

1. Abrí **Administrador de Relaciones de Clave Fiscal**.
2. Tocá **Adherir servicio**.
3. Navegá: **ARCA** › **Servicios interactivos** › **Administración de Certificados Digitales**.
4. Confirmá. Salí de ARCA, volvé a entrar y el servicio ya aparece.

## Según tu condición frente al IVA

El trámite del certificado es **igual** para Responsable Inscripto, Monotributo y Exento: el servicio a autorizar es siempre **Facturación Electrónica**. Lo que cambia es el tipo de punto de venta que vas a necesitar; eso está en [Punto de venta](/documentacion/arca/punto-de-venta).

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| No encontrás **Administración de Certificados Digitales** ni **Administrador de Relaciones de Clave Fiscal** | Tu clave fiscal es nivel 2, o el servicio no está adherido. | Subí la clave a nivel 3 y adherí el servicio ([ver arriba](#si-el-servicio-no-aparece)). |
| ARCA rechaza el archivo al agregar el alias | Elegiste otro archivo, no el `.csr` del paso 2. | Volvé a descargar el pedido desde Oplex con **Descargar pedido** y elegí ese. |
| ARCA dice que el alias ya existe | Ya habías creado un certificado con ese nombre. | Usá ese alias existente (bajá su certificado si fue con este mismo pedido), o volvé al paso 2, poné otro nombre y tocá **Generar de nuevo**. |
| En el 3.2 no aparece tu alias en la lista de Computador Fiscal | El 3.1 no terminó, o elegiste otra empresa. | Revisá en Administración de Certificados Digitales que el alias esté creado para la misma empresa. |
| En Oplex: **✕ Sin autorización para facturar.** | Falta el 3.2 o se autorizó otro servicio. | Hacé el 3.2 eligiendo **Facturación Electrónica** y volvé a probar. |
