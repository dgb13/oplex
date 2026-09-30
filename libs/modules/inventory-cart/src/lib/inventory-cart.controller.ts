import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { InventoryCartService } from './inventory-cart.service.js';
import { CartPdfService } from './pdf/cart-pdf.service.js';

// Broader than Inventario's own WRITE_ROLES (['OWNER','ADMIN','INVENTORY'])
// - the cart feeds both a Compras checkout (INVENTORY/PURCHASES territory)
// and a Ventas checkout (SALES territory), so SALES and PURCHASES need to be
// able to build and use a list too, not just view one.
const WRITE_ROLES = ['OWNER', 'ADMIN', 'INVENTORY', 'SALES', 'PURCHASES'] as const;

@Controller('inventory/cart')
export class InventoryCartController {
  constructor(
    private readonly cartService: InventoryCartService,
    private readonly cartPdfService: CartPdfService,
  ) {}

  @Get()
  list() {
    return this.cartService.list();
  }

  @Roles(...WRITE_ROLES)
  @Post()
  addItem(@Body() dto: AddCartItemDto) {
    return this.cartService.addItem(dto);
  }

  @Roles(...WRITE_ROLES)
  @Patch(':id')
  updateQuantity(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCartItemDto) {
    return this.cartService.updateQuantity(id, dto);
  }

  @Roles(...WRITE_ROLES)
  @Delete(':id')
  removeItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.cartService.removeItem(id);
  }

  @Roles(...WRITE_ROLES)
  @Delete()
  clear() {
    return this.cartService.clear();
  }

  @Get('pdf')
  async downloadPdf() {
    const lines = await this.cartService.getCartLines();
    const buffer = await this.cartPdfService.generate(lines);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: 'attachment; filename="listado.pdf"',
    });
  }
}
