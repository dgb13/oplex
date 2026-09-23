import { CompanyIndustry, CompanyRoleType } from '@plexo/database';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

/**
 * roles is required and non-empty: a Company only exists here because
 * it's a customer, a supplier, a branch/point of sale, or some
 * combination - "no role" would be a row with no reason to exist.
 */
export class CreateCompanyDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  // Only meaningful when roles includes BRANCH - the AFIP punto de venta
  // invoices issued from this branch declare.
  @IsOptional()
  @IsString()
  pointOfSaleNumber?: string;

  // Best-effort AFIP padrón data (see Company.taxCondition in
  // schema.prisma) - the frontend fills these from the "Buscar en AFIP"
  // lookup result, never independently validated here.
  @IsOptional()
  @IsString()
  taxCondition?: string;

  @IsOptional()
  @IsString()
  fiscalAddress?: string;

  @IsOptional()
  @IsEnum(CompanyIndustry)
  industry?: CompanyIndustry;

  // Ingresos Brutos (provincial), independent of taxId/CUIT - see
  // Company.grossIncomeNumber in schema.prisma.
  @IsOptional()
  @IsString()
  grossIncomeNumber?: string;

  @IsOptional()
  @IsBoolean()
  withholdsVat?: boolean;

  @IsOptional()
  @IsBoolean()
  withholdsIncomeTax?: boolean;

  @IsOptional()
  @IsBoolean()
  withholdsGrossIncome?: boolean;

  // URL only, no upload/storage infra - see Company.logoUrl in
  // schema.prisma.
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(CompanyRoleType, { each: true })
  roles!: CompanyRoleType[];
}
