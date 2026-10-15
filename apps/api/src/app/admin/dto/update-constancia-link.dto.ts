import { IsString, MaxLength } from 'class-validator';

export class UpdateConstanciaLinkDto {
  @IsString()
  @MaxLength(500)
  url!: string;
}
