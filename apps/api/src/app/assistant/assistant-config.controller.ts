import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { AssistantAccessService } from './assistant-access.service.js';
import { UpdateAssistantConfigDto } from './dto/update-assistant-config.dto.js';

// Mismo gate que Preferencias y que el Historial: es política de la empresa.
const CONFIG_ROLES = ['OWNER', 'ADMIN'] as const;

/** "Temas por rol" y canales de Preferencias › Asistente (etapa 2 de
 * docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md). */
@Controller('assistant/config')
export class AssistantConfigController {
  constructor(private readonly assistantAccessService: AssistantAccessService) {}

  @Roles(...CONFIG_ROLES)
  @Get()
  get() {
    return this.assistantAccessService.getConfigScreen();
  }

  @Roles(...CONFIG_ROLES)
  @Patch()
  update(@Body() dto: UpdateAssistantConfigDto) {
    return this.assistantAccessService.updateConfig(dto);
  }
}
