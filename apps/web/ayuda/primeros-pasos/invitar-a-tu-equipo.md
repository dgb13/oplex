---
title: Invitar a tu equipo
summary: Cómo sumar usuarios por email o con clave temporal, cambiarles los roles, suspenderlos y ver su actividad.
minutes: 5
roles: Dueño, Administrador
---

Cada persona que trabaja en Oplex tiene que tener su propio usuario: así ve sólo lo que su rol le permite y queda registrado quién hizo cada cosa. Desde **Equipo** sumás gente, le cambiás los roles, la suspendés o revisás su actividad.

## Antes de empezar

- Ser **Dueño** o **Administrador**.
- El email de la persona que vas a sumar.
- Saber qué roles le corresponden (puede tener más de uno). Ver [Roles y permisos](/documentacion/introduccion/roles-y-permisos).
- Tener lugar en tu plan: cada plan permite una cantidad de usuarios. Los contadores externos no cuentan.

## Invitar por email

Es la forma recomendada: la persona elige su propia contraseña.

1. **Abrí Equipo.** Tocá tu foto arriba a la derecha y elegí **Equipo**.
2. **Tocá + Invitar / Agregar colaborador** ①.
3. **Elegí Invitar por mail** ②. Es la opción que aparece marcada.
4. **Completá los datos.** Escribí el **Email** (por ejemplo, el de Diego Ferreyra) y marcá uno o más **Roles** (Ventas viene marcado). Si Diego también va a cargar artículos, marcá además **Inventario**.
5. **Tocá Enviar invitación.** A Diego le llega un email con un link.

![Ventana Invitar / Agregar colaborador](/ayuda/capturas/primeros-pasos-invitar.png)

Cuando la persona abre el link, ve la pantalla **Sumate al equipo**. Ahí escribe **Tu nombre**, una **Contraseña** (mínimo 8 caracteres), la repite en **Confirmar contraseña** y toca **Crear mi cuenta**. Aparece *Listo, ya sos parte del equipo* y, con **Ir a ingresar**, entra con su email y contraseña.

> [!IMPORTANTE]
> El link de invitación vence a los 3 días. Si la persona no llegó a usarlo, mandale una invitación nueva.

## Alta con clave temporal

Sirve cuando la persona no tiene a mano su email, o querés dejarla lista en el momento.

1. En la misma ventana, elegí **Alta con clave temporal**.
2. Completá el **Email**, el **Nombre (opcional)** y marcá los **Roles**.
3. Tocá **Crear usuario**. Oplex muestra la ventana **Usuario creado** con una contraseña temporal.
4. Tocá **Copiar** y pasásela a la persona por un canal seguro (en persona o por mensaje privado). Después tocá **Listo**.

La primera vez que esa persona ingresa, Oplex la lleva a su **Perfil** para que cambie la contraseña.

> [!NOTA]
> La contraseña temporal se muestra una sola vez. Si la perdiste, usá **Resetear contraseña** (ver más abajo).

## Administrar a tu equipo

En la tabla de **Equipo** ves a cada persona con sus **Roles**, su **Estado** y desde cuándo está (**Desde**).

- **Cambiar los roles:** tocá **Editar** al lado de los roles de la persona, marcá o desmarcá los que correspondan y tocá **Guardar**. Abajo de la lista dice cómo va a quedar (por ejemplo, *Ventas + Inventario*). Si marcás **Administrador** o **Solo lectura**, se desmarcan los demás, porque van solos. El cambio se aplica en el momento: la persona no necesita volver a iniciar sesión.
- **Suspender o reactivar:** usá el interruptor de **Estado**. Una persona **Suspendido** no puede ingresar, pero todo lo que cargó queda. Para devolverle el acceso, volvé a activarlo.
- **Ver actividad:** en el botón **⋯** de la fila, tocá **Ver actividad**. Se abre el panel **Actividad** con lo que hizo esa persona, con fecha y hora.
- **Resetear contraseña:** en el mismo **⋯**, tocá **Resetear contraseña**. A la persona le llega un link para elegir una contraseña nueva. Aparece *Se envió el link para elegir una contraseña nueva*.

> [!NOTA]
> El rol **Dueño/a** no se puede cambiar desde esta pantalla, y nadie puede suspender su propia cuenta. Los contadores de un estudio externo aparecen como **Contador externo**: su acceso se maneja desde **Contadores**, no desde acá.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| *Alcanzaste el límite de usuarios de tu plan actual (…)* | Ya usaste todos los usuarios que incluye tu plan (los suspendidos también cuentan) | Pasá a un plan con más usuarios. Ver [Planes y facturación](/documentacion/cuenta/planes-y-facturacion) |
| *El email es obligatorio* | Dejaste vacío el email | Completalo y volvé a intentar |
| *Ese email ya pertenece a este equipo* | Esa persona ya tiene usuario en tu empresa | Buscala en la tabla; si está suspendida, reactivala |
| *No podés suspender tu propia cuenta* | Intentaste suspenderte a vos | Pedíselo a otro Administrador o al Dueño |
| *Este usuario está gestionado desde Contadores - andá a /accountants para revocar el acceso* | Es un contador externo | Manejá su acceso desde **Contadores** |
| La persona ve *Link inválido* o *La invitación es inválida o expiró* | El link venció o ya se usó | Mandale una invitación nueva |
| *No se pudieron cambiar los roles* | Se cortó la conexión o falta un permiso | Recargá la pantalla y probá de nuevo |
| *Elegí al menos un rol* | Desmarcaste todos los roles | Marcá al menos uno |
| *Dueño/a, Admin y Solo lectura no se combinan con otros roles* | Se intentó guardar Administrador o Solo lectura junto con otro rol | Dejá sólo ese rol, o sacalo y combiná los otros |
