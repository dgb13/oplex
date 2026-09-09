# Cómo configuro AFIP y otras preferencias del tenant

En **Preferencias** (menú de usuario, solo Dueño/Administrador) se carga el certificado y clave de AFIP para poder emitir facturas electrónicas reales con CAE - es un dato por empresa, cifrado, nadie más lo puede ver. Sin certificado cargado, las facturas se siguen generando pero sin validez fiscal real.

Ahí mismo se configura la condición de IVA propia del tenant (afecta qué letra de factura corresponde), el remitente de los emails que manda el sistema, y el checklist de "primeros pasos" que ve un usuario nuevo.

La búsqueda de datos fiscales por CUIT (padrón de AFIP) es una integración distinta a la de emitir facturas - tener una configurada no habilita automáticamente la otra.
