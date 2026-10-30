import { UserRole } from '@plexo/database';
import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';

export class ChangeRolesDto {
  // Varios roles por usuario; la combinación la valida normalizeRoles.
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(UserRole, { each: true })
  roles!: UserRole[];
}
