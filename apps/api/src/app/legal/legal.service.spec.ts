import type { AuthEmailSender } from '@plexo/auth-email';
import { tenantContextStorage, type PrismaService } from '@plexo/database';
import { LEGAL_TERMS_VERSION } from '@plexo/types';
import { LegalService } from './legal.service.js';

function makeEmail() {
  return { sendLegalNotice: jest.fn().mockResolvedValue(undefined) } as unknown as AuthEmailSender & {
    sendLegalNotice: jest.Mock;
  };
}

describe('LegalService', () => {
  it('registra la aceptación de la versión vigente, con IP y navegador, y la marca en el usuario', async () => {
    const db = {
      legalAcceptance: { create: jest.fn().mockResolvedValue({}) },
      user: { update: jest.fn().mockResolvedValue({}) },
    };
    const service = new LegalService({} as PrismaService, makeEmail());

    await tenantContextStorage.run({ tenantId: 't-1', userId: 'u-1', tx: db as never }, () =>
      service.acceptCurrentTerms({ ip: '10.0.0.1', userAgent: 'Chrome' }),
    );

    expect(db.legalAcceptance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 't-1', userId: 'u-1', version: LEGAL_TERMS_VERSION, ip: '10.0.0.1', userAgent: 'Chrome' }),
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: expect.objectContaining({ acceptedTermsVersion: LEGAL_TERMS_VERSION }),
    });
  });

  it('un pedido de arrepentimiento genera número de trámite y avisa al titular y a quien lo pide', async () => {
    const create = jest.fn((args) => Promise.resolve({ code: args.data.code, createdAt: new Date('2026-10-01T12:00:00Z') }));
    const email = makeEmail();
    const service = new LegalService({ legalRequest: { create } } as unknown as PrismaService, email);

    const result = await service.createRequest('WITHDRAWAL', { name: 'Ana Gómez', email: 'ana@cliente.com' }, {});

    expect(result.code).toMatch(/^ARR-\d{6}$/);
    expect(email.sendLegalNotice).toHaveBeenCalledTimes(2);
    expect(email.sendLegalNotice).toHaveBeenCalledWith(expect.objectContaining({ to: 'belvederegerman79@gmail.com' }));
    expect(email.sendLegalNotice).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ana@cliente.com', subject: expect.stringContaining(result.code) }),
    );
  });

  it('si el número de trámite sale repetido, prueba con otro', async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }))
      .mockImplementationOnce((args) => Promise.resolve({ code: args.data.code, createdAt: new Date() }));
    const service = new LegalService({ legalRequest: { create } } as unknown as PrismaService, makeEmail());

    const result = await service.createRequest('CANCELLATION', { name: 'X', email: 'x@y.com' }, {});

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.code).toMatch(/^BAJ-\d{6}$/);
  });
});
