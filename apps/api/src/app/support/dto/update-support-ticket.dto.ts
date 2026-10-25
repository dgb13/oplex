import { IsIn, IsOptional } from 'class-validator';
import type { SupportTicketPriority, SupportTicketStatus } from '@plexo/database';

export class UpdateSupportTicketDto {
  @IsOptional()
  @IsIn(['NEW', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED'])
  status?: SupportTicketStatus;

  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH'])
  priority?: SupportTicketPriority;
}
