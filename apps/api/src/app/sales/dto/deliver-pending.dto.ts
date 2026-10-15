import { IsNumber, IsOptional, IsPositive } from 'class-validator';

export class DeliverPendingDto {
  // Sin cantidad = todo lo pendiente.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;
}
