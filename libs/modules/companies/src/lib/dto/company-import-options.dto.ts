import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';
import { COMPANY_IMPORT_FIELDS } from '../import/company-import-fields.js';

const MAPPING_VALUES = [...COMPANY_IMPORT_FIELDS, 'skip'] as const;

/** Elecciones del usuario en el importador de empresas (ver CompanyImportService). */
export class CompanyImportOptionsDto {
  // Un valor por columna del archivo, en orden: el campo de Oplex o "skip".
  @IsArray()
  @ArrayMaxSize(200)
  @IsIn(MAPPING_VALUES, { each: true })
  mapping!: (typeof MAPPING_VALUES)[number][];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(['CUSTOMER', 'SUPPLIER'], { each: true })
  roles!: ('CUSTOMER' | 'SUPPLIER')[];

  @IsIn(['fill', 'replace', 'skip'])
  onExisting!: 'fill' | 'replace' | 'skip';

  @IsBoolean()
  verifyArca!: boolean;

  // Valor de condición de IVA del archivo -> condición de Oplex (o "__none__").
  @IsOptional()
  @IsObject()
  conditionValues?: Record<string, string>;
}
