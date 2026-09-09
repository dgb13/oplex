// Token de DI separado del ANTHROPIC_CLIENT de @plexo/ai-invoice-scan a
// propósito - misma razón que ANTHROPIC_ASSISTANT_API_KEY vs
// ANTHROPIC_API_KEY en el .env (ver docs/plan-asistente-ia-conversacional.md,
// sección 2: dos consumos de facturación de Anthropic con perfiles de
// costo/volumen distintos). Permite además mockear el cliente entero en
// tests, mismo criterio que ANTHROPIC_CLIENT.
export const ASSISTANT_ANTHROPIC_CLIENT = Symbol('ASSISTANT_ANTHROPIC_CLIENT');
