/**
 * One-off data seed for the "Demo Tenant", so the "Resumen" module's charts
 * (tendencia mensual, vendedores, top clientes/productos, cartera) have
 * something real to plot instead of all-zero series. Not part of the
 * regular `seed.ts` flow (that one only creates the tenant/owner login) -
 * run by hand, once, against the demo tenant only:
 *   npx tsx libs/shared/database/prisma/seed-resumen-demo.ts
 *
 * Writes Invoice/InvoiceLine rows directly instead of going through
 * InvoicingService.createInvoice(): that path always calls the real AFIP
 * WSFE service (RealElectronicInvoicingService, no dev/mock provider is
 * wired - see electronic-invoicing.port.ts) and fails locally without a
 * real certificate, which is exactly what blocked the POS checkout test in
 * an earlier session. Emulates the same math (netAmount/taxTotal/lineTotal)
 * InvoicingService.createInvoice uses, with a flat 21% GRAVADO override on
 * every line (the catalog's own taxRate is 0 in this tenant - no
 * TaxDefinition assigned to these articles - which would make "IVA débito"
 * flatline at zero on the trend chart otherwise).
 *
 * Date split matters: getRevenueByMonth (trend chart) reads the last 6
 * calendar months, but getSalesByCustomer/getSalesByProduct/getSalesBySeller
 * (Top clientes/productos, Vendedores) default to month-to-date only - see
 * defaultRange() in reports-sales.service.ts. So April-August only feed the
 * trend line, while September also has to carry enough volume/variety to
 * populate those other widgets.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../src/generated/client.js';
import { withTenantContext, getTenantDb } from '../src/lib/tenant-context.js';

const TENANT_ID = '61e2c2ee-b6b0-4b7c-be20-b16286bcf731'; // Demo Tenant
const OWNER_USER_ID = '448b1683-ef54-4b40-84ab-a217aae9e20d'; // owner@demo.plexo
const CURRENCY_ID = '36401e75-dcc7-41ec-8cab-8b67bf47bda0'; // ARS (base)
const POINT_OF_SALE = '0001';
const TAX_RATE = 21;

const CUSTOMERS = {
  prueba: 'af075560-4ae6-427c-a3a5-2546d40653ff', // Cliente de Prueba SA
  norte: 'd212d633-6a00-46ba-9d0b-0a6931a3b356', // Distribuidora Norte SA
  sur: 'dda0e780-4a03-4efb-ac7e-c46ad6d5e75b', // Comercial del Sur SRL
} as const;

const ARTICLES = {
  azucar: { id: 'e5c61c62-6e7a-448a-8b38-6783140a75d0', price: 688.8 },
  cable: { id: '7f31377d-dc96-4993-8008-b37fdac6b5da', price: 4988 },
  harina: { id: 'fd0f60dc-34c8-4ebe-bf1b-f4af1dc5fd7b', price: 6075 },
  monitor: { id: '121da41b-1f0d-47a1-8510-aa2d86559d08', price: 195.75 },
  mouse: { id: '11b209ef-cfcf-49b3-a5e4-a7716905b639', price: 49.72 },
  pan: { id: '0c9b0edd-c385-4396-9dce-a6902c9d8185', price: 7830 },
  parlante: { id: 'f5b5cdbd-99c3-4d1e-a597-e3c5e9d68dc6', price: 43 },
  sal: { id: 'c6e85643-85ed-4ffd-a143-52a705260493', price: 5535 },
} as const;

interface SeedLine {
  article: keyof typeof ARTICLES;
  qty: number;
}

interface SeedInvoice {
  date: string; // YYYY-MM-DD, UTC
  customerId: string;
  lines: SeedLine[];
}

const INVOICES: SeedInvoice[] = [
  // Abril
  { date: '2026-04-05', customerId: CUSTOMERS.prueba, lines: [{ article: 'harina', qty: 8 }, { article: 'sal', qty: 4 }] },
  { date: '2026-04-12', customerId: CUSTOMERS.norte, lines: [{ article: 'cable', qty: 10 }] },
  { date: '2026-04-20', customerId: CUSTOMERS.prueba, lines: [{ article: 'azucar', qty: 15 }, { article: 'pan', qty: 5 }] },
  // Mayo
  { date: '2026-05-04', customerId: CUSTOMERS.sur, lines: [{ article: 'monitor', qty: 6 }, { article: 'mouse', qty: 20 }] },
  { date: '2026-05-14', customerId: CUSTOMERS.prueba, lines: [{ article: 'sal', qty: 10 }, { article: 'harina', qty: 5 }] },
  { date: '2026-05-22', customerId: CUSTOMERS.norte, lines: [{ article: 'cable', qty: 8 }, { article: 'parlante', qty: 30 }] },
  // Junio
  { date: '2026-06-03', customerId: CUSTOMERS.norte, lines: [{ article: 'cable', qty: 12 }] },
  { date: '2026-06-11', customerId: CUSTOMERS.prueba, lines: [{ article: 'pan', qty: 10 }, { article: 'azucar', qty: 10 }] },
  { date: '2026-06-19', customerId: CUSTOMERS.sur, lines: [{ article: 'monitor', qty: 10 }] },
  { date: '2026-06-25', customerId: CUSTOMERS.prueba, lines: [{ article: 'sal', qty: 6 }, { article: 'harina', qty: 6 }] },
  // Julio
  { date: '2026-07-02', customerId: CUSTOMERS.sur, lines: [{ article: 'mouse', qty: 40 }, { article: 'parlante', qty: 25 }] },
  { date: '2026-07-10', customerId: CUSTOMERS.norte, lines: [{ article: 'cable', qty: 15 }] },
  { date: '2026-07-18', customerId: CUSTOMERS.prueba, lines: [{ article: 'harina', qty: 12 }, { article: 'sal', qty: 12 }] },
  { date: '2026-07-24', customerId: CUSTOMERS.norte, lines: [{ article: 'monitor', qty: 8 }] },
  // Agosto
  { date: '2026-08-01', customerId: CUSTOMERS.prueba, lines: [{ article: 'azucar', qty: 20 }, { article: 'pan', qty: 8 }] },
  { date: '2026-08-09', customerId: CUSTOMERS.sur, lines: [{ article: 'cable', qty: 18 }] },
  { date: '2026-08-16', customerId: CUSTOMERS.norte, lines: [{ article: 'sal', qty: 15 }, { article: 'harina', qty: 10 }] },
  { date: '2026-08-23', customerId: CUSTOMERS.prueba, lines: [{ article: 'monitor', qty: 12 }, { article: 'mouse', qty: 30 }] },
  { date: '2026-08-29', customerId: CUSTOMERS.sur, lines: [{ article: 'parlante', qty: 40 }] },
  // Septiembre (mes en curso - alimenta también Vendedores/Top clientes/Top productos)
  { date: '2026-09-02', customerId: CUSTOMERS.prueba, lines: [{ article: 'harina', qty: 10 }, { article: 'sal', qty: 8 }] },
  { date: '2026-09-04', customerId: CUSTOMERS.norte, lines: [{ article: 'cable', qty: 20 }] },
  { date: '2026-09-06', customerId: CUSTOMERS.sur, lines: [{ article: 'monitor', qty: 15 }, { article: 'mouse', qty: 35 }] },
  { date: '2026-09-08', customerId: CUSTOMERS.prueba, lines: [{ article: 'azucar', qty: 18 }, { article: 'pan', qty: 10 }] },
  { date: '2026-09-10', customerId: CUSTOMERS.norte, lines: [{ article: 'parlante', qty: 50 }, { article: 'sal', qty: 10 }] },
  { date: '2026-09-12', customerId: CUSTOMERS.sur, lines: [{ article: 'cable', qty: 10 }, { article: 'harina', qty: 8 }] },
  { date: '2026-09-14', customerId: CUSTOMERS.prueba, lines: [{ article: 'monitor', qty: 10 }] },
  { date: '2026-09-15', customerId: CUSTOMERS.norte, lines: [{ article: 'mouse', qty: 25 }, { article: 'pan', qty: 6 }] },
];

async function main() {
  const connectionString = process.env['APP_DATABASE_URL'];
  if (!connectionString) {
    throw new Error('APP_DATABASE_URL is not set');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  await withTenantContext(prisma, TENANT_ID, async () => {
    const db = getTenantDb();

    const existing = await db.invoice.count({ where: { pointOfSale: POINT_OF_SALE, documentLetter: 'A' } });
    if (existing > 0) {
      throw new Error(
        `El tenant ya tiene ${existing} factura(s) en punto de venta ${POINT_OF_SALE}/A - este script asume que arranca de cero (numeración secuencial propia) y no está pensado para correr dos veces.`,
      );
    }

    const monthlyTotals = new Map<string, Prisma.Decimal>();
    let nextNumber = 1;

    for (const inv of INVOICES) {
      const customer = await db.company.findUniqueOrThrow({ where: { id: inv.customerId } });

      let subtotal = new Prisma.Decimal(0);
      const lineInputs: Prisma.InvoiceLineCreateManyInvoiceInput[] = [];
      for (const line of inv.lines) {
        const { price } = ARTICLES[line.article];
        const netAmount = new Prisma.Decimal(price).mul(line.qty);
        const taxAmount = netAmount.mul(TAX_RATE).div(100);
        subtotal = subtotal.add(netAmount);
        lineInputs.push({
          articleVariantId: ARTICLES[line.article].id,
          quantity: line.qty,
          unitPrice: new Prisma.Decimal(price),
          discountType: 'PERCENTAGE',
          discountValue: 0,
          netAmount,
          taxRate: TAX_RATE,
          taxKind: 'GRAVADO',
          lineTotal: netAmount.add(taxAmount),
        });
      }
      const taxTotal = subtotal.mul(TAX_RATE).div(100);
      const total = subtotal.add(taxTotal);
      const issueDate = new Date(`${inv.date}T15:00:00.000Z`);
      // 30 días de plazo, igual que la mayoría de las condiciones de venta
      // reales - a propósito, no "al contado": así "Antigüedad de cartera"
      // en Resumen reparte entre los 5 baldes en vez de caer todo en
      // "corriente" (ver bucketFor en receivables.service.ts, que trata
      // dueDate null como "corriente" siempre).
      const dueDate = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      await db.invoice.create({
        data: {
          tenantId: TENANT_ID,
          customerId: inv.customerId,
          customerName: customer.name,
          customerTaxId: customer.taxId,
          documentLetter: 'A',
          concept: 'PRODUCTOS',
          pointOfSale: POINT_OF_SALE,
          number: String(nextNumber).padStart(8, '0'),
          status: 'ISSUED',
          issueDate,
          dueDate,
          currencyId: CURRENCY_ID,
          exchangeRate: 1,
          globalDiscountPercent: 0,
          subtotal,
          taxTotal,
          total,
          balanceDue: total,
          issuedByUserId: OWNER_USER_ID,
          lines: { createMany: { data: lineInputs } },
        },
      });
      nextNumber += 1;

      const monthKey = inv.date.slice(0, 7);
      monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) ?? new Prisma.Decimal(0)).add(total));
    }

    console.log(`Creadas ${INVOICES.length} facturas en el tenant demo.`);
    console.log('Totales por mes:');
    for (const [month, total] of [...monthlyTotals.entries()].sort()) {
      console.log(`  ${month}: $${total.toFixed(2)}`);
    }
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
