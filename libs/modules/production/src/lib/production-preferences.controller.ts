import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateProductionPreferencesDto } from './dto/update-production-preferences.dto.js';
import { ProductionPreferencesService } from './production-preferences.service.js';

@Controller('production/preferences')
export class ProductionPreferencesController {
  constructor(private readonly preferencesService: ProductionPreferencesService) {}

  @Get()
  getPreferences() {
    return this.preferencesService.getPreferences();
  }

  @Patch()
  updatePreferences(@Body() dto: UpdateProductionPreferencesDto) {
    return this.preferencesService.updatePreferences(dto);
  }
}
