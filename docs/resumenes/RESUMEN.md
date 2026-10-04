# Resumen de OPLEX — ERP integral multi-tenant

## Qué es

OPLEX (nombre comercial actual del proyecto, cuyo código y repositorio siguen llamándose internamente Plexo) es un ERP (Enterprise Resource Planning) SaaS multi-tenant pensado para pequeñas y medianas empresas argentinas. Cubre el ciclo completo de un negocio: inventario, producción/manufactura, punto de venta, ventas y facturación electrónica (AFIP), compras, cuentas a cobrar/pagar, tesorería, contabilidad, impuestos y reportes gerenciales, todo dentro de una única aplicación web con aislamiento estricto de datos por empresa (tenant).

Es un monorepo Nx con dos aplicaciones principales: una API backend en NestJS/Fastify (`apps/api`) y un frontend en Next.js/React (`apps/web`), con una base de datos PostgreSQL administrada vía Prisma. El aislamiento multi-tenant no se resuelve solo a nivel de aplicación: cada tabla sensible tiene Row Level Security (RLS) nativo de Postgres, de modo que aunque una consulta tuviera un bug, la base de datos misma impide que un tenant vea datos de otro.

## Autenticación y onboarding

El acceso es moderno, tipo SaaS: signup público con verificación de email por código OTP, login en dos pasos (se resuelve automáticamente a qué empresa pertenece un email, y si el mismo email está en varias empresas se pide elegir cuál), recuperación de contraseña, y login social con Google, Microsoft y Apple (los botones se activan solos cuando el operador carga las credenciales correspondientes, si no dicen "Próximamente"). Todo el flujo tiene una estética cuidada (fondo animado de partículas, tarjetas con transición, medidor de fuerza de contraseña).

Cada usuario pertenece a una única empresa (tenant) y tiene un rol (OWNER, ADMIN, VENTAS, COMPRAS, INVENTARIO, etc.) que determina qué módulos puede ver y qué acciones puede ejecutar, controlado por guards de rol en el backend, no solo ocultando botones en el frontend.

## Tablero (Dashboard) y Resumen

El **Tablero** es la pantalla de inicio tras loguearse. Muestra en tiempo real (vía WebSockets con salas por tenant, así que si dos usuarios de la misma empresa están conectados ven actualizaciones al instante): total facturado hoy, total cobrado hoy, alertas de stock bajo mínimo, un gráfico de ventas de los últimos 7 días, y un desglose de stock por depósito. También incluye un checklist de "primeros pasos" (crear la primera empresa, cargar el primer artículo, emitir la primera factura, completar el perfil) que ayuda a un usuario nuevo a orientarse.

**Resumen** es un módulo analítico aparte (tipo "bento") con vistas dedicadas a Ventas y a Compras: métricas y tendencias más profundas que el Tablero, pensadas para revisar la marcha del negocio en un vistazo.

## Agenda

Calendario propio del tenant (vista por rango de fechas navegable) para turnos, recordatorios y eventos de negocio, integrado al resto de la app en vez de depender de un calendario externo.

## Inventario

Gestión de artículos con variantes (talles, colores, etc.), categorías, depósitos y movimientos de stock. Cada artículo puede editarse por completo (nombre, categoría, unidad de medida, si es servicio/publicado/manufacturado) desde el detalle, y **desactivarse** en lugar de borrarse (soft delete): por defecto los artículos inactivos quedan ocultos, con un check "Mostrar inactivos" para verlos con su badge correspondiente; un artículo no se puede desactivar si está en uso en una producción en curso. Hay importación masiva de artículos desde Excel, historial de precios, stock mínimo configurable con alertas, y sugerencias de reposición.

Sobre el inventario se construyó un **catálogo visual tipo e-commerce**: los artículos se pueden ver como grilla con imagen/precio/stock (con el mismo acceso rápido a edición que la vista de tabla), y agregarse a un **carrito de compras interno** (uno persistente por usuario). Desde ese carrito se puede: repartir los artículos entre varios proveedores generando un Pedido de Cotización por cada uno, proponerle una venta a un cliente, o exportar todo a PDF — sin que ninguna de esas acciones vacíe el carrito automáticamente.

## Producción

Módulo de manufactura para negocios que fabrican lo que venden (no solo revenden). Incluye:

- **Recetas (BOM - Bill of Materials)**: por cada artículo fabricable se define una receta versionada (insumos requeridos, porcentaje de merma esperado, subproductos), con historial completo de versiones — confirmar una orden de producción congela la versión de receta usada en ese momento, así que cambiar la receta después no reescribe órdenes viejas. Cada receta admite documentación adjunta (plano en PDF, hoja de corte en ZIP).
- **Órdenes de producción**: ciclo Borrador → Planificada → En curso → Terminada/Cancelada, con numeración propia configurable por usuario (prefijo por defecto "OP", configurable desde Producción → Configuración, igual que la numeración de Compras/Cotizaciones). Al confirmar una orden se reserva stock de insumos contra los depósitos disponibles; si no alcanza, la orden queda marcada "insumos faltantes" con una vista de progreso animada y codificada por color por cada insumo (cuánto se reservó vs. cuánto falta), y un botón "Reintentar reserva" para volver a intentar la reserva cuando llegó stock nuevo sin tener que recrear la orden.
- **Compra directa de faltantes**: desde la orden de producción, un botón genera automáticamente Pedidos de Cotización agrupados por proveedor preferido de cada insumo faltante (un pedido por proveedor), sin tener que armarlos a mano desde Compras.
- **Piezas y recortes**: trazabilidad de piezas 1D (con largo original/actual, para materiales que se cortan y dejan recortes reutilizables — offcuts) por depósito y artículo.

## Caja (Punto de Venta / POS)

Punto de venta con soporte para múltiples cajas físicas, apertura y cierre de turno con arqueo (conteo de billetes/monedas por denominación), historial de turnos cerrados con el total contado de cada uno, y venta directa con teclado numérico táctil. Tiene temas visuales propios (claro/oscuro/alto contraste/esmeralda) independientes del resto de la app, pensado para pantallas dedicadas de mostrador.

## Ventas y Facturación

Facturación con los tipos de comprobante argentinos (A, B, C, notas de crédito), soporte de IVA por línea, distintos "conceptos" de factura (Productos, Servicios, Mixto, cada uno con sus reglas AFIP), y multi-moneda con tipo de cambio. La integración con **AFIP (facturación electrónica real, WSFE)** está implementada de punta a punta: certificado y clave por tenant (cifrados), obtención de CAE real contra el webservice de AFIP, manejo de errores SOAP detallados en vez de mensajes genéricos. También hay padrón AFIP (búsqueda de datos fiscales por CUIT) para autocompletar al dar de alta un cliente. Las facturas admiten cobro con **Mercado Pago** (link de pago/QR) además de los medios de cobro tradicionales.

Cada factura tiene un panel de detalle completo reutilizado en varias pantallas, y el registro de cobros postea automáticamente el asiento contable correspondiente (débito Caja / crédito Deudores por Ventas).

**Cotizaciones** es un módulo hermano de Ventas: presupuestos a clientes con numeración propia, ciclo Borrador→Enviada→Aceptada/Rechazada/Cancelada, envío por email o WhatsApp, y export a PDF con 5 estilos distintos elegibles por el usuario.

## Cuentas a Cobrar

Vista de saldos pendientes por cliente, reporte de antigüedad de deuda (aging), estado de cuenta detallado por cliente, y un sistema de **recordatorios automáticos recurrentes** (no solo una vez) configurables por tenant para avisar a clientes con facturas vencidas.

## Compras

Simétrico a Ventas pero del lado proveedor: Pedidos de Cotización a proveedores (con posibilidad de pedir cotización a varios proveedores a la vez y comparar precios artículo por artículo antes de elegir ganador), Órdenes de Compra, Recepción de Mercadería (que sí impacta stock real, a diferencia de la orden que es solo un documento), Facturas de Compra, y Devoluciones a Proveedor. Cada proveedor puede tener artículos preferidos y se guarda el historial de precios de compra.

Al enviar una Orden de Compra, la pantalla de envío muestra una **grilla de contactos del proveedor con avatar** para elegir a quién se manda (por email o WhatsApp, con indicador de qué medio tiene disponible cada uno), permite agregar un contacto nuevo o editar los datos institucionales (email/WhatsApp de la empresa) sin salir a la ficha del cliente, y admite varios estilos de PDF configurables por prefijo de numeración propio de cada usuario.

También incluye **Carga con IA**: fotografiar o escanear una factura de proveedor y que el sistema (lectura de QR AFIP + IA) extraiga los campos automáticamente, con un indicador de confianza por campo y por el escaneo completo, más una "Galería IA" para revisar/corregir después las facturas cargadas así.

Las compras impactan Contabilidad correctamente: Cuentas a Pagar, IVA Crédito Fiscal, y una cuenta puente de "Mercadería Recibida No Facturada" (GRNI) para el caso normal en que la recepción física llega antes que la factura del proveedor.

## Cuentas a Pagar

Análogo a Cuentas a Cobrar pero para lo que la empresa le debe a sus proveedores: saldos, antigüedad de deuda, estado de cuenta por proveedor.

## Tesorería

Cartera de cheques (de terceros y propios) con sus estados de vida: en cartera, depositado, rechazado, endosado, propios emitidos — incluyendo el flujo de depositar un cheque de terceros o registrar su rechazo. Se complementa con el libro de caja/banco de Reportes.

## Contabilidad

Plan de cuentas configurable, asientos contables (manuales y automáticos generados por Ventas/Compras/Cobros/Pagos), libro mayor por cuenta, balance de sumas y saldos (trial balance), y reversión de asientos. Incluye **Ajuste por Inflación Contable** (RT 6/NC 39), con una fuente de índices de precios propia para recalcular saldos históricos.

## Impuestos

Catálogo de impuestos con tasas versionadas en el tiempo (para que un cambio de alícuota no altere retroactivamente facturas viejas), delegable a un contador, regímenes de retención (IIBB, etc.) también versionados, y **Libro de IVA Digital** (compras y ventas) como base para la presentación ante AFIP.

## Reportes

Tres vistas gerenciales: **Resultados** (estado de resultados/P&L), **Ventas** (por cliente y por producto) y **Financiero** (libro de caja/banco, con cuentas que pueden alimentarse también de Mercado Pago, y conciliación — hoy semiautomática, vía import de un template propio tipo Excel, no un parser de extractos bancarios reales). Las tres comparten un filtro de rango de fechas con atajos ("Este mes", "Mes anterior", "Este trimestre", "Este año").

## Empresas

Gestión de clientes y proveedores (companies), cada uno con sus contactos (personas), avatar, condición fiscal ante AFIP, domicilio fiscal, y flag de si es proveedor preferido para ciertos artículos. Las empresas se desactivan en vez de borrarse (para no romper el historial de facturas ya emitidas); los contactos individuales sí se pueden borrar.

## Contadores

Rol/acceso dedicado para que un contador externo pueda operar sobre la contabilidad e impuestos del tenant sin necesitar un usuario "de negocio" completo.

## Gestión de Equipo y perfil

Cada empresa puede invitar colegas por email (con un link de invitación que expira) o darlos de alta directo con clave temporal. Desde ahí se administra el rol de cada miembro, se puede suspender/reactivar una cuenta (con protecciones para no quedar sin ningún OWNER activo ni auto-suspenderse), resetear contraseñas de otros miembros, y ver un historial de actividad por usuario. El perfil propio permite cambiar contraseña, datos personales y ver la propia actividad.

## Asistente de IA (WhatsApp)

Asistente conversacional configurable por tenant (nombre propio, personalidad) pensado para atender consultas por WhatsApp con respuesta en streaming, con métricas de uso (barra de consumo, mini-gráfico) visibles desde el panel de configuración. El enlace/vínculo con WhatsApp Web ya está integrado; la mensajería completa (API oficial de Meta) está bloqueada hasta contar con credenciales de Meta propias.

## Motor de Planes y Suscripciones (SaaS Engine)

Cada tenant tiene un plan (Basic, Silver, Diamond) con límites y un estado de suscripción (trial, activa, etc.). El trial de un signup público arranca directamente en el plan Silver para mostrar el producto completo antes de que el usuario decida convertir o caer al plan gratuito. El cobro real del tenant hacia la plataforma todavía no está integrado — es solo informativo por ahora.

## Backoffice SuperAdmin

Un panel separado (`/admin`, visible solo para emails configurados como administradores de plataforma) para gestionar la operación completa del SaaS: listado de todos los tenants con su plan/suscripción/cantidad de usuarios/facturas emitidas, capacidad de suspender/reactivar un tenant o "impersonarlo" (entrar como si fuera ese tenant para dar soporte), gestión de planes, configuración del Asistente de IA, gestión de Mercado Pago a nivel plataforma, un feed de actividad global, un visor de errores 5xx recientes, y gestión de backups. No incluye todavía cobro a los tenants por parte de la plataforma ni importación masiva desde Excel a nivel plataforma — eso quedó pospuesto a propósito.

## Funciones transversales

Además de los módulos de negocio, hay un conjunto de capacidades que atraviesan toda la app: presencia online (ver qué compañeros están conectados en el momento), un log de actividad que registra cada acción mutante (crear, editar, borrar) con diff campo a campo de qué cambió, envío de emails transaccionales (verificación, recuperación de contraseña, invitaciones, recordatorios de cobro) con remitente propio del tenant si tiene dominio verificado, exportación a PDF con varios estilos visuales para los documentos que se envían a terceros (cotizaciones, órdenes de compra), y enlaces directos a WhatsApp para mandar esos mismos documentos.

## Estado actual

El roadmap funcional original (9 pantallas: Inventario, Perfil, Facturación, Cuentas a Cobrar, Empresas, Contabilidad, Impuestos, Reportes y Tablero) está completo, y se sumaron por encima Compras, Cotizaciones, el carrito de Inventario, Producción (recetas/órdenes/piezas), Caja/POS, Tesorería, Agenda, Resumen analítico, Carga con IA de facturas, el Asistente de IA por WhatsApp, Auth/Onboarding completo, Gestión de Equipo y el Backoffice SuperAdmin — bastante más de lo planeado inicialmente. Lo más relevante que sigue pendiente: confirmar el "camino feliz" de AFIP en producción (certificado real, hoy solo probado contra un certificado de prueba que AFIP rechaza correctamente), activar el cobro por Mercado Pago con credenciales de producción reales (hoy bloqueado por un error del lado del panel de MP), integrar la mensajería completa del Asistente de IA con la API oficial de WhatsApp (falta credencial de Meta), una Nota de Crédito de Compra como documento propio (hoy solo existe la devolución física de mercadería), y una integración real de conciliación bancaria (hoy es semiautomática vía template propio, no lectura de extractos bancarios).
