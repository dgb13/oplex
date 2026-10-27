---
title: Preferencias
summary: Todo lo que se configura en Preferencias: documentos, emails a clientes, monedas, PDF de la factura, retenciones, remarca, reposición automática y el Asistente de IA.
minutes: 7
roles: Dueño, Administrador
---

**Preferencias** reúne la configuración general de tu empresa en Oplex: cómo se ven tus documentos, desde qué dirección salen los emails a tus clientes, las monedas y algunas reglas de inventario y compras. Lo que cambies acá vale para todo el equipo.

Para abrirlo, tocá tu foto arriba a la derecha y elegí **Preferencias**. Sólo lo ven el **Dueño** y los **Administradores**.

> [!NOTA]
> Los datos fiscales (razón social, CUIT, condición frente al IVA, domicilio, Ingresos Brutos e inicio de actividades) y el certificado de ARCA **no están acá**: van en **Conexión con ARCA**. Ver [Antes de empezar](/documentacion/arca/antes-de-empezar).

La pantalla tiene estas tarjetas, en este orden:

## Tu empresa en los documentos

Logo, nombre de fantasía, color de marca, teléfono, email, sitio web, datos para transferir (con una casilla para cotizaciones y otra para facturas) y las condiciones con las que arranca cada cotización. Está explicada paso a paso en [Tu empresa en los documentos](/documentacion/primeros-pasos/tu-empresa-en-los-documentos).

## Remitente de emails a clientes

Define desde qué dirección les llegan a tus clientes los emails que manda Oplex (facturas, cotizaciones, recordatorios de cobranza).

- **Compartido Oplex**: los emails salen desde una dirección de Oplex. No hay que configurar nada.
- **Dominio propio (recomendado)**: los emails salen desde tu dominio, por ejemplo facturas@ferreterialosandes.com.ar. Llegan mejor y tus clientes reconocen el remitente.

Para usar tu dominio:

1. **Elegí Dominio propio (recomendado).**
2. **Completá los datos.** **Dominio** (ferreterialosandes.com.ar), **Usuario** (facturas) y **Nombre para mostrar** (Facturación Los Andes). Debajo ves cómo va a quedar el **Remitente final**.
3. **Tocá Generar registros DNS.** Aparece una tabla con los registros (**Tipo**, **Nombre**, **Valor**) que hay que cargar en la configuración DNS de tu dominio. Si no sabés hacerlo, pasáselos a quien te administra la página web o el dominio.
4. **Tocá Verificar ahora** cuando ya estén cargados. El **Estado del dominio** pasa a **Verificado**. Los cambios de DNS pueden tardar varias horas en verse.
5. **Tocá Guardar cambios.**

> [!NOTA]
> Mientras el dominio no esté verificado, los emails a clientes se siguen enviando desde el remitente compartido de Oplex.

En la misma tarjeta elegís:

- **Tono del recordatorio de facturas vencidas**: **Amigable**, **Neutral** o **Firme**. Debajo ves un ejemplo del texto.
- **Email para copia (CC) del recordatorio de cobranza**: opcional. Cada recordatorio que le llega al cliente también le llega en copia a ese buzón (por ejemplo, cobranzas@ferreterialosandes.com.ar).

Tocá **Guardar cambios** para que se apliquen.

## Monedas y Cotizaciones

Sirve si vendés o comprás en otra moneda además del peso.

1. **Revisá la Moneda base.** Arriba dice cuál es (normalmente ARS, el peso). Todo se convierte a esa moneda.
2. **Agregá una moneda.** Tocá **+ nueva moneda**, escribí el **Código (ISO)** (USD) y el **Nombre** (Dólar estadounidense) y tocá **Crear**.
3. **Cargá la cotización.** En la fila de la moneda escribí el valor en **Cotización manual** y tocá **Guardar**. Para el dólar también podés tocar **Sincronizar con Banco Nación** y Oplex trae la cotización del día.
4. **Mirá el historial.** Con **Ver historial** ves las cotizaciones anteriores, por fecha.

> [!IMPORTANTE]
> No cambies la moneda base (**Marcar como base**) una vez que empezaste a facturar, salvo que tu contador te lo indique: cambia la moneda en la que se expresa todo.

## Mercado Pago

La conexión con Mercado Pago ahora tiene su propia sección en el menú. En Preferencias queda la tarjeta **Mercado Pago** con el botón **Ir a Mercado Pago**. Ver [Mercado Pago](/documentacion/ventas/mercado-pago).

## PDF de la Factura

El **Papel por defecto** (**A4**, **A5** o **Ticket**) y el **Estilo (A4 y A5)**: **Moderno**, **Compacto**, **Tradicional**, **Natural** o **Letras grandes**. Se guarda apenas lo elegís y es una preferencia de tu usuario. Ver [El PDF de la factura](/documentacion/ventas/pdf-de-la-factura).

## Retenciones a proveedores

Tildá sólo los impuestos para los que ARCA, ARBA u otro organismo provincial ya te nombró **agente de retención**:

- **Somos agentes de retención de Ganancias**
- **Somos agentes de retención de IVA**
- **Somos agentes de retención de Ingresos Brutos (IIBB)**

Cada casilla se guarda al tildarla. Habilita los regímenes en **Impuestos › Retenciones** y la opción de retener al registrar un pago en Compras. Ver [Impuestos y vencimientos](/documentacion/contabilidad/impuestos-y-vencimientos).

> [!IMPORTANTE]
> No las tildes "por las dudas": ser agente de retención lo decide el organismo, no vos. Si no estás seguro, consultalo con tu contador.

## Precios de Inventario

El **% de remarca** sugerido para los artículos que no tienen uno propio. Escribilo (por ejemplo, 40) y tocá **Guardar**. Sólo completa el precio de venta sugerido al cargar o editar un artículo: nunca cambia precios solo. Ver [Precios, costos e IVA](/documentacion/inventario/precios-costos-iva).

## Reposición automática de stock

Todos los días, a la madrugada, Oplex genera un pedido de cotización por proveedor para los artículos marcados como **Automático** en Inventario que quedaron bajo el mínimo. Con **Ejecutar reposición ahora** lo corrés en el momento, sin esperar a la madrugada. Ver [Stock mínimo](/documentacion/inventario/stock-minimo).

## Asistente de IA

La tarjeta **Asistente de IA** lleva, con **Configurar**, a **Preferencias › Asistente**: el historial de todo lo que se le preguntó, de qué temas puede hablar con cada rol y qué acciones puede hacer. Ver [Asistente: historial, permisos y acciones](/documentacion/equipo/asistente-configuracion).

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| *No se pudo registrar el dominio* | El dominio está mal escrito | Escribilo sin "www" ni "https", por ejemplo ferreterialosandes.com.ar |
| El dominio sigue en **Pendiente** o **Falló** | Los registros DNS no están cargados o todavía no se propagaron | Revisá que estén cargados igual que en la tabla y probá **Verificar ahora** más tarde |
| *No se pudo sincronizar con Banco Nación* | El sitio del Banco Nación no respondió | Cargá la cotización a mano en **Cotización manual** |
| *Cancelaste la vinculación con Mercado Pago - no se conectó ninguna cuenta.* | Saliste de Mercado Pago sin autorizar | Tocá **Conectar Mercado Pago** de nuevo y autorizá |
| *Sin novedades: ningún artículo con reposición automática activada está bajo su mínimo ahora mismo* | No hay nada para reponer | Es normal |
| No ves **Preferencias** en el menú | Tu rol no es Dueño ni Administrador | Pedíselo a alguno de ellos |
