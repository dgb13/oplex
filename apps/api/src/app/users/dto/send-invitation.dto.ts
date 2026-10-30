import { UserRole } from '@plexo/database';
import { ArrayNotEmpty, IsArray, IsEmail, IsEnum } from 'class-validator';

export class SendInvitationDto {
  @IsEmail()
  email!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(UserRole, { each: true })
  roles!: UserRole[];
}
