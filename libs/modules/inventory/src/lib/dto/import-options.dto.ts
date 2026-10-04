import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';
import { IMPORT_FIELDS } from '../import/import-fields.js';

const MAPPING_VALUES = [...IMPORT_FIELDS, 'skip'] as const;

/** Elecciones del usuario en el importador (ver ArticleImportService). */
export class ImportOptionsDto {
  // Un valor por columna del archivo, en orden: el campo de Oplex o "skip".
  @IsArray()
  @ArrayMaxSize(200)
  @IsIn(MAPPING_VALUES, { each: true })
  mapping!: (typeof MAPPING_VALUES)[number][];

  @IsIn(['update', 'skip'])
  onExisting!: 'update' | 'skip';

  @IsBoolean()
  pricesIncludeVat!: boolean;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  // Valor de IVA del archivo -> id de impuesto.
  @IsOptional()
  @IsObject()
  taxValues?: Record<string, string>;

  // Valor de unidad del archivo -> UNIT/KG/LTR/MM/M2.
  @IsOptional()
  @IsObject()
  unitValues?: Record<string, 'UNIT' | 'KG' | 'LTR' | 'MM' | 'M2'>;
}
