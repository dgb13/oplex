import { Controller, Get, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { LongRunningTransaction } from '@plexo/database';
import { ArcaConnectionService } from './arca-connection.service.js';
import { AllowWhenReadOnly } from '@plexo/subscriptions';

@Controller('invoicing/arca')
export class ArcaConnectionController {
  constructor(private readonly arcaConnection: ArcaConnectionService) {}

  // Mismos roles que pueden cargar el certificado (Preferencias).
  @Roles('OWNER', 'ADMIN')
  @AllowWhenReadOnly() // sólo prueba la conexión
  @Post('check')
  // WSAA + WSFE pueden tardar más que el timeout por defecto (5 s).
  @LongRunningTransaction(45_000)
  check() {
    return this.arcaConnection.check();
  }

  // Paso 5 (Punto de venta): sólo consulta, no cambia nada.
  @Roles('OWNER', 'ADMIN')
  @AllowWhenReadOnly()
  @Get('points-of-sale')
  @LongRunningTransaction(45_000)
  pointsOfSale() {
    return this.arcaConnection.pointsOfSale();
  }
}
