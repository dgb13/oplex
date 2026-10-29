---
title: Antes de empezar
summary: Qué necesitás tener a mano para conectar Oplex con ARCA, cuánto se tarda y el mapa completo de los pasos.
minutes: 5
roles: Dueño, Administrador
---

Para que Oplex emita facturas electrónicas con CAE, ARCA (la ex AFIP) tiene que saber que Oplex factura en nombre de tu empresa. Eso se logra con un **certificado digital**: un archivo que ARCA te da a vos, que vos autorizás para facturar y que después cargás en Oplex. Se hace una sola vez (y se renueva cuando vence). Este capítulo te lleva de la mano, pantalla por pantalla, aunque nunca hayas hecho algo así.

Todo se hace en **Conexión con ARCA**. Sólo lo ven el **Dueño** y los **Administradores** de la empresa.

## Antes de empezar

Tené a mano esta lista. Si te falta algo, conseguilo primero: te ahorra dar vueltas a mitad de camino.

- **Clave fiscal nivel 3 o superior** de quien representa a la empresa ante ARCA. Si sos monotributista o tenés una empresa unipersonal, es tu propia clave fiscal. Si es una sociedad (SRL, SA), es la clave fiscal de la persona que administra las relaciones de la sociedad en ARCA (normalmente el socio gerente o el presidente). Si tu clave es nivel 2, se sube a nivel 3 por internet o en una oficina de ARCA.
- **Tu condición frente al IVA**: Responsable Inscripto, Monotributo o Exento. Si no estás seguro, la ves en tu Constancia de Inscripción (en el paso 1 te mostramos cómo sacarla, no hace falta clave fiscal).
- **Una computadora** (no el celular): en ARCA vas a tener que elegir y descargar archivos.
- **Entre 15 y 20 minutos** sin apuro. La mitad del tiempo es dentro del sitio de ARCA.
- Ser **Dueño** o **Administrador** en Oplex.

> [!NOTA]
> Oplex nunca te pide tu clave fiscal. La usás vos, en el sitio de ARCA. A Oplex sólo le llega el certificado.

## El mapa: 6 etapas

Así se ve todo el recorrido. La pantalla de Oplex está dividida en 5 pasos numerados; las etapas 3 y 4 de este mapa son el paso 3 de la pantalla (3.1 y 3.2).

| Etapa | Dónde se hace | Qué lográs | Artículo |
|---|---|---|---|
| 1. Datos de la empresa | Oplex, paso 1 | CUIT, razón social, condición frente al IVA, domicilio, Ingresos Brutos | [Datos de la empresa](/documentacion/arca/datos-de-la-empresa) |
| 2. Clave y pedido (CSR) | Oplex, paso 2 | Un archivo de "pedido de certificado" para llevar a ARCA | [Clave privada y pedido de certificado](/documentacion/arca/clave-y-pedido-csr) |
| 3. Certificado en ARCA | Sitio de ARCA, paso 3.1 | ARCA te devuelve el certificado | [Certificado de producción](/documentacion/arca/certificado-produccion) |
| 4. Autorizarlo a facturar | Sitio de ARCA, paso 3.2 | El certificado queda habilitado para Facturación Electrónica (wsfe) | [Certificado de producción](/documentacion/arca/certificado-produccion) |
| 5. Subirlo y probar | Oplex, paso 4 | Oplex confirma que ARCA lo acepta | [Subir el certificado y probar la conexión](/documentacion/arca/subir-y-probar) |
| 6. Punto de venta | Sitio de ARCA + Oplex, paso 5 | El número de punto de venta "Web Services" cargado en tu sucursal | [Punto de venta](/documentacion/arca/punto-de-venta) |

> [!IMPORTANTE]
> Si hoy facturás desde "Comprobantes en línea" o "Factura en línea", ese punto de venta **no sirve** para Oplex: en la etapa 6 vas a crear uno nuevo, de Web Services. El que tenés lo seguís usando igual.

![Tarjeta de estado de Conexión con ARCA](/ayuda/capturas/arca-estado.jpg)

Arriba de la pantalla vas a ver una tarjeta de estado con cinco casillas: **Datos de la empresa**, **Clave y pedido (CSR)**, **Certificado cargado**, **Autorización a facturar** y **Punto de venta**. Cada una se tilda sola cuando ese paso queda listo. Cuando las cinco están tildadas, ya podés facturar.

## Producción u homologación: cuál te toca

ARCA tiene dos "ambientes" separados, y cada uno usa su propio certificado:

| | Producción | Homologación |
|---|---|---|
| Para qué sirve | Facturar de verdad | Probar sin consecuencias |
| Validez fiscal | Sí: las facturas valen y se informan | No: el CAE es de prueba |
| Dónde se saca el certificado en ARCA | **Administración de Certificados Digitales** | **WSASS - Autogestión Certificados Homologación** |
| Cómo se ve en Oplex | Etiqueta roja **Producción (facturas reales)** | Etiqueta ámbar **Homologación (pruebas)** |
| Artículo | [Certificado de producción](/documentacion/arca/certificado-produccion) | [Certificado de homologación](/documentacion/arca/certificado-homologacion) |

**Si querés facturar, andá directo a producción.** Es el camino normal y el que Oplex te propone por defecto. Homologación sirve si querés practicar antes, o si te lo pidió tu contador.

> [!IMPORTANTE]
> Los certificados de un ambiente no sirven en el otro. Un certificado de homologación no te deja emitir facturas reales, y al revés. Oplex reconoce solo de qué ambiente es el archivo que subís y te lo muestra antes de guardarlo.

La etiqueta de color que aparece arriba a la derecha de la tarjeta de estado sale del certificado cargado: si ves **Homologación (pruebas)**, todo lo que factures es de prueba.

## ¿Qué letra de factura vas a emitir?

Depende de tu condición frente al IVA. Lo vas a ver confirmado en el paso 1.

| Tu condición | Facturas que emitís | Tipo de punto de venta en ARCA |
|---|---|---|
| Responsable Inscripto | **A** a otro Responsable Inscripto, **B** al resto (consumidor final, monotributista, exento) | RECE para aplicativo y web services |
| Monotributo | Siempre **C** | Factura Electrónica - Monotributo - Web Services |
| Exento | Siempre **C** | RECE para aplicativo y web services |

Más detalle en [La letra del comprobante](/documentacion/ventas/letra-del-comprobante).

## Si algo sale mal

Cada artículo del capítulo tiene su sección de errores, y están todos juntos en [Errores frecuentes con ARCA](/documentacion/arca/errores-arca).

> [!NOTA]
> Los nombres de los menús y botones del sitio de ARCA pueden cambiar sin aviso (por ejemplo, en algunos lugares todavía dice "AFIP"). Si algo no coincide exactamente, buscá el nombre más parecido.
