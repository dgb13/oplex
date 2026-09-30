import { Module } from '@nestjs/common';
import { CollaborationSchedulerService } from './collaboration-scheduler.service.js';
import { CollaborationController } from './collaboration.controller.js';
import { CollaborationService } from './collaboration.service.js';
import { StockAlertsListener } from './stock-alerts.listener.js';

/**
 * Trabajo en equipo: la campana de avisos, comentarios con @menciones,
 * la lista de compañeros para mencionar/asignar, el aviso de stock bajo
 * mínimo y el barrido diario de tareas por vencer. Los avisos de cada
 * módulo (Producción, Compras, Agenda) se crean con notify() de
 * @plexo/database en el propio módulo; el envío en vivo lo hace
 * DashboardGateway escuchando notificationBus.
 */
@Module({
  controllers: [CollaborationController],
  providers: [CollaborationService, StockAlertsListener, CollaborationSchedulerService],
})
export class CollaborationModule {}
