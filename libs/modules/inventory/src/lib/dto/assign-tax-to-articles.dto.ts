import { IsUUID } from 'class-validator';

/** "N artículos no tienen IVA cargado -> asignar a todos" (lista de
 * Inventario). Sólo toca los que no tienen ninguna alícuota. */
export class AssignTaxToArticlesDto {
  @IsUUID()
  taxDefinitionId!: string;
}
