import { IsBoolean, IsObject, IsOptional } from 'class-validator';

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
}
