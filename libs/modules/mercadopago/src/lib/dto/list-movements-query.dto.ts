import { IsIn, IsNumberString, IsOptional, Matches } from 'class-validator';
import type { MovementOriginFilter } from '../mercadopago-movements.service.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ListMovementsQueryDto {
  @IsOptional()
  @Matches(DAY, { message: 'from debe ser AAAA-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DAY, { message: 'to debe ser AAAA-MM-DD' })
  to?: string;

  @IsOptional()
  @IsIn(['all', 'caja', 'docs', 'outside', 'unassigned'])
  origin?: MovementOriginFilter;

  // Query string: llega como texto (el paquete no usa class-transformer).
  @IsOptional()
  @IsNumberString()
  page?: string;
}
