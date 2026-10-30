-- Varios roles por usuario (docs/planesdemodulos/plan-varios-roles-por-usuario.md).
-- Primer tiempo: se agrega "roles" y se copia el rol de cada usuario e
-- invitación. La columna "role" queda como respaldo (nullable, el código ya
-- no la usa) y se borra en el deploy siguiente. No se crea ni se borra
-- ninguna fila.

ALTER TABLE "users" ADD COLUMN "roles" "UserRole"[] NOT NULL DEFAULT ARRAY['VIEWER']::"UserRole"[];
UPDATE "users" SET "roles" = ARRAY["role"];
ALTER TABLE "users" ALTER COLUMN "role" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "team_invitations" ADD COLUMN "roles" "UserRole"[] NOT NULL DEFAULT ARRAY[]::"UserRole"[];
UPDATE "team_invitations" SET "roles" = ARRAY["role"];
ALTER TABLE "team_invitations" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "team_invitations" ALTER COLUMN "role" DROP NOT NULL;

-- Si la copia no alcanzó a todas las filas (ej. RLS filtrando el UPDATE),
-- se corta acá y la migración entera se revierte.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "role" IS NOT NULL AND "roles" <> ARRAY["role"]) THEN
    RAISE EXCEPTION 'user_roles_array: hay usuarios cuyo rol no se copió a roles';
  END IF;
  IF EXISTS (SELECT 1 FROM "team_invitations" WHERE "role" IS NOT NULL AND "roles" <> ARRAY["role"]) THEN
    RAISE EXCEPTION 'user_roles_array: hay invitaciones cuyo rol no se copió a roles';
  END IF;
END $$;
