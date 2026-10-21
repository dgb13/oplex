/** Temario del manual de usuario (sección pública /documentacion y PDF
 * resumido). Sólo el orden y los nombres de los capítulos: el título, el
 * resumen y el texto de cada artículo viven en
 * apps/web/ayuda/<capítulo>/<artículo>.md (ver docs.ts). Las capturas, en
 * apps/web/public/ayuda/capturas. */

export interface DocsChapter {
  slug: string;
  number: number;
  title: string;
  /** Una línea para la tarjeta del inicio de la ayuda. */
  description: string;
  /** El capítulo que se destaca en el inicio. */
  featured?: boolean;
  articles: string[];
}

export const DOCS_CHAPTERS: DocsChapter[] = [
  {
    slug: 'introduccion',
    number: 0,
    title: 'Introducción',
    description: 'Qué es Oplex, cómo está organizado este manual y quién puede hacer qué.',
    articles: ['que-es-oplex', 'como-usar-el-manual', 'roles-y-permisos', 'requisitos'],
  },
  {
    slug: 'primeros-pasos',
    number: 1,
    title: 'Primeros pasos',
    description: 'Crear la cuenta, conocer la pantalla y dejar todo listo para trabajar.',
    articles: [
      'crear-la-cuenta',
      'recorrido-por-la-pantalla',
      'checklist-de-inicio',
      'tu-empresa-en-los-documentos',
      'invitar-a-tu-equipo',
      'importar-datos',
    ],
  },
  {
    slug: 'arca',
    number: 2,
    title: 'Conexión con ARCA',
    description: 'Certificado, autorización y punto de venta para emitir facturas electrónicas con CAE.',
    featured: true,
    articles: [
      'antes-de-empezar',
      'datos-de-la-empresa',
      'clave-y-pedido-csr',
      'certificado-produccion',
      'certificado-homologacion',
      'subir-y-probar',
      'punto-de-venta',
      'renovar-certificado',
      'errores-arca',
    ],
  },
  {
    slug: 'ventas',
    number: 3,
    title: 'Ventas',
    description: 'Clientes, cotizaciones, facturas, cobros, notas de crédito y tienda online.',
    articles: [
      'clientes',
      'cotizaciones',
      'emitir-factura',
      'letra-del-comprobante',
      'pdf-de-la-factura',
      'cobrar',
      'mercado-pago',
      'nota-de-credito',
      'pendientes-de-entrega',
      'cuentas-a-cobrar',
      'tienda-online',
    ],
  },
  {
    slug: 'caja',
    number: 4,
    title: 'Caja (punto de venta)',
    description: 'Cajas, turnos, ventas de mostrador y cobros con QR de Mercado Pago.',
    articles: [
      'configurar-cajas',
      'abrir-y-cerrar-turno',
      'vender-y-cobrar',
      'qr-mercado-pago',
      'cobros-qr-sin-venta',
      'historial-de-turnos',
    ],
  },
  {
    slug: 'inventario',
    number: 5,
    title: 'Inventario',
    description: 'Artículos, variantes, precios, depósitos, stock mínimo e importación.',
    articles: [
      'articulos-y-variantes',
      'precios-costos-iva',
      'depositos-y-movimientos',
      'stock-minimo',
      'importar-articulos',
      'catalogo-y-listado',
    ],
  },
  {
    slug: 'compras',
    number: 6,
    title: 'Compras',
    description: 'Proveedores, pedidos de cotización, órdenes de compra, facturas y pagos.',
    articles: [
      'proveedores',
      'pedidos-de-cotizacion',
      'ordenes-y-recepcion',
      'facturas-de-compra',
      'carga-con-ia',
      'cuentas-a-pagar',
    ],
  },
  {
    slug: 'produccion',
    number: 7,
    title: 'Producción',
    description: 'Recetas, órdenes de producción, piezas y costos.',
    articles: ['recetas', 'ordenes-de-produccion', 'piezas-y-recortes', 'historial-y-costos'],
  },
  {
    slug: 'contabilidad',
    number: 8,
    title: 'Contabilidad e impuestos',
    description: 'Asientos, libros, ajuste por inflación, impuestos, Libro IVA, cheques y reportes.',
    articles: [
      'plan-de-cuentas-y-asientos',
      'libros-diario-y-mayor',
      'ajuste-por-inflacion',
      'impuestos-y-vencimientos',
      'libro-iva',
      'cartera-de-cheques',
      'cuentas-de-dinero',
      'reportes',
    ],
  },
  {
    slug: 'equipo',
    number: 9,
    title: 'Trabajo en equipo',
    description: 'Agenda, avisos, menciones y tareas, asistente de IA y contadores.',
    articles: ['agenda', 'notificaciones-y-tareas', 'asistente-ia', 'asistente-configuracion', 'contadores'],
  },
  {
    slug: 'cuenta',
    number: 10,
    title: 'Tu cuenta',
    description: 'Perfil, plan y facturación de Oplex, y preferencias de la empresa.',
    articles: ['perfil', 'planes-y-facturacion', 'preferencias'],
  },
  {
    slug: 'problemas',
    number: 11,
    title: 'Solución de problemas',
    description: 'Qué hacer cuando ARCA rechaza una factura, no podés ingresar y otras dudas.',
    articles: ['arca-rechaza-la-factura', 'no-puedo-ingresar', 'preguntas-frecuentes'],
  },
  {
    slug: 'glosario',
    number: 12,
    title: 'Glosario y resumen',
    description: 'Los términos de ARCA y de Oplex, y el recorrido completo en una página.',
    articles: ['glosario', 'resumen'],
  },
];
