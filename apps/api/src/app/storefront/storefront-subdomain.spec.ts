import { normalizeSubdomain, subdomainProblem } from './storefront-subdomain.js';

describe('normalizeSubdomain', () => {
  it('turns any spelling of the same name into the same address', () => {
    expect(normalizeSubdomain('Casa Nativa')).toBe('casa-nativa');
    expect(normalizeSubdomain('CASA  NATIVA')).toBe('casa-nativa');
    expect(normalizeSubdomain('casa_nativa')).toBe('casa-nativa');
    expect(normalizeSubdomain('  -Casa--Nativa- ')).toBe('casa-nativa');
  });

  it('drops accents, ñ and symbols', () => {
    expect(normalizeSubdomain('Panadería Ñandú & Cía.')).toBe('panaderia-nandu-cia');
  });

  it('caps the length without leaving a trailing dash', () => {
    const result = normalizeSubdomain('a'.repeat(29) + ' bbbb');
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result.endsWith('-')).toBe(false);
  });
});

describe('subdomainProblem', () => {
  it('accepts a normal business name', () => {
    expect(subdomainProblem('casa-nativa')).toBeNull();
  });

  it('rejects too short, reserved and malformed addresses', () => {
    expect(subdomainProblem('ab')).toBe('TOO_SHORT');
    expect(subdomainProblem('www')).toBe('RESERVED');
    expect(subdomainProblem('admin')).toBe('RESERVED');
    expect(subdomainProblem('casa-')).toBe('INVALID');
  });
});
