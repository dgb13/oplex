---
title: Glosario
summary: Qué significa cada término de ARCA, de impuestos y de Oplex que aparece en este manual, explicado en palabras simples.
minutes: 8
roles: Todos
---

Los términos que usan ARCA, los contadores y Oplex, explicados sin vueltas. Están en orden alfabético. Cuando un término tiene su artículo, va el enlace.

## A

### Administración de Certificados Digitales
Servicio del sitio de ARCA donde se crean los certificados de **producción**. Ahí cargás el pedido (CSR) y descargás el certificado. Ver [Certificado de producción](/documentacion/arca/certificado-produccion).

### Administrador de Relaciones de Clave Fiscal
Servicio de ARCA donde se dan permisos: adherir servicios a tu clave fiscal y autorizar a un certificado (Computador Fiscal) a usar Facturación Electrónica en nombre de tu empresa.

### Alias
El nombre que le ponés al certificado, sólo con letras y números (por ejemplo `ferreterialosandes`). En Oplex aparece como **Nombre del certificado**; en ARCA, como **Alias** (producción) o **Nombre simbólico** (homologación, WSASS). Tiene que ser el mismo en los dos lados.

### ARCA
Agencia de Recaudación y Control Aduanero, el organismo que reemplazó a la AFIP. En muchas pantallas y mensajes técnicos todavía dice "AFIP": es lo mismo.

## C

### CAE (Código de Autorización Electrónico)
El número que ARCA le asigna a cada factura electrónica cuando la aprueba. Una factura sin CAE no es válida. Oplex lo pide automáticamente al emitir y lo imprime en el PDF junto con su vencimiento y el código QR.

### Certificado digital
Archivo que ARCA te da para que un sistema (Oplex) pueda facturar en nombre de tu empresa. Funciona junto con una **clave privada** y tiene fecha de vencimiento. Hay certificados de **producción** y de **homologación**, y no son intercambiables. Ver [Antes de empezar](/documentacion/arca/antes-de-empezar).

### Clave fiscal
Tu contraseña para entrar al sitio de ARCA. Tiene niveles de seguridad: para certificados y relaciones hace falta **nivel 3 o superior**. Oplex nunca la pide.

### Clave privada
La "llave" secreta que hace funcionar el certificado. Se crea junto con el pedido (CSR). Si la generás con Oplex, queda guardada cifrada y nunca sale de Oplex. Sin la clave privada correcta, el certificado no sirve.

### Computador fiscal
Así llama ARCA a un sistema que factura por web services. Cuando autorizás tu certificado en el Administrador de Relaciones, lo elegís como representante de tipo **Computador Fiscal**.

### Comprobantes en línea / Factura en línea
Las páginas de ARCA para hacer facturas a mano, una por una. Sus puntos de venta **no sirven** para Oplex. Ver [Punto de venta](/documentacion/arca/punto-de-venta).

### Condición frente al IVA
Cómo está inscripta una persona o empresa ante ARCA respecto del IVA: **Responsable Inscripto**, **Monotributo**, **Exento** o **Consumidor Final** (entre otras). La tuya define qué letra de factura emitís; la del cliente, qué letra le corresponde. Desde la RG 5616, ARCA exige informar la del cliente al facturarle a un CUIT.

### Constancia de Inscripción
Documento público de ARCA con los datos fiscales de un CUIT: razón social, domicilio fiscal, impuestos, actividad. Los monotributistas tienen la "Constancia de Opción". Oplex la lee para completar tus datos. Ver [Datos de la empresa](/documentacion/arca/datos-de-la-empresa).

### Constatación de comprobantes
Servicio público de ARCA para verificar que una factura existe y que su CAE es válido.

### Consumidor Final
Una persona que compra para uso propio, sin CUIT o sin inscripción en IVA. Un Responsable Inscripto le hace Factura B.

### Cotización
En Oplex tiene dos sentidos. (1) Un **presupuesto** que le mandás a un cliente antes de venderle: está en **Ventas › Cotizaciones**. Ver [Cotizaciones](/documentacion/ventas/cotizaciones). (2) El **tipo de cambio** de una moneda (por ejemplo, el dólar): se configura en Preferencias, en **Monedas y Cotizaciones**.

### CSR (pedido de certificado)
Archivo con el que le pedís el certificado a ARCA (en inglés, Certificate Signing Request). Oplex lo genera en el paso 2 (`ferreterialosandes.csr`). No es secreto y no es el certificado: es el pedido. Ver [Clave privada y pedido de certificado](/documentacion/arca/clave-y-pedido-csr).

### CUIT
Clave Única de Identificación Tributaria: el número de 11 dígitos que identifica a una persona o empresa ante ARCA (por ejemplo 30-71589632-1).

## E

### Exento
Condición de quien no está alcanzado por el IVA. Emite Factura C y usa un punto de venta "RECE para aplicativo y web services".

## F

### F.3283
Formulario que muestra ARCA como constancia cuando autorizás un certificado (Computador Fiscal) a un servicio en el Administrador de Relaciones.

### Factura A, B y C
La letra depende de quién emite y quién recibe. Un **Responsable Inscripto** hace **A** a otro Responsable Inscripto (con el IVA discriminado, que el cliente puede computar) y **B** al resto. **Monotributo** y **Exento** hacen siempre **C**, sin IVA discriminado. Ver [La letra del comprobante](/documentacion/ventas/letra-del-comprobante).

### Facturación Electrónica (wsfe)
El servicio web de ARCA que autoriza facturas y les da CAE. Es el único que necesita Oplex. En producción aparece como **Facturación Electrónica**; en WSASS como **wsfe - Facturación Electrónica**.

## H

### Homologación
El ambiente de **pruebas** de ARCA. Las facturas reciben un CAE de prueba sin validez fiscal. Su certificado se saca en WSASS. En Oplex se ve con la etiqueta ámbar **Homologación (pruebas)**. Ver [Certificado de homologación](/documentacion/arca/certificado-homologacion).

## I

### IIBB (Ingresos Brutos)
Impuesto provincial sobre la facturación. Puede ser local (una provincia), **Convenio Multilateral** (varias provincias) o, en muchas provincias, un **Régimen Simplificado** para monotributistas. Tus datos de Ingresos Brutos salen impresos en la factura.

### IVA
Impuesto al Valor Agregado. Las alícuotas que acepta ARCA son 0 %, 10,5 %, 21 % y 27 %.

## L

### Libro IVA
Registro de todas las facturas de venta (IVA débito) y de compra (IVA crédito) de un período, que se usa para la declaración de IVA. En Oplex está en **Contabilidad › Impuestos**, pestaña **Libro IVA**. Ver [Libro IVA](/documentacion/contabilidad/libro-iva).

## M

### Monotributo
Régimen simplificado para pequeños contribuyentes: se paga una cuota mensual según la categoría. El monotributista emite siempre Factura C y usa un punto de venta "Factura Electrónica - Monotributo - Web Services".

## N

### Nota de crédito
Comprobante que anula total o parcialmente una factura (por una devolución, un descuento o un error). Lleva la misma letra que la factura y también tiene CAE. Ver [Nota de crédito](/documentacion/ventas/nota-de-credito).

## P

### Percepción
Un impuesto que el **vendedor** le cobra de más al cliente en la factura, a cuenta de un impuesto del cliente (por ejemplo, percepción de IIBB). Sólo lo hacen quienes fueron designados agentes de percepción. En Oplex se agrega en la factura con **+ Agregar percepciones / otros tributos**.

### Producción
El ambiente **real** de ARCA: las facturas tienen validez fiscal. Su certificado se saca en Administración de Certificados Digitales. En Oplex se ve con la etiqueta roja **Producción (facturas reales)**.

### Punto de venta
El número de cinco dígitos que va adelante de cada factura (`00003-00000125`). Se da de alta en ARCA, tiene que ser de tipo **Web Services** y en Oplex se carga en cada sucursal. Ver [Punto de venta](/documentacion/arca/punto-de-venta).

## R

### RECE para aplicativo y web services
El sistema que tienen que tener en ARCA los puntos de venta de Responsables Inscriptos y Exentos para facturar con Oplex.

### Remito
Documento que acompaña la mercadería cuando se entrega o se recibe; no es una factura y no lleva precios. En Oplex, al recibir mercadería de una orden de compra, cargás el número y la foto del remito del proveedor.

### Responsable Inscripto (RI)
Contribuyente inscripto en IVA: cobra IVA en sus ventas y descuenta el IVA de sus compras. Emite Factura A o B.

### Retención
Lo contrario de la percepción: el **comprador**, al pagar, se queda con una parte del importe a cuenta de un impuesto del vendedor y se la deposita a ARCA o a la provincia. Sólo lo hacen los agentes de retención. En Oplex las ves en **Contabilidad › Impuestos**, pestaña **Retenciones**, y en la ficha de cada cliente podés marcar si es agente de retención (**Retenciones (agente ARCA/ARBA)**).

### RG 5616
Resolución de ARCA que obliga a informar la condición frente al IVA del cliente en cada factura. Por eso Oplex te la pide en la ficha del cliente.

## S

### Sucursal
En Oplex, cada local o lugar desde donde facturás. Tiene su propio punto de venta de ARCA. Se crean en **Sucursales**.

## W

### Web Services
La forma en que un sistema como Oplex "habla" con ARCA de manera automática, sin que entres al sitio. Por eso el punto de venta tiene que ser de Web Services.

### WSASS
"WSASS - Autogestión Certificados Homologación": el servicio de ARCA para sacar certificados de **prueba**. Se adhiere con la clave fiscal de una persona.

### wsfe
Nombre técnico del servicio de Facturación Electrónica de ARCA. Si Oplex dice **Falta autorizar "wsfe"**, falta autorizar el certificado a ese servicio (paso 3.2).
