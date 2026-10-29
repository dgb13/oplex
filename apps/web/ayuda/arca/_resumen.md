---
title: Conexión con ARCA
summary: Certificado, autorización y punto de venta para facturar con CAE, en una página.
minutes: 2
roles: Dueño, Administrador
---

Para emitir facturas electrónicas con CAE, ARCA tiene que autorizar a Oplex con un **certificado digital** de tu empresa. Se hace una vez, en **Conexión con ARCA** (Dueño o Administrador), y lleva unos 15 a 20 minutos. Necesitás **clave fiscal nivel 3** y saber tu **condición frente al IVA**.

![Tarjeta de estado de Conexión con ARCA](/ayuda/capturas/arca-estado.jpg)

1. **Datos de la empresa (paso 1).** Subí tu Constancia de Inscripción y Oplex completa CUIT, razón social, condición frente al IVA, domicilio e Ingresos Brutos. Tocá **Guardar datos**.
2. **Clave y pedido (paso 2).** Con **Generarlos con Oplex**, tocá **Generar clave y pedido** y después **Descargar pedido**.
3. **Certificado en ARCA (paso 3.1).** En **Administración de Certificados Digitales**: **Agregar alias**, elegí el `.csr`, y descargá el certificado con **Ver** › **Descargar**. (Para pruebas sin validez fiscal se usa WSASS, en homologación.)
4. **Autorizarlo (paso 3.2).** En **Administrador de Relaciones de Clave Fiscal**: **Nueva Relación** › ARCA › WebServices › **Facturación Electrónica**, representante **Computador Fiscal** con tu alias, **Confirmar**.
5. **Subir y probar (paso 4).** Subí el certificado, revisá titular, ambiente y vencimiento, **Guardar certificado** y **Probar conexión con ARCA**.
6. **Punto de venta (paso 5).** El de "Comprobantes en línea" o "Factura en línea" no sirve: creá en ARCA uno de Web Services (Monotributo: "Factura Electrónica - Monotributo - Web Services"; RI y Exento: "RECE para aplicativo y web services"). Después tocá **Buscar mis puntos de venta en ARCA** y **Guardar y probar**: Oplex lo carga en tu sucursal.

Cuando vence el certificado, se repiten los pasos 2 a 4 (incluida la autorización).
