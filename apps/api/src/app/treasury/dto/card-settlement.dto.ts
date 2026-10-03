import { CARD_SETTLEMENT_DISCOUNT_TYPES, type CardSettlementDiscountType } from '@plexo/accounting';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CardSettlementDiscountDto {
  @IsIn(CARD_SETTLEMENT_DISCOUNT_TYPES)
  type!: CardSettlementDiscountType;

  @IsNumber()
  @Min(0)
  amount!: number;
}

// "Liquidación de tarjeta" de Tesorería - ver TreasuryService.recordCardSettlement.
export class CardSettlementDto {
  @IsUUID()
  fromFinancialAccountId!: string;

  @IsUUID()
  toFinancialAccountId!: string;

  // Total de ventas liquidadas, antes de descuentos.
  @IsNumber()
  @IsPositive()
  grossAmount!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CardSettlementDiscountDto)
  discounts!: CardSettlementDiscountDto[];

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  // N° de liquidación de la procesadora.
  @IsOptional()
  @IsString()
  reference?: string;
}
