-- Estado al que pasa sola la orden cuando el cliente acepta o rechaza el
-- presupuesto vinculado ('ACCEPTED' | 'REJECTED'; null = ninguno). Lo marca
-- el negocio en Configuración de las órdenes; uno por resultado.
ALTER TABLE "work_order_statuses" ADD COLUMN "quoteOutcome" TEXT;

-- Rubros con Presupuestos: el estado "de trabajo" queda marcado para
-- "aceptado" y se agrega "Presupuesto rechazado". En los rubros donde el
-- negocio se queda con el vehículo o el equipo (los que tienen "Esperando
-- aprobación") el rechazado no cierra la orden: se cierra al entregarlo.
-- En el resto (obras, proyectos, reservas, viajes) no hay nada que
-- devolver y la cierra. Versión nueva de la plantilla: los negocios que
-- ya eligieron el rubro lo reciben como novedad.
-- Se saltea la plantilla si en /admin ya se marcó algo o ya tiene un
-- "Presupuesto rechazado".
CREATE TEMP TABLE "_quote_outcome_templates" ("id" TEXT PRIMARY KEY);

DO $$
DECLARE
  t record;
  statuses jsonb;
  accepted_name text;
  custody boolean;
  rejected jsonb;
  result jsonb;
  el jsonb;
BEGIN
  FOR t IN
    SELECT "id", "config" FROM "business_templates"
    WHERE "config" ? 'workOrder' AND "config"->'modules' ? 'presupuestos'
  LOOP
    statuses := t."config"->'workOrder'->'statuses';
    CONTINUE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(statuses) e WHERE e ? 'quoteOutcome');
    CONTINUE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(statuses) e WHERE lower(e->>'name') = 'presupuesto rechazado');

    SELECT e->>'name' INTO accepted_name
    FROM jsonb_array_elements(statuses) WITH ORDINALITY AS a(e, o)
    WHERE e->>'name' IN ('En reparación', 'En producción', 'En laboratorio', 'Aprobado', 'Reservado', 'Programado')
      AND NOT COALESCE((e->>'final')::boolean, false)
    ORDER BY o
    LIMIT 1;

    custody := EXISTS (SELECT 1 FROM jsonb_array_elements(statuses) e WHERE e->>'name' = 'Esperando aprobación');
    rejected := CASE WHEN custody
      THEN '{"name":"Presupuesto rechazado","quoteOutcome":"REJECTED"}'::jsonb
      ELSE '{"name":"Presupuesto rechazado","final":true,"quoteOutcome":"REJECTED"}'::jsonb
    END;

    result := '[]'::jsonb;
    FOR el IN SELECT e FROM jsonb_array_elements(statuses) WITH ORDINALITY AS a(e, o) ORDER BY o LOOP
      IF el->>'name' = accepted_name THEN
        el := el || '{"quoteOutcome":"ACCEPTED"}'::jsonb;
      END IF;
      result := result || jsonb_build_array(el);
      -- Con el vehículo en el taller va después de "Esperando aprobación".
      IF custody AND el->>'name' = 'Esperando aprobación' THEN
        result := result || jsonb_build_array(rejected);
      END IF;
    END LOOP;
    IF NOT custody THEN
      result := result || jsonb_build_array(rejected);
    END IF;

    UPDATE "business_templates"
    SET "config" = jsonb_set("config", '{workOrder,statuses}', result),
        "version" = "version" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = t."id";
    INSERT INTO "_quote_outcome_templates" ("id") VALUES (t."id");
  END LOOP;
END $$;

INSERT INTO "business_template_versions" ("id", "templateId", "version", "config", "publishedBy")
SELECT gen_random_uuid()::text, t."id", t."version", t."config", 'migración: estado según el presupuesto'
FROM "business_templates" t
JOIN "_quote_outcome_templates" q ON q."id" = t."id"
WHERE NOT EXISTS (
  SELECT 1 FROM "business_template_versions" v WHERE v."templateId" = t."id" AND v."version" = t."version"
);

DROP TABLE "_quote_outcome_templates";
