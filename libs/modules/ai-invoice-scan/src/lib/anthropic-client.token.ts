// Token de DI - permite mockear el cliente de Anthropic entero en tests
// (nunca pegarle a la API real desde un test), mismo criterio que
// BNA_EXCHANGE_RATE/AUTH_EMAIL_SENDER en otros módulos de este repo.
export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');
