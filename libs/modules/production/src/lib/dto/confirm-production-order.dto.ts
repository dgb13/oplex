import { IsUUID } from 'class-validator';

export class ConfirmProductionOrderDto {
  // No vive en ProductionOrder (ver schema) - una orden se define por
  // "qué"/"cuánto", el depósito se elige recién al reservar/producir,
  // igual que en el diseño original (StockReservation.warehouseId, no
  // ProductionOrder.warehouseId).
  @IsUUID()
  warehouseId!: string;
}
