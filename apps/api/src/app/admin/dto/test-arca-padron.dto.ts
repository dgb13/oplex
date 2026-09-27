import { IsString, Matches } from 'class-validator';

export class TestArcaPadronDto {
  @IsString()
  @Matches(/^\d{2}-?\d{8}-?\d$/, { message: 'CUIT inválido' })
  cuit!: string;
}
