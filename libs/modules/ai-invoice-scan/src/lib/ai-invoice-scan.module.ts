import { Module } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_CLIENT } from './anthropic-client.token.js';
import { AiInvoiceExtractionService } from './ai-invoice-extraction.service.js';
import { ConstanciaExtractionService } from './constancia-extraction.service.js';

@Module({
  providers: [
    {
      provide: ANTHROPIC_CLIENT,
      useFactory: () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
    },
    AiInvoiceExtractionService,
    ConstanciaExtractionService,
  ],
  exports: [AiInvoiceExtractionService, ConstanciaExtractionService],
})
export class AiInvoiceScanModule {}
