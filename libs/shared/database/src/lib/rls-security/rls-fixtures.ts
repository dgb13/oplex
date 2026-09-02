import type { PoolClient } from 'pg';
import { asTenant, insertRow, newId } from './rls-test-client.js';

export interface TenantFixture {
  tenantId: string;
  /** Every row this fixture created, keyed by table name - what
   * cross-tenant-read.rls-spec.ts iterates to probe every table it
   * actually populated with real data (as opposed to
   * tenant-scoped-tables.rls-spec.ts, which checks EVERY tenant-scoped
   * table structurally regardless of whether it has any rows). */
  idsByTable: Record<string, string[]>;
  ids: {
    userId: string;
    companyId: string;
    currencyId: string;
    warehouseId: string;
    articleVariantId: string;
    purchaseInvoiceId: string;
    purchaseCreditNoteId: string;
    checkId: string;
    invoiceId: string;
    accountingAccountId: string;
    journalEntryId: string;
  };
}

/**
 * Seeds one full, realistic-shaped business graph for a single tenant,
 * touching essentially every tenant-scoped table in the schema (companies,
 * inventory, purchasing incl. the PurchaseCreditNote chain, sales incl.
 * CreditNote, accounting, auth/team, activity) - all inserts run as
 * `plexo_app` under `tenantId`'s own RLS context (see asTenant()), the same
 * as every real write the app makes. Must be called from inside
 * `asTenant(tenantId, ...)` with a `tenants` row for `tenantId` already
 * created in that same transaction (this function doesn't create the
 * Tenant row itself - see cross-tenant-read.rls-spec.ts for why: creating
 * the tenant needs `id = current_setting('app.tenant_id')`, which is the
 * caller's concern, not this fixture's).
 *
 * Raw SQL throughout, not Prisma - this suite exists to prove Postgres
 * itself enforces isolation, independent of the ORM layer sitting on top
 * of it.
 */
export async function seedTenantGraph(client: PoolClient, tenantId: string, label: string): Promise<TenantFixture> {
  const idsByTable: Record<string, string[]> = {};
  const record = (table: string, id: string): string => {
    (idsByTable[table] ??= []).push(id);
    return id;
  };
  const ins = (table: string, values: Record<string, unknown>) =>
    insertRow(client, table, newId(), values).then((id) => record(table, id));

  // --- Tenant-singleton settings/subscription ---
  // updatedAt is explicit on both - unlike createdAt/date elsewhere, Prisma's
  // @updatedAt has no DB-level default (confirmed via information_schema),
  // it's normally stamped by the Prisma client itself on every write.
  await ins('tenant_settings', { tenantId, updatedAt: new Date() });
  const plan = await client.query<{ id: string }>(`SELECT id FROM plans WHERE key = 'BASIC' LIMIT 1`);
  if (plan.rows[0]) {
    await ins('tenant_subscriptions', {
      tenantId,
      planId: plan.rows[0].id,
      status: 'TRIALING',
      updatedAt: new Date(),
    });
  }

  // --- Users / auth / team ---
  const userId = await ins('users', {
    tenantId,
    email: `rls-${label}@test.local`,
    passwordHash: 'x',
    role: 'OWNER',
  });
  await ins('user_module_access', { tenantId, userId, module: 'inventory', canRead: true, canWrite: true });
  await ins('email_verification_codes', {
    tenantId,
    userId,
    codeHash: 'x',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  await ins('password_reset_tokens', {
    tenantId,
    userId,
    tokenHash: `reset-${label}`,
    expiresAt: new Date(Date.now() + 3600_000),
  });
  await ins('team_invitations', {
    tenantId,
    email: `invitee-${label}@test.local`,
    role: 'SALES',
    tokenHash: `invite-${label}`,
    expiresAt: new Date(Date.now() + 3600_000),
    invitedByUserId: userId,
  });
  await ins('oauth_accounts', {
    tenantId,
    userId,
    provider: 'GOOGLE',
    providerAccountId: `google-${label}-${tenantId}`,
    email: `rls-${label}@test.local`,
  });
  await ins('user_activity_log', {
    tenantId,
    userId,
    action: 'RLS_TEST_SEED',
    outcome: 'SUCCESS',
  });

  // --- Companies / people ---
  const companyId = await ins('companies', { tenantId, name: `RLS Co ${label}` });
  await ins('company_roles', { tenantId, companyId, role: 'CUSTOMER' });
  await ins('company_roles', { tenantId, companyId, role: 'SUPPLIER' });
  await ins('people', { tenantId, companyId, firstName: `Contact ${label}` });

  // --- Currency / inventory catalog ---
  const currencyId = await ins('currencies', { tenantId, code: 'ARS', name: 'Peso' });
  await ins('exchange_rate_history', { tenantId, currencyId, rate: 1000 });
  const warehouseId = await ins('warehouses', { tenantId, name: `Depósito ${label}` });
  const categoryId = await ins('categories', { tenantId, name: `Categoría ${label}` });
  const taxDefinitionId = await ins('tax_definitions', { tenantId, code: `IVA21-${label}`, name: 'IVA 21%', rate: 21 });
  const articleId = await ins('articles', {
    tenantId,
    name: `Artículo ${label}`,
    categoryId,
    taxDefinitionId,
    preferredSupplierId: companyId,
  });
  const articleVariantId = await ins('article_variants', {
    tenantId,
    articleId,
    sku: `SKU-${label}`,
    unitPrice: 100,
  });
  await ins('minimum_stock', { tenantId, warehouseId, articleVariantId, minimumQuantity: 1 });
  await ins('stock_ledger', { tenantId, warehouseId, articleVariantId, quantity: 10, updatedAt: new Date() });
  await ins('price_history', { tenantId, articleVariantId, unitPrice: 100 });
  await ins('inventory_cart_items', {
    tenantId,
    userId,
    articleVariantId,
    quantity: 1,
    updatedAt: new Date(),
  });

  // --- Purchases catalogs ---
  await ins('transport_modes', { tenantId, name: `Transporte ${label}` });
  await ins('payment_terms', { tenantId, name: `Plazo ${label}` });
  await ins('delivery_times', { tenantId, name: `Entrega ${label}` });
  const withholdingRegimeId = await ins('withholding_regimes', {
    tenantId,
    code: `RET-${label}`,
    name: 'Retención IIBB',
    taxType: 'GROSS_INCOME',
    jurisdiction: 'CABA',
    rate: 3,
  });

  // --- Accounting ---
  const payableAccountId = await ins('accounting_accounts', { tenantId, code: `2.1.05-${label}`, name: 'Proveedores', type: 'LIABILITY' });
  const inventoryAccountId = await ins('accounting_accounts', { tenantId, code: `1.1.04-${label}`, name: 'Mercaderías', type: 'ASSET' });
  const financialAccountId = await ins('financial_accounts', { tenantId, name: `Caja ${label}`, provider: 'CASH' });

  // --- Compras: QuoteRequest -> PurchaseOrder -> GoodsReceipt -> PurchaseInvoice -> PurchaseCreditNote / SupplierPayment / SupplierReturn ---
  const quoteRequestId = await ins('quote_requests', {
    tenantId,
    number: `PED-${label}`,
    supplierId: companyId,
    currencyId,
    createdByUserId: userId,
  });
  await ins('quote_request_lines', { tenantId, quoteRequestId, articleVariantId, quantity: 1 });

  const purchaseOrderId = await ins('purchase_orders', {
    tenantId,
    number: `OC-${label}`,
    supplierId: companyId,
    currencyId,
    total: 100,
    createdByUserId: userId,
  });
  const purchaseOrderLineId = await ins('purchase_order_lines', {
    tenantId,
    purchaseOrderId,
    articleVariantId,
    quantity: 1,
    unitCost: 100,
  });

  const goodsReceiptId = await ins('goods_receipts', {
    tenantId,
    purchaseOrderId,
    warehouseId,
    receivedByUserId: userId,
  });
  const goodsReceiptLineId = await ins('goods_receipt_lines', {
    tenantId,
    goodsReceiptId,
    purchaseOrderLineId,
    quantity: 1,
  });

  const purchaseInvoiceId = await ins('purchase_invoices', {
    tenantId,
    purchaseOrderId,
    supplierId: companyId,
    supplierName: `RLS Co ${label}`,
    supplierInvoiceNumber: `PI-${label}`,
    supplierInvoiceDate: new Date(),
    currencyId,
    subtotal: 100,
    taxTotal: 21,
    total: 121,
    balanceDue: 121,
    createdByUserId: userId,
  });
  await ins('purchase_invoice_tax_lines', {
    tenantId,
    purchaseInvoiceId,
    type: 'IVA_CREDITO',
    concept: 'IVA 21%',
    amount: 21,
  });
  await ins('purchase_invoice_receipts', { tenantId, purchaseInvoiceId, goodsReceiptId });

  const purchaseCreditNoteId = await ins('purchase_credit_notes', {
    tenantId,
    purchaseInvoiceId,
    supplierId: companyId,
    supplierName: `RLS Co ${label}`,
    supplierCreditNoteNumber: `NC-${label}`,
    supplierCreditNoteDate: new Date(),
    reason: 'RLS test fixture',
    currencyId,
    subtotal: 10,
    taxTotal: 2.1,
    total: 12.1,
    createdByUserId: userId,
  });
  await ins('purchase_credit_note_tax_lines', {
    tenantId,
    purchaseCreditNoteId,
    type: 'IVA_CREDITO',
    concept: 'IVA 21%',
    amount: 2.1,
  });

  const supplierPaymentId = await ins('supplier_payments', {
    tenantId,
    purchaseInvoiceId,
    amount: 50,
    method: 'transfer',
    financialAccountId,
    recordedByUserId: userId,
  });
  await ins('supplier_payment_withholdings', {
    tenantId,
    supplierPaymentId,
    regimeId: withholdingRegimeId,
    taxType: 'GROSS_INCOME',
    jurisdiction: 'CABA',
    concept: 'IIBB',
    amount: 3,
  });

  const supplierReturnId = await ins('supplier_returns', {
    tenantId,
    goodsReceiptId,
    reason: 'RLS test fixture',
    returnedByUserId: userId,
  });
  await ins('supplier_return_lines', { tenantId, supplierReturnId, goodsReceiptLineId, quantity: 1 });

  // --- Ventas: Invoice -> CreditNote, Receipt, stock movement ---
  const invoiceId = await ins('invoices', {
    tenantId,
    customerId: companyId,
    customerName: `RLS Co ${label}`,
    documentLetter: 'B',
    pointOfSale: '0001',
    number: `B-${label}`,
    currencyId,
    exchangeRate: 1,
    subtotal: 100,
    taxTotal: 21,
    total: 121,
    balanceDue: 121,
    issuedByUserId: userId,
  });
  const invoiceLineId = await ins('invoice_lines', {
    tenantId,
    invoiceId,
    articleVariantId,
    quantity: 1,
    unitPrice: 100,
    netAmount: 100,
    taxRate: 21,
    lineTotal: 121,
  });
  const creditNoteId = await ins('credit_notes', {
    tenantId,
    invoiceId,
    documentLetter: 'B',
    pointOfSale: '0001',
    number: `NC-B-${label}`,
    reason: 'RLS test fixture',
    currencyId,
    exchangeRate: 1,
    subtotal: 10,
    taxTotal: 2.1,
    total: 12.1,
    issuedByUserId: userId,
  });
  await ins('credit_note_lines', {
    tenantId,
    creditNoteId,
    invoiceLineId,
    quantity: 0.1,
    netAmount: 10,
    taxAmount: 2.1,
    lineTotal: 12.1,
  });
  const receiptId = await ins('receipts', { tenantId, invoiceId, amount: 50, method: 'transfer', financialAccountId });
  await ins('financial_transactions', { tenantId, financialAccountId, amount: 50 });
  const checkId = await ins('checks', {
    tenantId,
    kind: 'THIRD_PARTY',
    format: 'PHYSICAL',
    number: `CHK-${label}`,
    bankName: 'Banco RLS',
    amount: 50,
    issueDate: new Date(),
    dueDate: new Date(),
    status: 'DEPOSITED',
    customerId: companyId,
    receiptId,
    financialAccountId,
    createdByUserId: userId,
  });
  const bankStatementImportId = await ins('bank_statement_imports', {
    tenantId,
    financialAccountId,
    fileName: `extracto-${label}.xlsx`,
    fileHash: `hash-${label}`,
    lineCount: 1,
    createdByUserId: userId,
  });
  await ins('bank_statement_lines', {
    tenantId,
    bankStatementImportId,
    financialAccountId,
    lineDate: new Date(),
    description: 'RLS test fixture',
    amount: 50,
    status: 'PENDING',
  });
  await ins('inflation_adjustments', {
    tenantId,
    periodFrom: new Date(Date.UTC(2026, 0, 1)),
    periodTo: new Date(Date.UTC(2026, 5, 1)),
    recpamAmount: 100,
    createdByUserId: userId,
  });
  await ins('stock_movements', {
    tenantId,
    warehouseId,
    articleVariantId,
    type: 'ADJUSTMENT',
    quantity: 1,
  });

  // --- Cotizaciones (sales-side Quote, unrelated to QuoteRequest above) ---
  const quoteId = await ins('quotes', {
    tenantId,
    number: `PRE-${label}`,
    customerId: companyId,
    currencyId,
    total: 100,
    createdByUserId: userId,
  });
  await ins('quote_lines', { tenantId, quoteId, articleVariantId, quantity: 1, unitPrice: 100 });

  // --- Journal entries (accounting ledger) ---
  const journalEntryId = await ins('journal_entries', {
    tenantId,
    description: `RLS test fixture ${label}`,
    createdById: userId,
  });
  await ins('journal_entry_lines', { tenantId, journalEntryId, accountId: payableAccountId, direction: 'DEBIT', amount: 100 });
  await ins('journal_entry_lines', { tenantId, journalEntryId, accountId: inventoryAccountId, direction: 'CREDIT', amount: 100 });

  // --- Connectors (Mercado Pago / future Tiendanube-ML) ---
  const connectorId = await ins('connectors', {
    tenantId,
    provider: 'MERCADO_PAGO',
    status: 'CONNECTED',
    connectedByUserId: userId,
    updatedAt: new Date(),
  });
  await ins('connector_secrets', {
    tenantId,
    connectorId,
    key: 'access_token',
    value: 'rls-fixture-ciphertext',
    updatedAt: new Date(),
  });
  await ins('payment_intents', {
    tenantId,
    connectorId,
    documentType: 'INVOICE',
    documentId: invoiceId,
    amount: 50,
    idempotencyKey: `rls-fixture-${label}-${newId()}`,
    updatedAt: new Date(),
  });

  // --- audit_log: populated exclusively by DB triggers (see its own doc
  // comment in schema.prisma), never inserted directly - several of the
  // inserts above (articles, article_variants, invoices, invoice_lines,
  // credit_notes, journal_entries, journal_entry_lines, tax_definitions,
  // accounting_accounts, minimum_stock) already fired it, just pick up
  // whatever rows exist for this tenant so the read-isolation test covers
  // this table too instead of skipping it.
  const auditRows = await client.query<{ id: string }>(
    `SELECT id FROM audit_log WHERE "tenantId" = $1`,
    [tenantId],
  );
  for (const row of auditRows.rows) {
    record('audit_log', row.id);
  }

  return {
    tenantId,
    idsByTable,
    ids: {
      userId,
      companyId,
      currencyId,
      warehouseId,
      articleVariantId,
      purchaseInvoiceId,
      purchaseCreditNoteId,
      checkId,
      invoiceId,
      accountingAccountId: payableAccountId,
      journalEntryId,
    },
  };
}

/**
 * Reverse dependency order of every insert seedTenantGraph() makes (plus
 * `tenants` itself, last) - children before parents, so each DELETE never
 * trips a foreign key still pointing at a row from a later step. No WHERE
 * clause needed on any of them: run inside asTenant(tenantId, ...), the
 * same `USING (tenantId = current_setting(...))` policy that scopes every
 * SELECT also scopes DELETE, so `DELETE FROM "x"` here can only ever touch
 * this tenant's own rows - RLS itself is what makes this cleanup safe to
 * run against a shared dev database with other real tenants' data in it.
 *
 * `audit_log` and `user_activity_log` are deliberately NOT in this list -
 * both are append-only by design and `plexo_app` was only ever GRANTed
 * INSERT/SELECT on them (confirmed via information_schema.role_table_grants
 * - no UPDATE, no DELETE), audit_log additionally enforced by a DB trigger
 * (`audit_log_immutable`). A DELETE against either is expected to fail with
 * a permission error, not an empty no-op. The handful of rows this fixture
 * puts in them for a since-deleted synthetic test tenant are harmless and
 * left behind on purpose, same as any other audit trail.
 *
 * `journal_entries`/`journal_entry_lines`/`stock_movements` are ALSO
 * deliberately not in this list, for a related but distinct reason: their
 * `journal_entry_lock`/`journal_entry_line_lock`/`stock_movements_lock`
 * triggers unconditionally block UPDATE and DELETE the moment a row exists
 * - unlike invoices/invoice_lines/credit_notes, whose own fiscal_lock
 * triggers only engage once `afipCae` is set (this fixture never sets one,
 * so those three delete fine), these three ledgers have no such gate: a
 * journal entry is "posted" and a stock movement is "recorded" the instant
 * either is created, correctable only by inserting a reversing/adjusting
 * row, never by mutating history. Confirmed by reading each trigger
 * function's actual body (pg_get_functiondef), not assumed from the error
 * message alone.
 *
 * That in turn drags a small, bounded set of otherwise-deletable tables
 * along with it, via plain FK RESTRICT (not RLS, not a trigger): every
 * table those three permanently-locked rows themselves point at can no
 * longer be deleted either, since the still-existing locked row would
 * violate the FK. Traced one hop at a time from what this fixture actually
 * set: journal_entry_lines -> accounting_accounts; journal_entries ->
 * users; stock_movements -> warehouses, article_variants -> articles (its
 * required articleId) -> categories/tax_definitions/companies (the
 * categoryId/taxDefinitionId/preferredSupplierId this fixture happens to
 * set on its one Article row). None of those 8 have any further outward
 * required FK of their own, so the cascade stops there. All of them are
 * still deleted-FROM safely by everything earlier in this list that
 * references them as children (people/company_roles before companies,
 * invoice_lines before article_variants, etc.) - RESTRICT only blocks
 * deleting the PARENT while a child row still exists, never the reverse.
 *
 * The rows left behind per synthetic test tenant across all of this remain
 * a small, fixed, clearly-synthetic set (email like rls-*@test.local,
 * company name like "RLS Co *") - harmless, same as audit_log/
 * user_activity_log above.
 */
const CLEANUP_TABLES_REVERSE = [
  'payment_intents',
  'connector_secrets',
  'connectors',
  'quote_lines',
  'quotes',
  'financial_transactions',
  'checks',
  'inflation_adjustments',
  'bank_statement_lines',
  'bank_statement_imports',
  'receipts',
  'credit_note_lines',
  'credit_notes',
  'invoice_lines',
  'invoices',
  'supplier_return_lines',
  'supplier_returns',
  'supplier_payment_withholdings',
  'supplier_payments',
  'purchase_credit_note_tax_lines',
  'purchase_credit_notes',
  'purchase_invoice_receipts',
  'purchase_invoice_tax_lines',
  'purchase_invoices',
  'goods_receipt_lines',
  'goods_receipts',
  'purchase_order_lines',
  'purchase_orders',
  'quote_request_lines',
  'quote_requests',
  'financial_accounts',
  'withholding_regimes',
  'delivery_times',
  'payment_terms',
  'transport_modes',
  'inventory_cart_items',
  'price_history',
  'stock_ledger',
  'minimum_stock',
  'exchange_rate_history',
  'currencies',
  'people',
  'company_roles',
  'oauth_accounts',
  'team_invitations',
  'password_reset_tokens',
  'email_verification_codes',
  'user_module_access',
  'tenant_subscriptions',
  'tenant_settings',
  'tenants',
];

export async function cleanupTenantGraph(tenantId: string): Promise<void> {
  await asTenant(tenantId, async (client) => {
    for (const table of CLEANUP_TABLES_REVERSE) {
      await client.query(`DELETE FROM "${table}"`);
    }
  });
}
