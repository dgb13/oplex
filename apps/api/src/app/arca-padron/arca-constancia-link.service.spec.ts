import type { PrismaService } from '@plexo/database';
import { ArcaConstanciaLinkService, DEFAULT_CONSTANCIA_URL } from './arca-constancia-link.service.js';

function makePrisma(constanciaUrl: string | null = null) {
  return {
    platformSettings: {
      findUnique: jest.fn().mockResolvedValue({ constanciaUrl }),
      upsert: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

function page(body: string, url = DEFAULT_CONSTANCIA_URL) {
  return { ok: true, status: 200, url, text: () => Promise.resolve(body) };
}

describe('ArcaConstanciaLinkService.check', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('follows the iframe where ARCA builds the form and reports OK', async () => {
    fetchMock
      .mockResolvedValueOnce(page('<iframe id="miBody" src="/padron-puc-constancia-internet/jsp/Constancia.jsp"></iframe>'))
      .mockResolvedValueOnce(page('<b>CUIT del Contribuyente:</b>'));

    const result = await new ArcaConstanciaLinkService(makePrisma()).check(DEFAULT_CONSTANCIA_URL);

    expect(result.status).toBe('OK');
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://seti.afip.gob.ar/padron-puc-constancia-internet/jsp/Constancia.jsp');
  });

  it('reports CHANGED when the page answers but no longer shows the form', async () => {
    fetchMock.mockResolvedValueOnce(page('<h1>Página en mantenimiento</h1>'));
    const result = await new ArcaConstanciaLinkService(makePrisma()).check(DEFAULT_CONSTANCIA_URL);
    expect(result.status).toBe('CHANGED');
  });

  it('reports DOWN on an error status or a network failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve('') });
    expect((await new ArcaConstanciaLinkService(makePrisma()).check(DEFAULT_CONSTANCIA_URL)).status).toBe('DOWN');

    fetchMock.mockRejectedValueOnce(new Error('fetch failed'));
    expect((await new ArcaConstanciaLinkService(makePrisma()).check(DEFAULT_CONSTANCIA_URL)).status).toBe('DOWN');
  });

  it('uses the default link until the admin sets another one, and only accepts https', async () => {
    expect(await new ArcaConstanciaLinkService(makePrisma()).getUrl()).toBe(DEFAULT_CONSTANCIA_URL);
    expect(await new ArcaConstanciaLinkService(makePrisma('https://arca.gob.ar/nueva')).getUrl()).toBe('https://arca.gob.ar/nueva');
    await expect(new ArcaConstanciaLinkService(makePrisma()).setUrl('http://arca.gob.ar/x')).rejects.toThrow(/https/);
  });
});
