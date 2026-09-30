import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { AuditEntity } from '@plexo/database';
import { CheckoutPurchaseRequestsDto } from './dto/checkout-purchase-requests.dto.js';
import { CheckoutQuoteDto } from './dto/checkout-quote.dto.js';
import { InventoryCartCheckoutService } from './inventory-cart-checkout.service.js';

@Controller('inventory/cart/checkout')
export class InventoryCartCheckoutController {
  constructor(private readonly checkoutService: InventoryCartCheckoutService) {}

  // Audited as `quoteRequest` (bulk create, idParam: null - same reasoning
  // as QuoteRequestController.createGroup) since the real effect from an
  // activity-log point of view is "N new quote requests exist", same
  // entityType the manual Compras flow already logs under.
  @AuditEntity('quoteRequest', { idParam: null })
  @Roles('OWNER', 'ADMIN', 'INVENTORY', 'PURCHASES')
  @Post('purchase-requests')
  checkoutPurchaseRequests(@Body() dto: CheckoutPurchaseRequestsDto) {
    return this.checkoutService.checkoutPurchaseRequests(dto);
  }

  @AuditEntity('quote', { labelFields: ['number'], idParam: null })
  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post('quote')
  checkoutQuote(@Body() dto: CheckoutQuoteDto) {
    return this.checkoutService.checkoutQuote(dto);
  }
}
