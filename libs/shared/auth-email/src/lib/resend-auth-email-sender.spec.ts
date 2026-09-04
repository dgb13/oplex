import { ResendAuthEmailSender } from './resend-auth-email-sender.js';

const sendMock = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

describe('ResendAuthEmailSender.sendVerificationCode', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('sends with the configured from-address and the code in the body', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const sender = new ResendAuthEmailSender('re_test_key', 'auth@plexo.demo');

    await sender.sendVerificationCode({ to: 'nuevo@demo.com', code: '123456', expiresInMinutes: 15 });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'auth@plexo.demo',
        to: 'nuevo@demo.com',
        subject: expect.stringContaining('verificación'),
        text: expect.stringContaining('123456'),
      }),
    );
  });

  it('logs instead of throwing when Resend returns an error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'Invalid from address' } });
    const sender = new ResendAuthEmailSender('re_test_key', 'auth@plexo.demo');

    await expect(
      sender.sendVerificationCode({ to: 'nuevo@demo.com', code: '123456', expiresInMinutes: 15 }),
    ).resolves.toBeUndefined();
  });
});

describe('ResendAuthEmailSender.sendPasswordResetLink', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('sends with the reset URL in the body', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const sender = new ResendAuthEmailSender('re_test_key', 'auth@plexo.demo');

    await sender.sendPasswordResetLink({
      to: 'user@demo.com',
      resetUrl: 'https://app.plexo.demo/reset-password?tenantId=t1&token=abc',
      expiresInMinutes: 60,
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'auth@plexo.demo',
        to: 'user@demo.com',
        subject: expect.stringContaining('contraseña'),
        text: expect.stringContaining('https://app.plexo.demo/reset-password?tenantId=t1&token=abc'),
      }),
    );
  });

  it('logs instead of throwing when Resend returns an error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'Invalid from address' } });
    const sender = new ResendAuthEmailSender('re_test_key', 'auth@plexo.demo');

    await expect(
      sender.sendPasswordResetLink({
        to: 'user@demo.com',
        resetUrl: 'https://app.plexo.demo/reset-password',
        expiresInMinutes: 60,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('ResendAuthEmailSender.sendMembershipNotice', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('sends with the portal URL and both tenant names in the body, wording varying by kind', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const sender = new ResendAuthEmailSender('re_test_key', 'auth@plexo.demo');

    await sender.sendMembershipNotice({
      to: 'admin@estudio.com',
      tenantName: 'Estudio Contable SRL',
      counterpartName: 'Cliente Demo SA',
      kind: 'invited',
      portalUrl: 'https://app.oplex.com.ar/accountants',
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'auth@plexo.demo',
        to: 'admin@estudio.com',
        subject: expect.stringContaining('Cliente Demo SA'),
        text: expect.stringContaining('https://app.oplex.com.ar/accountants'),
      }),
    );
  });

  it('logs instead of throwing when Resend returns an error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'Invalid from address' } });
    const sender = new ResendAuthEmailSender('re_test_key', 'auth@plexo.demo');

    await expect(
      sender.sendMembershipNotice({
        to: 'admin@estudio.com',
        tenantName: 'Estudio Contable SRL',
        counterpartName: 'Cliente Demo SA',
        kind: 'accepted',
        portalUrl: 'https://app.oplex.com.ar/accountants',
      }),
    ).resolves.toBeUndefined();
  });
});
