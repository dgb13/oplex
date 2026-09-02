import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateTransactionFromLineDto {
  // EXPENSE sólo es válido para una línea de importe negativo (egreso) y
  // INCOME sólo para una positiva (ingreso) - el chequeo de signo real
  // vive en la composición-root (apps/api), acá sólo se valida la forma.
  @IsIn(['EXPENSE', 'INCOME'])
  kind!: 'EXPENSE' | 'INCOME';

  @IsOptional()
  @IsString()
  description?: string;
}
