import { NOTIFICATION_PREFERENCES } from '@plexo/database';
import { ArrayMaxSize, IsArray, IsIn } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  // Las preferencias APAGADAS - lo que no esté acá, se recibe.
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(Object.keys(NOTIFICATION_PREFERENCES), { each: true })
  muted!: string[];
}
