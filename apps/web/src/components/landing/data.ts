// Datos de la landing pública. Todo lo que dice de Oplex está verificado en
// el código; lo de cada competidor sale de su sitio o centro de ayuda
// público (revisado el 2026-09-27). Publicidad comparativa: sólo datos
// verificables - "ask" = no lo encontramos publicado, NUNCA "no lo tiene".

export interface PublicPlan {
  key: string;
  name: string;
  sortOrder: number;
  priceMonthly: string;
  maxUsers: number;
  maxClients: number;
  maxMonthlyInvoices: number;
  aiInvoiceScanMonthlyQuota: number | null;
  aiAssistantMonthlyQueryQuota: number | null;
  productionModuleEnabled: boolean;
}

export const COMPETITORS = ['Xubio', 'Colppy', 'Tango', 'Alegra', 'Contabilium'] as const;

type Cell = { text: string; kind: 'yes' | 'ask' };
const yes = (text: string): Cell => ({ text, kind: 'yes' });
const ask: Cell = { text: 'Consultar', kind: 'ask' };

export interface ComparisonRow {
  label: string;
  detail?: string;
  oplex: string;
  // Mismo orden que COMPETITORS.
  others: [Cell, Cell, Cell, Cell, Cell];
}

export const COMPARISON: { group: string; rows: ComparisonRow[] }[] = [
  {
    group: 'Arquitectura y tecnología',
    rows: [
      {
        label: 'Dónde funciona',
        oplex: '100 % en la nube, desde cualquier navegador',
        others: [yes('En la nube'), yes('En la nube'), yes('Instalado en tu servidor o en la nube'), yes('En la nube'), yes('En la nube')],
      },
      {
        label: 'Tecnología',
        detail: 'Con qué está construido',
        oplex: 'Next.js · NestJS · PostgreSQL, en tiempo real',
        others: [ask, ask, ask, ask, ask],
      },
      {
        label: 'Aislamiento de datos',
        detail: 'Cómo se separa tu empresa de las demás',
        oplex: 'En la propia base de datos, por empresa (Row-Level Security)',
        others: [ask, ask, ask, ask, ask],
      },
      {
        label: 'Todo al instante',
        detail: 'Varias cajas y usuarios a la vez',
        oplex: 'El tablero se actualiza solo en cada venta o cobro',
        others: [ask, ask, ask, ask, ask],
      },
    ],
  },
  {
    group: 'Módulos',
    rows: [
      {
        label: 'Facturación electrónica ARCA',
        oplex: 'A, B y C con CAE, ticket o A4 con QR',
        others: [yes('Sí'), yes('Sí'), yes('Sí'), yes('Sí'), yes('Sí')],
      },
      {
        label: 'Caja (punto de venta)',
        oplex: 'Incluida: turnos, cajas por sucursal, 4 temas',
        others: [ask, ask, yes('Producto aparte (Tango Punto de Venta)'), yes('Sí (Alegra POS)'), yes('Sí')],
      },
      {
        label: 'Producción',
        oplex: 'Recetas, órdenes con reserva de insumos, piezas y recortes',
        others: [yes('Órdenes de producción'), ask, yes('Fórmulas de armado'), ask, ask],
      },
      {
        label: 'Contabilidad automática',
        oplex: 'Asientos de ventas, cobros, compras y costo, ajuste por inflación',
        others: [yes('Sí'), yes('Sí'), yes('Sí'), ask, ask],
      },
      {
        label: 'Todo en una sola suscripción',
        detail: 'Caja + producción + contabilidad + IA',
        oplex: 'Sí, en todos los planes pagos',
        others: [ask, ask, yes('Productos separados'), ask, ask],
      },
    ],
  },
  {
    group: 'Inteligencia artificial',
    rows: [
      {
        label: 'Preguntarle a tu negocio',
        detail: 'Respuestas con tus datos reales',
        oplex: 'Sí, en la web y por WhatsApp',
        others: [ask, ask, yes('Sí (Tango AI, dentro del sistema)'), yes('Resumen inteligente del negocio'), ask],
      },
      {
        label: 'Facturas de compra con IA',
        oplex: 'Desde una foto, con nivel de confianza por campo',
        others: [yes('Sí'), ask, ask, yes('Sí, desde WhatsApp'), ask],
      },
    ],
  },
  {
    group: 'Servicio y precio',
    rows: [
      {
        label: 'Prueba gratis',
        oplex: '15 días + plan gratis',
        others: [yes('14 días + plan gratis'), yes('Sí'), ask, yes('15 días'), yes('10 días')],
      },
      {
        label: 'Precios publicados',
        oplex: 'Sí, en esta página',
        others: [yes('Sí'), yes('Sí'), ask, yes('Sí'), yes('Sí')],
      },
      {
        label: 'Alta por CUIT',
        detail: 'Datos del padrón de ARCA',
        oplex: 'Sí, desde el primer minuto',
        others: [ask, ask, ask, ask, ask],
      },
    ],
  },
];

export const COMPARISON_SOURCES = [
  { name: 'Xubio', url: 'https://www.xubio.com/ar/' },
  { name: 'Colppy', url: 'https://colppy.com/' },
  { name: 'Tango', url: 'https://www.axoft.com/' },
  { name: 'Alegra', url: 'https://www.alegra.com/argentina/' },
  { name: 'Contabilium', url: 'https://contabilium.com/' },
];

// EJEMPLOS del mockup - reemplazar por testimonios reales (con permiso de
// cada cliente) antes de publicar. Publicarlos como reales sería
// publicidad engañosa; por eso cada tarjeta muestra "Ejemplo".
export const TESTIMONIALS: { quote: string; name: string; role: string; initials: string; feature: string; example: boolean }[] = [
  { quote: 'Antes cerraba la caja a las 10 de la noche pasando todo a una planilla. Ahora el tablero ya tiene todo cuando bajo la persiana.', name: 'Marcela Ruiz', role: 'Dueña · Almacén de barrio, Rosario', initials: 'MR', feature: 'Caja + Tablero', example: true },
  { quote: 'Le pregunto por WhatsApp cuánto vendimos mientras estoy en el depósito. Me contesta en segundos y con el número exacto.', name: 'Gustavo Ferreyra', role: 'Socio gerente · Distribuidora de bebidas, Córdoba', initials: 'GF', feature: 'Asistente de IA', example: true },
  { quote: 'Las recetas me cambiaron el taller: sé cuánta madera y herrajes necesito antes de aceptar un pedido.', name: 'Nicolás Álvarez', role: 'Carpintería a medida, Godoy Cruz', initials: 'NA', feature: 'Producción', example: true },
  { quote: 'Conectar ARCA siempre fue un dolor de cabeza. Con los pasos guiados lo hicimos en una tarde y facturamos esa misma semana.', name: 'Laura Benítez', role: 'Administración · Ferretería industrial, La Plata', initials: 'LB', feature: 'Conexión con ARCA', example: true },
  { quote: 'Tengo doce clientes en Oplex y veo la contabilidad de todos desde un solo lugar. Los asientos ya vienen hechos.', name: 'Cdor. Diego Martínez', role: 'Estudio contable, San Miguel de Tucumán', initials: 'DM', feature: 'Portal para contadores', example: true },
  { quote: 'Las facturas de proveedores las cargo con una foto. Lo que antes me llevaba la mañana del lunes, ahora son veinte minutos.', name: 'Sofía Paredes', role: 'Compras · Panificadora, Mar del Plata', initials: 'SP', feature: 'Comprobantes con IA', example: true },
];
