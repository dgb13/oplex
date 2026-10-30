import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '@plexo/types';
import { ModuleAccessGuard } from './module-access.guard.js';

function makeContext(user?: Partial<AuthenticatedUser>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(returnValue: unknown): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(returnValue) } as unknown as Reflector;
}

describe('ModuleAccessGuard', () => {
  it('allows the request through when no module access is required', () => {
    const guard = new ModuleAccessGuard(makeReflector(undefined));
    expect(
      guard.canActivate(makeContext({ roles: ['ACCOUNTANT'], moduleAccess: [] })),
    ).toBe(true);
  });

  it('always allows OWNER and ADMIN regardless of grants', () => {
    const guard = new ModuleAccessGuard(
      makeReflector({ module: 'accounting', level: 'write' }),
    );
    expect(guard.canActivate(makeContext({ roles: ['OWNER'], moduleAccess: [] }))).toBe(
      true,
    );
  });

  it('denies a restricted role without a matching grant', () => {
    const guard = new ModuleAccessGuard(
      makeReflector({ module: 'accounting', level: 'read' }),
    );
    expect(() =>
      guard.canActivate(makeContext({ roles: ['ACCOUNTANT'], moduleAccess: [] })),
    ).toThrow(ForbiddenException);
  });

  it('denies write when the grant only allows read', () => {
    const guard = new ModuleAccessGuard(
      makeReflector({ module: 'accounting', level: 'write' }),
    );
    const user: Partial<AuthenticatedUser> = {
      roles: ['ACCOUNTANT'],
      moduleAccess: [{ module: 'accounting', canRead: true, canWrite: false }],
    };
    expect(() => guard.canActivate(makeContext(user))).toThrow(ForbiddenException);
  });

  it('allows a restricted role with a matching grant', () => {
    const guard = new ModuleAccessGuard(
      makeReflector({ module: 'accounting', level: 'read' }),
    );
    const user: Partial<AuthenticatedUser> = {
      roles: ['ACCOUNTANT'],
      moduleAccess: [{ module: 'accounting', canRead: true, canWrite: false }],
    };
    expect(guard.canActivate(makeContext(user))).toBe(true);
  });
});
