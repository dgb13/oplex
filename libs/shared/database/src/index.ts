export * from './lib/prisma.service.js';
export * from './lib/tenant-context.js';
export * from './lib/tenant-context.interceptor.js';
export * from './lib/activity-log.interceptor.js';
export * from './lib/audit-entity.decorator.js';
export * from './lib/audit-diff.js';
export * from './lib/database.module.js';
export * from './lib/account-balance.js';

// Prisma namespace as a real value (not type-only): Prisma.Decimal, Prisma.sql
// etc. are legitimate runtime utilities business code needs. PrismaClient
// itself is deliberately NOT re-exported here - go through PrismaService /
// getTenantDb() instead, see prisma.service.ts.
export { Prisma } from './generated/client.js';
export type {
  Tenant,
  TenantSettings,
  User,
  UserModuleAccess,
  Company,
  CompanyRole,
  Person,
  Currency,
  ExchangeRateHistory,
  Category,
  Article,
  ArticleVariant,
  PriceHistory,
  Warehouse,
  StockLedger,
  MinimumStock,
  StockMovement,
  Invoice,
  InvoiceLine,
  CreditNote,
  CreditNoteLine,
  Quote,
  QuoteLine,
  Receipt,
  AccountingAccount,
  JournalEntry,
  JournalEntryLine,
  TaxDefinition,
  FinancialAccount,
  FinancialTransaction,
  Check,
  AuditLog,
  UserActivityLog,
  TransportMode,
  PaymentTerm,
  DeliveryTime,
  QuoteRequest,
  QuoteRequestLine,
  PurchaseOrder,
  PurchaseOrderLine,
  GoodsReceipt,
  GoodsReceiptLine,
  SupplierReturn,
  SupplierReturnLine,
  PurchaseInvoice,
  PurchaseInvoiceTaxLine,
  PurchaseInvoiceReceipt,
  PurchaseCreditNote,
  PurchaseCreditNoteTaxLine,
  SupplierPayment,
  WithholdingRegime,
  SupplierPaymentWithholding,
  InventoryCartItem,
  Plan,
  TenantSubscription,
  SystemErrorLog,
  DatabaseBackup,
  Connector,
  ConnectorSecret,
  PaymentIntent,
  WebhookEvent,
  BankStatementImport,
  BankStatementLine,
} from './generated/client.js';
export * from './generated/enums.js';
