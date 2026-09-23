import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * avatarUrl here is always a plain string, never a file - real uploads go
 * through POST /auth/me/avatar (UserAvatarService) instead, which writes the
 * resulting `/uploads/users/...` path back via this same field. This DTO
 * covers pasting a URL directly and the avatar picker's preset selections
 * (`preset:<icon>:<color>`, see apps/web/lib/avatarPresets.ts - parsed only
 * on the frontend, opaque to the backend). An empty string clears it back to
 * the initials-based fallback the frontend renders when avatarUrl is unset.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string;

  @IsOptional()
  @IsBoolean()
  showOnlinePresence?: boolean;
}
