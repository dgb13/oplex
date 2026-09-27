import { ArcaPadronNotConfiguredError, ArcaPadronNotFoundError, type ArcaPadronService } from '@plexo/afip-credentials';
import { AfipLookupError, AfipNotConfiguredError } from './afip-padron.port.js';
import { RealAfipPadronService } from './real-afip-padron.js';

function serviceWith(lookup: jest.Mock) {
  return new RealAfipPadronService({ lookup } as unknown as ArcaPadronService);
}

describe('RealAfipPadronService.lookup', () => {
  it('maps the platform padrón result to AfipPadronData', async () => {
    const service = serviceWith(
      jest.fn().mockResolvedValue({
        cuit: '20201797064',
        personType: 'FISICA',
        name: 'PEREZ JUAN',
        ivaCondition: 'MONOTRIBUTO',
        taxConditionLabel: 'Monotributo (D)',
        fiscalAddress: 'CALLE 1, CIUDAD (1000), BUENOS AIRES',
        mainActivity: 'SERVICIOS',
        activityStartMonth: '2015-08',
        fromCache: false,
      }),
    );
    await expect(service.lookup('20201797064')).resolves.toEqual({
      cuit: '20201797064',
      personType: 'FISICA',
      name: 'PEREZ JUAN',
      taxCondition: 'Monotributo (D)',
      ivaCondition: 'MONOTRIBUTO',
      fiscalAddress: 'CALLE 1, CIUDAD (1000), BUENOS AIRES',
      mainActivity: 'SERVICIOS',
      activityStartMonth: '2015-08',
    });
  });

  it('throws AfipNotConfiguredError when Oplex has no padrón certificate', async () => {
    const service = serviceWith(jest.fn().mockRejectedValue(new ArcaPadronNotConfiguredError()));
    await expect(service.lookup('20201797064')).rejects.toBeInstanceOf(AfipNotConfiguredError);
  });

  it('returns null when ARCA has no record for the CUIT', async () => {
    const service = serviceWith(jest.fn().mockRejectedValue(new ArcaPadronNotFoundError('20201797064')));
    await expect(service.lookup('20201797064')).resolves.toBeNull();
  });

  it('wraps any other failure as AfipLookupError', async () => {
    const service = serviceWith(jest.fn().mockRejectedValue(new Error('WSAA down')));
    await expect(service.lookup('20201797064')).rejects.toBeInstanceOf(AfipLookupError);
  });
});
