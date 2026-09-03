import { IsNumber, IsUUID, Min } from 'class-validator';

export class OpenCashSessionDto {
  @IsUUID()
  registerId!: string;

  @IsNumber()
  @Min(0)
  openingAmount!: number;
}
