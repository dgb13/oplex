import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class GenerateAfipCsrDto {
  // "Nombre simbólico" que después se usa en WSASS - letras y números.
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9]+$/, { message: 'El nombre sólo puede tener letras y números, sin espacios' })
  alias?: string;
}
