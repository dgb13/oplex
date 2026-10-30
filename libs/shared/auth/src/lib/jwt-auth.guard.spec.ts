import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '@plexo/types';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function makeContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(isPublic: unknown): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as unknown as Reflector;
}

describe('JwtAuthGuard', () => {
  it('allows public routes through without a token', async () => {
    const jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService, makeReflector(true));
    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('throws when there is no bearer token', async () => {
    const jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService, makeReflector(false));
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws when the token fails verification', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('bad token')),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService, makeReflector(false));
    await expect(
      guard.canActivate(makeContext({ authorization: 'Bearer nope' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('attaches the decoded payload to request.user on a valid token', async () => {
    const payload: AuthenticatedUser = {
      sub: 'user-1',
      tenantId: 'tenant-1',
      email: 'a@b.com',
      roles: ['OWNER'],
      moduleAccess: [],
      mustChangePassword: false,
    };
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue(payload),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService, makeReflector(false));

    const request: { headers: Record<string, string>; user?: AuthenticatedUser } = {
      headers: { authorization: 'Bearer good' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(payload);
  });

  function run(guard: JwtAuthGuard) {
    const request: { headers: Record<string, string>; user?: AuthenticatedUser } = {
      headers: { authorization: 'Bearer good' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    return { request, result: guard.canActivate(context) };
  }

  const base = { sub: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', moduleAccess: [], mustChangePassword: false };

  it('accepts a token issued before multiple roles (single role) as a one-role list', async () => {
    const jwtService = { verifyAsync: jest.fn().mockResolvedValue({ ...base, role: 'SALES' }) } as unknown as JwtService;
    const { request, result } = run(new JwtAuthGuard(jwtService, makeReflector(false)));
    await expect(result).resolves.toBe(true);
    expect(request.user?.roles).toEqual(['SALES']);
    expect(request.user).not.toHaveProperty('role');
  });

  it('uses the current roles from the loader instead of the ones in the token', async () => {
    const jwtService = { verifyAsync: jest.fn().mockResolvedValue({ ...base, roles: ['SALES'] }) } as unknown as JwtService;
    const loader = { load: jest.fn().mockResolvedValue(['SALES', 'INVENTORY']) };
    const { request, result } = run(new JwtAuthGuard(jwtService, makeReflector(false), loader));
    await expect(result).resolves.toBe(true);
    expect(loader.load).toHaveBeenCalledWith('tenant-1', 'user-1');
    expect(request.user?.roles).toEqual(['SALES', 'INVENTORY']);
  });

  it('rejects the session when the loader says the user is no longer active', async () => {
    const jwtService = { verifyAsync: jest.fn().mockResolvedValue({ ...base, roles: ['SALES'] }) } as unknown as JwtService;
    const loader = { load: jest.fn().mockResolvedValue(null) };
    await expect(run(new JwtAuthGuard(jwtService, makeReflector(false), loader)).result).rejects.toThrow(UnauthorizedException);
  });
});
