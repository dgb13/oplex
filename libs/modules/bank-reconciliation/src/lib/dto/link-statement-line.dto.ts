import { IsUUID } from 'class-validator';

export class LinkStatementLineDto {
  @IsUUID()
  transactionId!: string;
}
