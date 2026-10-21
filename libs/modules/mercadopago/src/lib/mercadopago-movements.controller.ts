import { Controller, Get, Post, Query, StreamableFile } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { LongRunningTransaction } from '@plexo/database';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto.js';
import {
  MercadoPagoMovementsService,
  type MovementsPage,
  type MovementsQuery,
  type MovementsSummary,
} from './mercadopago-movements.service.js';
import { MercadoPagoPaymentsSyncService, type MercadoPagoSyncResult } from './mercadopago-payments-sync.service.js';

// Sección Mercado Pago: Dueño/Admin todo; el Contador ve Movimientos (y los
// actualiza - traer datos no cambia nada en la contabilidad). Decisión del
// usuario 2026-10-20, ver plan-seccion-mercadopago.md.
const READ_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT'] as const;

function toQuery(dto: ListMovementsQueryDto): MovementsQuery {
  return { from: dto.from, to: dto.to, origin: dto.origin, page: dto.page ? Number(dto.page) : undefined };
}

@Controller('connectors/mercadopago/movements')
export class MercadoPagoMovementsController {
  constructor(
    private readonly movements: MercadoPagoMovementsService,
    private readonly sync: MercadoPagoPaymentsSyncService,
  ) {}

  @Roles(...READ_ROLES)
  @Get()
  list(@Query() dto: ListMovementsQueryDto): Promise<MovementsPage> {
    return this.movements.list(toQuery(dto));
  }

  @Roles(...READ_ROLES)
  @Get('summary')
  summary(@Query() dto: ListMovementsQueryDto): Promise<MovementsSummary> {
    return this.movements.summary({ from: dto.from, to: dto.to });
  }

  // Pagina contra la API de MP dentro de la transacción del request (hasta
  // MAX_PAGES_PER_SYNC páginas): el default de 5 s no alcanza.
  @LongRunningTransaction(120_000)
  @Roles(...READ_ROLES)
  @Post('sync')
  syncNow(): Promise<MercadoPagoSyncResult> {
    return this.sync.sync();
  }

  @LongRunningTransaction(60_000)
  @Roles(...READ_ROLES)
  @Get('export')
  async export(@Query() dto: ListMovementsQueryDto): Promise<StreamableFile> {
    const buffer = await this.movements.exportExcel(toQuery(dto));
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="movimientos-mercado-pago.xlsx"',
    });
  }
}
