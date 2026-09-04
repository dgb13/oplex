import { TaxDeadlineKind } from '@plexo/database';
import { IsDateString, IsEnum, IsString, MinLength } from 'class-validator';

export class CreateTaxDeadlineDto {
  @IsEnum(TaxDeadlineKind)
  kind!: TaxDeadlineKind;

  @IsDateString()
  dueDate!: string;

  @IsString()
  @MinLength(1)
  description!: string;
}
