import { IsBoolean } from 'class-validator';

// Sólo `isMonetary` es editable por ahora (código/nombre/tipo no tienen
// caso de uso de edición todavía, no se agrega superficie sin pedido real).
export class UpdateAccountDto {
  @IsBoolean()
  isMonetary!: boolean;
}
