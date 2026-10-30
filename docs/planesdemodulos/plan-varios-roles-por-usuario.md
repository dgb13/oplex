# Plan de implementación — Varios roles por usuario

Documento de trabajo. Origen: pedido del usuario 2026-10-30 (un vendedor no podía cargar artículos; hoy la única salida era hacerlo Administrador). Mismo formato que `plan-agenda.md`. No empezar a codear sin confirmar las decisiones de la sección 6.

---

## 1. Qué es y qué NO es

- **Es**: que una persona del equipo pueda tener más de un rol a la vez (ej. Ventas + Inventario) y que sus permisos sean la **suma** de los de sus roles.
- **No es**: un sistema de permisos a medida por pantalla o por acción. Los roles siguen siendo los mismos 7 y cada uno sigue significando lo mismo.

## 2. Cómo funciona hoy

- Un solo rol: `User.role` (y `TeamInvitation.role` en las invitaciones). Enum `UserRole`: OWNER, ADMIN, SALES, PURCHASES, INVENTORY, ACCOUNTANT, VIEWER.
- Al iniciar sesión el rol se copia al token (`buildAccessToken`, `auth.service.ts:164`) y al contexto del request (`TenantStore.role`, `getUserRole()`).
- **Un cambio de rol se aplica recién en el próximo inicio de sesión** (el token es una foto; está documentado en `auth.service.ts:109`).
- Todos los chequeos son "¿mi rol está en esta lista?": `RolesGuard` (`libs/shared/auth/src/lib/roles.guard.ts`) y ~30 chequeos sueltos.
- Hay otros dos sistemas de permisos que no cambian: `UserModuleAccess` (sólo lo usa el usuario espejo del contador) y los módulos por rubro/plan (por empresa, no por usuario).

### Inventario del impacto (exploración 2026-10-30)

| Área | Cantidad | ¿Cambia? |
|---|---|---|
| `@Roles(...)` en controladores | ~237 | **No**: sólo cambia el guard que los evalúa |
| Constantes de listas de roles (`WRITE_ROLES`, etc.) | ~50 | **No** |
| Chequeos de rol sueltos en el backend (companies, taxes, agenda, memberships, work-order-costs, assistant) | ~30 | Sí: pasan a un helper |
| `userIdsWithRoles` (notificaciones) | 1 helper, 6 llamadas | Sí: el helper (`hasSome`) |
| Asistente (acceso, temas, acciones) | ~25 | Sí: unión de roles |
| Web (menú, pantallas, equipo, perfil, admin) | ~60 | Sí: helper/hook único |
| Tests con `role:` | 34 specs | Sí |
| Manual (`docs/ayuda`, `apps/web/ayuda`) | ~6 páginas clave | Sí |

## 3. Diseño

### 3.1 Datos
- `User.role` → **`User.roles UserRole[]`** y `TeamInvitation.role` → `TeamInvitation.roles UserRole[]`.
- Migración **en dos tiempos** (no se borra ni se crea ningún usuario; sólo cambia la columna):
  1. Primer deploy: agregar `roles` y copiar `roles = ARRAY[role]` para todos los usuarios e invitaciones. La columna `role` **queda** como respaldo, sin usarse (el código sólo lee y escribe `roles`).
  2. Deploy siguiente, cuando el usuario confirme que en producción todos entran y ven lo suyo: borrar `role`.
  - Antes del primer deploy: confirmar que el último backup horario a R2 está OK y probar la migración sobre una copia de la base local.
- Cambiar el tipo hace que el compilador marque **todos** los lugares que leen `role`: es la red de seguridad para no olvidar ninguno.

### 3.2 Regla única
- Helper `hasAnyRole(roles, allowed)` en `libs/shared/auth` (backend) y su par en la web. Todo chequeo pasa por ahí.
- Permiso = **unión**: si alguno de tus roles lo permite, podés.
- Combinaciones (ver decisión 1): OWNER y ADMIN ya pueden todo → van **solos**. VIEWER (sólo lectura) no tiene sentido combinado → va **solo**. Se combinan entre sí: Ventas, Compras, Inventario, Contador.
- Validación en el servidor (hoy sólo la pantalla lo impide): **un Administrador no puede asignar ni invitar como Dueño**. Se mantiene la regla de que no se puede sacar al último Dueño activo.

### 3.3 Token y sesión
- El token lleva `roles`. Durante la transición el guard acepta tokens viejos con `role` (los tokens emitidos antes del deploy siguen funcionando hasta vencer).
- Aplicación del cambio de rol: ver decisión 2.

### 3.4 Casos puntuales
- **Asistente**: temas y acciones = unión de los roles. "Ventas sólo ve sus propios datos" (`salesOwnDataOnly`): ver decisión 3.
- **Contadores**: la cartera filtra por "tiene el rol Contador" (`roles.includes`), igual que hoy.
- **Notificaciones**: `userIdsWithRoles` pasa a `roles: { hasSome }`; una persona con dos roles recibe el aviso una sola vez.
- **Correos**: la invitación y el correo de soporte hoy muestran el rol crudo ("SALES"); pasan a la etiqueta en castellano ("Ventas, Inventario").

### 3.5 Pantallas
- **Configuración › Equipo**: cada persona muestra sus roles como etiquetas; editar abre una selección múltiple con una línea de qué habilita cada rol. Dueño/Administrador/Solo lectura se eligen solos (se deseleccionan los demás).
- **Invitar**: misma selección múltiple.
- Perfil, Admin › Tenants, historial del asistente, panel de colaboración: muestran los roles unidos con coma.
- **Mockup antes de tocar la pantalla de Equipo** (regla de trabajo).

## 4. Etapas (commits chicos, tests verdes en cada una)

| Etapa | Contenido |
|---|---|
| 1 | Datos + núcleo: migración, `hasAnyRole`, `RolesGuard`, token (con compatibilidad), `TenantStore`/`getUserRoles()`, `users.service` (cambiar roles, invitar, aceptar invitación, último dueño, bloqueo de asignar Dueño). |
| 2 | Resto del backend: chequeos sueltos, notificaciones, asistente, contadores, correos con etiquetas. Ajuste de los 34 specs. |
| 3 | Web: hook `useMyRoles` + helper, menú (`AppShell.canSee`) y los ~20 chequeos de pantallas. |
| 4 | Pantalla de Equipo e Invitar (después del mockup aprobado) + perfil/admin/asistente. |
| 5 | Manual (`docs/ayuda/equipo-usuarios-roles.md`, `apps/web/ayuda/introduccion/roles-y-permisos.md`, `invitar-a-tu-equipo.md`, etc.) + PDF regenerado. Prueba en pantalla con un usuario Ventas + Inventario. |

Las etapas 1 a 3 van juntas al mismo deploy (cambian el formato del token).

## 5. Fuera de alcance
- Permisos a medida por pantalla o acción.
- Roles nuevos.
- Pantalla para administrar `UserModuleAccess`.

## 6. Decisiones abiertas

1. **Combinaciones**: ¿Dueño, Administrador y Solo lectura van solos y el resto se combina libremente?
2. **Cuándo se aplica un cambio de rol**: (a) como hoy, al volver a iniciar sesión, con un aviso en la pantalla de Equipo; (b) en el momento: el servidor relee los roles del usuario en cada pedido (una consulta más por request, cacheable unos segundos).
3. **Asistente "Ventas sólo ve sus datos"**: si alguien es Ventas + otro rol, ¿sigue viendo sólo sus propias ventas? Propuesta: sí, salvo que sea Dueño/Administrador (que ya van solos).
