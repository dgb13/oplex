import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateWorkOrderDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  intakeNotes?: string;

  /** Datos de la ficha que cambiaron al ingresar (los km de hoy). Se guardan
   * en la ficha y quedan copiados en la orden. */
  @IsOptional()
  @IsObject()
  assetValues?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsDateString()
  promisedAt?: string;
}

export class UpdateWorkOrderDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  intakeNotes?: string;

  /** null = sin responsable. */
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @IsOptional()
  @IsDateString()
  promisedAt?: string | null;

  /** Vincula la cotización (y la factura) del trabajo. null desvincula. */
  @IsOptional()
  @IsUUID()
  quoteId?: string | null;

  @IsOptional()
  @IsUUID()
  invoiceId?: string | null;
}

export class ChangeWorkOrderStatusDto {
  @IsUUID()
  statusId!: string;
}

export class WorkOrderStatusInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;

  @IsOptional()
  @IsBoolean()
  notifiesCustomer?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateWorkOrderStatusesDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => WorkOrderStatusInputDto)
  statuses!: WorkOrderStatusInputDto[];

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  docName?: string;
}

export class ListWorkOrdersQuery {
  @IsOptional()
  @IsUUID()
  statusId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  /** open = sin estado final. */
  @IsOptional()
  @IsIn(['open', 'closed', 'all'])
  scope?: 'open' | 'closed' | 'all';
}
