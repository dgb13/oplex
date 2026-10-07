-- Costo real con o sin IVA según la condición del tenant (ver
-- libs/shared/database/src/lib/vat-cost.ts).

-- Cómo se escribieron los costos de la orden / pedido de cotización. Lo
-- existente se cargó sin IVA (era lo único que había).
ALTER TABLE "purchase_orders" ADD COLUMN "costsIncludeVat" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quote_requests" ADD COLUMN "costsIncludeVat" BOOLEAN NOT NULL DEFAULT false;

-- Costo real por unidad de compra guardado en cada línea de remito. Las
-- líneas existentes se recibieron al unitCost de la orden tal cual: se
-- completan con ese valor, así nada de lo ya registrado cambia.
ALTER TABLE "goods_receipt_lines" ADD COLUMN "unitCost" DECIMAL(14,4);
UPDATE "goods_receipt_lines" grl
SET "unitCost" = pol."unitCost"
FROM "purchase_order_lines" pol
WHERE pol."id" = grl."purchaseOrderLineId";
ALTER TABLE "goods_receipt_lines" ALTER COLUMN "unitCost" SET NOT NULL;
