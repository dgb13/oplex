# Cómo conecto Oplex con ARCA (ex AFIP) para facturar

En **Contabilidad → Conexión con ARCA** (solo Dueño/Administrador) se hace todo lo fiscal, en pasos: primero los **datos de la empresa** (razón social, CUIT, condición frente al IVA, domicilio fiscal, Ingresos Brutos e inicio de actividades), después el **certificado** de ARCA. Oplex puede generar el pedido de certificado (CSR) para que lo subas a ARCA, y después recibe el certificado que ARCA te devuelve. Con el botón **Probar conexión** verificás que todo funcione.

La **condición frente al IVA** es obligatoria: sin ella no se puede facturar ni generar el PDF de una cotización, porque de eso depende la letra (A, B o C) y si se discrimina el IVA.

Mientras tengas un certificado de **homologación** (prueba), las facturas reciben un CAE de prueba sin validez fiscal. Para facturar en serio hace falta un certificado de **producción**, autorizado para factura electrónica, y un punto de venta del tipo "Web Services" dado de alta en ARCA.

Buscar los datos de una empresa por CUIT (para completar un cliente o proveedor) funciona aunque todavía no hayas cargado tu certificado: usa una conexión propia de Oplex.
