// Mismos 5 hex que --chart-1..5 en globals.css (que a su vez son los que ya
// usa ACCENT en dashboard/page.tsx para el sparkline del Tablero) - se
// repiten acá en crudo porque recharts asigna stroke/fill como atributos
// SVG directos, mismo criterio que ya usa ese componente (BarChart con
// fill="#6366f1" literal) en vez de una CSS var.
export const RESUMEN_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6'] as const;
