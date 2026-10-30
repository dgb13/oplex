/**
 * Minimal local-dev seed: one tenant + one OWNER user, so the login endpoint
 * has something to authenticate against. Run with:
 *   npx tsx libs/shared/database/prisma/seed.ts
 *
 * Not a tenant-onboarding flow — that's a separate future feature (default
 * chart of accounts, default cash account, etc. per docker/postgres-init and
 * the earlier architecture notes on tenant provisioning).
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/client.js';
import { withTenantContext, getTenantDb } from '../src/lib/tenant-context.js';

async function main() {
  const connectionString = process.env['APP_DATABASE_URL'];
  if (!connectionString) {
    throw new Error('APP_DATABASE_URL is not set');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const tenantId = randomUUID();
  const email = 'owner@demo.plexo';
  const password = 'changeme123';

  await withTenantContext(prisma, tenantId, async () => {
    const db = getTenantDb();
    await db.tenant.create({ data: { id: tenantId, name: 'Demo Tenant' } });
    await db.user.create({
      data: {
        tenantId,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        roles: ['OWNER'],
      },
    });
  });

  console.log('Seeded demo tenant. Login with:');
  console.log(JSON.stringify({ tenantId, email, password }, null, 2));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
