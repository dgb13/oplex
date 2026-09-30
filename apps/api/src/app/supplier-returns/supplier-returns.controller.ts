import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { CreateSupplierReturnDto } from '@plexo/purchases';
import { SupplierReturnsService } from './supplier-returns.service.js';

// Same write-access roles as the rest of Compras/Inventario.
const WRITE_ROLES = ['OWNER', 'ADMIN', 'INVENTORY', 'PURCHASES'] as const;

@Controller('purchases/supplier-returns')
export class SupplierReturnsController {
  constructor(private readonly supplierReturnsService: SupplierReturnsService) {}

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateSupplierReturnDto) {
    return this.supplierReturnsService.createReturn(dto);
  }
}
