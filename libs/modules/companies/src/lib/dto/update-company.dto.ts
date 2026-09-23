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

/** When roles is provided, it REPLACES the company's full role set
 * (delete + recreate) rather than adding to it - simplest correct
 * semantics, avoids ambiguity about whether an omitted role should be
 * removed or just not mentioned. */
export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

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

  @IsOptional()
  @IsString()
  pointOfSaleNumber?: string;

  @IsOptional()
  @IsString()
  taxCondition?: string;

  @IsOptional()
  @IsString()
  fiscalAddress?: string;

  @IsOptional()
  @IsEnum(CompanyIndustry)
  industry?: CompanyIndustry;

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

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(CompanyRoleType, { each: true })
  roles?: CompanyRoleType[];

  // Soft delete: false hides the company from default listings and blocks
  // new invoices/sales against it, without touching any historical record
  // that already references it (see Company.active in schema.prisma).
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
