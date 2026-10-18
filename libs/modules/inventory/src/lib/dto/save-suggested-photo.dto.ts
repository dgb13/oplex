import { IsString, IsUrl, MaxLength } from 'class-validator';

/** Una de las fotos de GET /inventory/photo-suggestions, tal cual vino. */
export class SaveSuggestedPhotoDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url!: string;

  @IsString()
  @MaxLength(200)
  credit!: string;
}
