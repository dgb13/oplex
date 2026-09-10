import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { CurrentUser } from '@plexo/auth';
import type { AuthenticatedUser } from '@plexo/types';
import { RequestWhatsAppLinkDto } from './dto/request-whatsapp-link.dto.js';
import { WhatsAppLinkService } from './whatsapp-link.service.js';

// Sin @Public(): requiere sesión, igual que /profile - la vinculación
// arranca con el usuario YA logueado con su contraseña real (sección 3.3
// del plan), WhatsApp por sí solo nunca alcanza para probar identidad.
@Controller('whatsapp-link')
export class WhatsAppLinkController {
  constructor(private readonly whatsAppLinkService: WhatsAppLinkService) {}

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.whatsAppLinkService.getStatus(user);
  }

  @Post('request')
  requestLink(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestWhatsAppLinkDto) {
    return this.whatsAppLinkService.requestLink(user, dto.phone);
  }

  @Delete()
  async unlink(@CurrentUser() user: AuthenticatedUser) {
    await this.whatsAppLinkService.unlink(user);
    return { ok: true };
  }
}
