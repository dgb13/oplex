import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const TEMPLATES = ['aire', 'atelier', 'pop', 'taller', 'mercado', 'neon', 'revista', 'vitrina'];

export class UpdateStorefrontSettingsDto {
  // Se normaliza en el service (Casa Nativa -> casa-nativa).
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  subdomain!: string;

  @IsBoolean()
  published!: boolean;

  @IsIn(TEMPLATES)
  template!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^#[0-9a-fA-F]{6}$/)
  accentColor?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  warehouseId?: string | null;

  @IsIn(['LOW', 'ALWAYS', 'NEVER'])
  stockDisplay!: 'LOW' | 'ALWAYS' | 'NEVER';

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^[+\d\s()-]{8,25}$/, { message: 'El WhatsApp tiene que ser un número de teléfono, con código de área' })
  whatsappNumber?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail({}, { message: 'El email de avisos no es válido' })
  notifyEmail?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  heroTitle?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(220)
  heroSubtitle?: string | null;
}

export class StorefrontOrderLineDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}

export class CreateStorefrontOrderDto {
  @IsString()
  @MinLength(2, { message: 'Escribí tu nombre' })
  @MaxLength(80)
  customerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'El pedido está vacío' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => StorefrontOrderLineDto)
  lines!: StorefrontOrderLineDto[];
}

export class UpdateStorefrontOrderStatusDto {
  @IsIn(['NEW', 'CONFIRMED', 'DONE', 'CANCELLED'])
  status!: 'NEW' | 'CONFIRMED' | 'DONE' | 'CANCELLED';
}
