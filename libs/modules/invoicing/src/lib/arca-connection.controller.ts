import { Controller, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { LongRunningTransaction } from '@plexo/database';
import { ArcaConnectionService } from './arca-connection.service.js';

@Controller('invoicing/arca')
export class ArcaConnectionController {
  constructor(private readonly arcaConnection: ArcaConnectionService) {}

  // Mismos roles que pueden cargar el certificado (Preferencias).
  @Roles('OWNER', 'ADMIN')
  @Post('check')
  // WSAA + WSFE pueden tardar más que el timeout por defecto (5 s).
  @LongRunningTransaction(45_000)
  check() {
    return this.arcaConnection.check();
  }
}
