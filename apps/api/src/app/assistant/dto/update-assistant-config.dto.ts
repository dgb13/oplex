import { IsBoolean, IsInt, IsNumber, IsObject, IsOptional, Max, Min, ValidateIf } from 'class-validator';

export class UpdateAssistantConfigDto {
  @IsOptional()
  @IsBoolean()
  webEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  salesOwnDataOnly?: boolean;

  /** { "<tema>": ["SALES", ...] } - sólo los temas que cambian. Temas o
   * roles desconocidos, y celdas que el rol no puede tener, se descartan en
   * normalizeTopicsByRole (nunca se guarda más permiso que el del rol). */
  @IsOptional()
  @IsObject()
  topicsByRole?: Record<string, string[]>;

  /** { "<acción>": "OFF" | "DRAFT" | "DIRECT" } - un nivel que la acción no
   * admite cae a su default (normalizeActionLevels). */
  @IsOptional()
  @IsObject()
  actionLevels?: Record<string, string>;

  @IsOptional()
  @IsObject()
  actionRoles?: Record<string, string[]>;

  /** null = sin tope. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  maxQuoteAmountWhatsapp?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxActionsPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  confirmExpiryMinutes?: number;
}
