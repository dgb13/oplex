import { Module } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ArticleAttachmentsService } from './article-attachments.service.js';
import { ArticleImageService } from './article-image.service.js';
import { ArticleImportService } from './article-import.service.js';
import { CategoryAiService, IMPORT_ANTHROPIC_CLIENT } from './import/category-ai.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';

@Module({
  controllers: [InventoryController],
  providers: [
    InventoryService,
    ArticleImportService,
    ArticleImageService,
    ArticleAttachmentsService,
    CategoryAiService,
    {
      provide: IMPORT_ANTHROPIC_CLIENT,
      // Sin clave configurada la sugerencia con IA responde 503 y el resto anda igual.
      useFactory: () => (process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null),
    },
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
