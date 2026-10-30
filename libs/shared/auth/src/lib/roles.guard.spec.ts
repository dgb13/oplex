import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';

function makeContext(user?: { roles: string[] }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(returnValue: unknown): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(returnValue) } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows the request through when no roles are required', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext({ roles: ['VIEWER'] }))).toBe(true);
  });

  it('throws when there is no authenticated user', () => {
    const guard = new RolesGuard(makeReflector(['ADMIN']));
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('throws when the user role is not in the required list', () => {
    const guard = new RolesGuard(makeReflector(['ADMIN']));
    expect(() => guard.canActivate(makeContext({ roles: ['VIEWER'] }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows when the user role is in the required list', () => {
    const guard = new RolesGuard(makeReflector(['ADMIN', 'OWNER']));
    expect(guard.canActivate(makeContext({ roles: ['ADMIN'] }))).toBe(true);
  });

  it('allows when any of several roles is in the required list', () => {
    const guard = new RolesGuard(makeReflector(['OWNER', 'ADMIN', 'INVENTORY']));
    expect(guard.canActivate(makeContext({ roles: ['SALES', 'INVENTORY'] }))).toBe(true);
  });
});
