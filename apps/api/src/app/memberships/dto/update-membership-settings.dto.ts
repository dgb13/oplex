import { IsIn } from 'class-validator';

export class UpdateMembershipSettingsDto {
  @IsIn([1, 2, 5, 8])
  membershipSessionDurationHours!: number;
}
