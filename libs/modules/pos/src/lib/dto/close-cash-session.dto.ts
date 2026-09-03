import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CloseCashSessionDto {
  @IsNumber()
  @Min(0)
  countedAmount!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
