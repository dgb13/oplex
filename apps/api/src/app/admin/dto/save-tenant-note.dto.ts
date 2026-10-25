import { IsString, MaxLength } from 'class-validator';

export class SaveTenantNoteDto {
  @IsString()
  @MaxLength(5000)
  body!: string;
}
