import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { AuditEntity } from '@plexo/database';
import { CreatePurchaseCreditNoteDto } from '@plexo/purchases';
import { PurchaseCreditNotesService } from './purchase-credit-notes.service.js';

// Same write-access roles as the rest of Compras/Cuentas a Pagar
// (purchase-invoices.controller.ts).
const WRITE_ROLES = ['OWNER', 'ADMIN', 'INVENTORY', 'PURCHASES'] as const;

@Controller('purchases/purchase-credit-notes')
export class PurchaseCreditNotesController {
  constructor(private readonly purchaseCreditNotesService: PurchaseCreditNotesService) {}

  @AuditEntity('purchaseCreditNote', { labelFields: ['supplierCreditNoteNumber'], idParam: null })
  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreatePurchaseCreditNoteDto) {
    return this.purchaseCreditNotesService.createCreditNote(dto);
  }
}
