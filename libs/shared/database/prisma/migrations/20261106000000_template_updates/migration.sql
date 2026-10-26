-- Etapa 6 del plan de rubros: "Hay novedades para tu rubro".
-- Versión de la plantilla que el negocio decidió no aplicar ("Ahora no").
ALTER TABLE "tenant_settings" ADD COLUMN "dismissedTemplateVersion" INTEGER;
