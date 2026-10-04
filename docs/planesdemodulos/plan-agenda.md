# Plan de implementación — Módulo Agenda

Documento de trabajo para implementar el módulo **Agenda** en Oplex. Mismo formato que `plan-carga-comprobantes-ia.md` y `PLAN_TIENDANUBE.md`. Léelo completo antes de escribir código. No empieces a codear hasta confirmar el alcance de la Fase 1 con el usuario.

---

## 1. Qué es y qué NO es

La Agenda es una **vista consolidada** de las fechas que ya viven en los módulos del ERP, más una tabla propia y acotada para eventos manuales. **No es un módulo de datos nuevo que reemplace nada.**

- **Es**: una proyección de vencimientos, cobros, pagos, órdenes de producción, cierres de caja y vencimientos impositivos que ya existen como datos, mostrados en una vista mes/semana/día con un panel de detalle del día.
- **No es**: un motor de agenda genérico tipo Google Calendar, ni una fuente de verdad paralela. Los eventos derivados son *read-only* desde la Agenda; para editarlos, el usuario navega al documento origen.

### Principio de seguridad (no negociable)
Cada evento se deriva de una tabla que **ya tiene `tenantId` y RLS**. La Agenda hereda el aislamiento sin abrir superficie nueva. Un contador externo con lectura solo en Impuestos/Contabilidad debe ver únicamente los eventos de esos módulos — **esto se logra solo por RLS + los permisos existentes, sin lógica de permisos nueva en la Agenda.** No agregar consultas que hagan `getTenantDb()` bypass ni SQL libre.

### Principio de arquitectura (respetar el patrón del monorepo)
Los módulos de negocio **nunca** se importan Service-a-Service. La Agenda se compone a nivel `apps/api`:
- Cada módulo que aporte eventos expone una función pura `getCalendarEntries(from, to)` en su lib (`libs/modules/<modulo>`), que consulta su propia tabla bajo RLS y devuelve eventos en el formato común `CalendarEntry`.
- El composition root de la Agenda en `apps/api` llama a cada una y hace merge en memoria. Nada de un `CalendarService` que llame a otros services.

---

## 2. Modelo de datos

### 2.1 Eventos derivados (calculados, no se almacenan)
No hay tabla. Se proyectan por rango de fechas desde:

| Origen (módulo)        | Fecha que se proyecta                       | Tipo evento | Flujo |
|------------------------|---------------------------------------------|-------------|-------|
| Ventas / Facturación   | vencimiento de factura, factura recurrente  | `sale`      | in    |
| Cuentas a Cobrar       | vto. de cobro, recordatorio recurrente      | `collect`   | in    |
| Cuentas a Pagar / Compras | vto. de pago, OC con fecha                | `pay`       | out   |
| Impuestos              | vto. impositivo (régimen versionado)        | `tax`       | out   |
| Producción             | inicio / entrega estimada / entrega final de OP | `prod`  | —     |
| Caja / POS             | cierre de turno programado                  | `cash`      | —     |

### 2.2 Eventos propios (tabla nueva, editable)
Única tabla nueva. Seguir el patrón de FK compuesta `(tenantId, id)` como el resto de relaciones sensibles.

```prisma
model CalendarEvent {
  tenantId    String
  id          String   @default(cuid())
  title       String
  startsAt    DateTime
  endsAt      DateTime?
  allDay      Boolean  @default(false)
  kind        CalendarEventKind   @default(CUSTOM)  // MEETING, TASK, REMINDER, CUSTOM
  status      CalendarEventStatus @default(PENDING) // PENDING, DONE, CANCELLED
  linkType    String?  // 'invoice' | 'purchaseOrder' | 'customer' | null (vínculo opcional)
  linkId      String?
  assignedTo  String?  // userId — habilita agenda por usuario/contador
  rrule       String?  // recurrencia RFC 5545, opcional (ver Fase 3)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@id([tenantId, id])
  @@index([tenantId, startsAt])
}
```

Recordá: cualquier relación fiscal/financiera nueva a la lista de FK compuesta debe revisar el tipo generado de Prisma a mano (ver nota de deuda técnica en `RESUMEN_9_9_2026.md`). `CalendarEvent` no es fiscal, pero mantené el `@@id` compuesto por consistencia con el patrón de tenancy.

### 2.3 Formato común `CalendarEntry` (DTO de salida)
```ts
type CalendarEntry = {
  id: string;
  source: 'sale'|'collect'|'pay'|'tax'|'prod'|'cash'|'custom';
  title: string;
  date: string;        // ISO
  amount: number|null;
  flow: 'in'|'out'|null;
  ref: string|null;    // "FC-A 0001-00234", "OC-0088", etc.
  editable: boolean;   // true solo para custom
  link?: { module: string; id: string }; // para navegar al origen
};
```

---

## 3. API

- `GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&kinds=sale,collect,...&assignedTo=<userId?>`
  - Composición en `apps/api`: llama a cada `getCalendarEntries(from,to)` bajo la transacción con `tenantId` seteado, mergea, ordena por fecha, filtra por `kinds`. Devuelve `CalendarEntry[]`.
- CRUD de eventos propios: `POST/PATCH/DELETE /calendar/events` — solo tocan `CalendarEvent`.
- Test RLS dedicado: agregar caso a `nx run database:test-rls` que verifique que un usuario de tenant A nunca ve `CalendarEvent` de tenant B, y que un rol con permiso solo-Impuestos no recibe entries de tipo `sale`/`collect` en la respuesta compuesta.

---

## 4. Front-end (Next.js 16 / React 19, Tailwind v4)

Replicar el prototipo aprobado (adjunto `agenda-oplex.html`). Vista mes + panel lateral del día con mini-balance "a cobrar / a pagar". Chips de filtro por tipo (toggleables). Color por origen del dato, no decorativo.

### 4.1 Ruta y layout
- Nueva entrada en el sidebar "Agenda" (ícono calendario), entre "Resumen" e "Inventario".
- Página en App Router. Vista mes primero; semana/día en Fase 2.

### 4.2 Tokens de color — **soportar light Y dark**
El proyecto ya usa tema claro/oscuro por clase manual (`.dark` / `.light` en el root, no solo `prefers-color-scheme`). Definir los tokens como variables CSS y redefinirlos bajo la clase de tema. **No hardcodear colores en los componentes; usar siempre las variables.**

```css
/* DARK (base del prototipo) */
:root, .dark {
  --agenda-bg:          #0a0a0f;
  --agenda-sidebar:     #0d0d14;
  --agenda-card:        #131320;
  --agenda-card-hover:  #181828;
  --agenda-border:      #23232f;
  --agenda-border-soft: #1b1b28;
  --agenda-text:        #e8e8f0;
  --agenda-text-dim:    #8a8a9a;
  --agenda-text-faint:  #5a5a68;
  --agenda-violet:      #6d5cf5;
  --agenda-violet-soft: #6d5cf526;
  --agenda-violet-dim:  #8b7cf7;
  /* eventos */
  --ev-sale:    #6d5cf5;  --ev-sale-bg:    rgba(109,92,245,.16);
  --ev-collect: #f5a623;  --ev-collect-bg: rgba(245,166,35,.14);
  --ev-pay:     #ef5a6f;  --ev-pay-bg:     rgba(239,90,111,.14);
  --ev-tax:     #e0457b;  --ev-tax-bg:     rgba(224,69,123,.14);
  --ev-prod:    #22c58b;  --ev-prod-bg:    rgba(34,197,139,.14);
  --ev-cash:    #3bb0e0;  --ev-cash-bg:    rgba(59,176,224,.14);
  --ev-custom:  #8a8a9a;  --ev-custom-bg:  rgba(138,138,154,.14);
}

/* LIGHT — fondos claros, texto oscuro, mismos acentos (bajados un punto para contraste sobre blanco) */
.light {
  --agenda-bg:          #f7f7fb;
  --agenda-sidebar:     #ffffff;
  --agenda-card:        #ffffff;
  --agenda-card-hover:  #f2f2f8;
  --agenda-border:      #e3e3ec;
  --agenda-border-soft: #ededf3;
  --agenda-text:        #1a1a24;
  --agenda-text-dim:    #6a6a7a;
  --agenda-text-faint:  #9a9aab;
  --agenda-violet:      #5b49e0;   /* un poco más oscuro que el dark para contraste AA sobre blanco */
  --agenda-violet-soft: #5b49e015;
  --agenda-violet-dim:  #5b49e0;
  /* eventos — mismos hues, versión legible sobre claro; bg más tenue */
  --ev-sale:    #5b49e0;  --ev-sale-bg:    rgba(109,92,245,.10);
  --ev-collect: #c77f0a;  --ev-collect-bg: rgba(245,166,35,.12);
  --ev-pay:     #d63d54;  --ev-pay-bg:     rgba(239,90,111,.10);
  --ev-tax:     #c22c66;  --ev-tax-bg:     rgba(224,69,123,.10);
  --ev-prod:    #12a06f;  --ev-prod-bg:    rgba(34,197,139,.12);
  --ev-cash:    #2088b8;  --ev-cash-bg:    rgba(59,176,224,.12);
  --ev-custom:  #6a6a7a;  --ev-custom-bg:  rgba(138,138,154,.12);
}
```

Regla de accesibilidad: el texto de cada evento debe cumplir contraste AA en ambos temas. En dark el texto de la píldora es `--agenda-text`; en light usar `--agenda-text` oscuro sobre el `-bg` tenue. Verificar con el borde izquierdo de color (`border-left`) que da la señal cromática sin depender solo del fondo.

### 4.3 Componentes
- `AgendaPage` — toolbar (mes anterior/siguiente, "Hoy", switch mes/semana/día), filtros, grilla + panel.
- `MonthGrid` — semana empieza lunes; celda de "hoy" con daynum en píldora violeta; máx 3 eventos por celda + "+N más".
- `DayPanel` — lista del día con tag de tipo, referencia, monto con signo (+/−) y color in/out; KPIs "a cobrar / a pagar".
- `FilterChips` — un chip por tipo, toggle, con el punto de color.
- `EventDialog` — crear/editar evento propio (solo `custom`). Los derivados abren su documento origen, no este diálogo.

---

## 5. Fases

**Fase 1 — MVP (confirmar alcance antes de codear)**
- Tabla `CalendarEvent` + migración + política RLS + caso en `database:test-rls`.
- `getCalendarEntries` para 3 orígenes de mayor valor: Impuestos, Cuentas a Cobrar, Cuentas a Pagar.
- Endpoint `GET /calendar` compuesto + CRUD de eventos propios.
- Front: vista mes + panel del día + filtros, con light y dark. Entrada en el sidebar.

**Fase 2 — Cobertura completa y vistas**
- Sumar orígenes: Ventas (recurrentes), Producción, Caja.
- Vistas semana y día.
- Navegación evento derivado → documento origen (deep-link por `link`).
- Franja "vencimientos de esta semana" arriba del calendario (gancho para panel de estudio contable: agenda de la cartera por contador vía `assignedTo`).

**Fase 3 — Recurrencia y notificaciones (evaluar)**
- Materialización de `rrule` para eventos propios recurrentes.
- Notificaciones/recordatorios reusando el cron ya existente (backups diarios, recordatorios recurrentes de CxC). Encaja con la prioridad "PWA con push" del roadmap.

---

## 6. Criterios de aceptación Fase 1
- [ ] Un tenant nunca ve `CalendarEvent` de otro (test RLS verde).
- [ ] Un usuario con permiso solo-Impuestos recibe solo entries `tax` en `GET /calendar`.
- [ ] El módulo Agenda no importa ningún Service de otro módulo (composición en `apps/api`).
- [ ] La vista se ve correcta en light y en dark, alternando la clase de tema, sin colores hardcodeados.
- [ ] `nx run <lib>:typecheck` y el build pasan (no dejar `.spec` rotos nuevos).
- [ ] Contraste AA del texto de eventos en ambos temas.

---

## 7. Notas
- No generar SQL libre por IA ni contra la base real; misma regla que rige todo el proyecto.
- Fecha de referencia del prototipo: septiembre 2026. La implementación usa la fecha real del sistema.
- El prototipo `agenda-oplex.html` es la referencia visual canónica; ante duda de estilo, ganan sus valores.
