-- Venta guardada junto con el cobro QR de la Caja, para retomarla si el pago
-- se acredita y la venta no llega a confirmarse (ver PosService.confirmQrSale).

-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN     "saleDraft" JSONB;
