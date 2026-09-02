import { IsEnum, IsOptional } from 'class-validator';
import { BankStatementLineStatus } from '@plexo/database';

export class ListStatementLinesQueryDto {
  @IsOptional()
  @IsEnum(BankStatementLineStatus)
  status?: BankStatementLineStatus;
}
