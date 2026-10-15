---
title: Impuestos, retenciones y vencimientos
summary: Cómo mantener las alícuotas de impuestos, los regímenes de retención a proveedores y la lista de vencimientos impositivos.
minutes: 7
roles: Dueño, Administrador, Contador externo
---

En la pantalla **Contabilidad › Impuestos** se configuran los impuestos que usan tus artículos y facturas, los regímenes de retención que aplicás al pagarle a un proveedor y los vencimientos que no te podés olvidar. Tiene cuatro pestañas: **Impuestos**, **Retenciones**, **Libro IVA** y **Vencimientos**. El Libro IVA tiene su propio artículo: [Libro IVA](/documentacion/contabilidad/libro-iva).

## Antes de empezar

- Tenés que ser **Dueño** o **Administrador**. El contador externo vinculado desde **Contadores** también puede entrar a esta pantalla.
- Para usar retenciones, primero tenés que marcar en **Preferencias** de qué impuestos sos agente de retención (ver más abajo).

## Impuestos: las alícuotas

La pestaña **Impuestos** muestra cada impuesto con su **Código**, **Nombre**, **Tipo**, **Valor**, **Vigencia** y si está **Delegado** al contador.

Cada impuesto guarda su historia. Cuando cambia una alícuota no se pisa el valor anterior: se cierra la vigencia vieja y se abre una nueva. Así, las facturas ya emitidas siguen mostrando el valor que tenían cuando se hicieron.

### Pasos para crear un impuesto

1. Tocá **+ Nuevo impuesto**.
2. Completá el **Código** (por ejemplo, `IVA_21`) y el **Nombre** (por ejemplo, "IVA 21%").
3. Elegí el **Tipo de cálculo**:
   - **Porcentual**: completá la **Tasa (%)**.
   - **Monto fijo**: completá el **Monto fijo**.
   - **Fórmula**: para casos especiales; consultalo con soporte antes de usarlo.
   - **Exento de IVA**: la venta no lleva IVA discriminado porque la norma la exime.
   - **No gravado**: la venta queda fuera del IVA (ni gravada ni exenta).
4. Si querés que tu contador pueda actualizar la tasa, marcá **Delegado al contador**.
5. Tocá **Crear impuesto**.

### Pasos para cambiar una alícuota

1. Buscá el impuesto que está **vigente** y tocá **Revisar**, a la derecha.
2. Completá la **Nueva tasa (%)** (o el **Nuevo monto fijo**).
3. Si el cambio rige desde una fecha puntual, completala en **Vigente desde**. Si la dejás vacía, rige desde ahora.
4. Tocá **Guardar revisión**.

En la tabla vas a ver las dos filas: la vieja con su fecha de cierre y la nueva como **vigente**.

## Retenciones a proveedores

Si ARCA o el organismo de tu provincia te nombró agente de retención, Oplex te deja retener al registrar el pago a un proveedor.

### Pasos para habilitarlas

1. Abrí el menú de tu usuario y entrá a **Preferencias**.
2. En **Retenciones a proveedores**, marcá lo que corresponda: **Somos agentes de retención de Ganancias**, **Somos agentes de retención de IVA** o **Somos agentes de retención de Ingresos Brutos (IIBB)**.
3. Andá a **Contabilidad › Impuestos**, pestaña **Retenciones**.
4. Tocá **+ Nuevo régimen**.
5. Completá el **Código** (por ejemplo, `GANANCIAS_RG830`) y el **Nombre** (por ejemplo, "Retención Ganancias RG 830").
6. Elegí el **Impuesto**: **Ganancias**, **IVA** o **IIBB**. Si es IIBB, elegí también la **Jurisdicción** (la provincia).
7. Completá la **Tasa (%)** y, si el régimen tiene, el **Mínimo no imponible**. Con 0 se retiene siempre.
8. Si querés, marcá **Delegado al contador**.
9. Tocá **Crear régimen**.

Para cambiar la tasa o el mínimo de un régimen vigente, tocá **Revisar**, completá los datos nuevos y tocá **Guardar revisión**. Los pagos ya registrados no cambian.

Después, al pagar una factura de compra, vas a poder agregar la retención con **+ agregar retención** (ver [Cuentas a pagar](/documentacion/compras/cuentas-a-pagar)).

> [!NOTA]
> Si en la pestaña **Retenciones** ves el aviso **Todavía no marcaste ningún carácter de agente de retención en Preferencias**, los regímenes que crees no se van a poder aplicar hasta que marques al menos una casilla en **Preferencias**.

## Vencimientos

La pestaña **Vencimientos** es tu lista de fechas impositivas. Los vencimientos se cargan a mano: Oplex no los trae de ningún calendario oficial.

### Pasos para agregar un vencimiento

1. Abrí la pestaña **Vencimientos**.
2. Elegí el **Tipo**: **IVA**, **Monotributo**, **IIBB**, **Ganancias** u **Otro**.
3. Elegí la fecha en **Vencimiento**.
4. Escribí una **Descripción**, por ejemplo "IVA mensual septiembre".
5. Tocá **+ Agregar vencimiento**.

El vencimiento aparece en la lista y también en la **Agenda**. Con los botones **Pendientes**, **Cumplidos** y **Todos** filtrás la lista. El **Estado** dice **Pendiente**, **Vencido** (en rojo, si ya pasó la fecha) o **Cumplido**.

Cuando lo pagues o presentes, tocá **Marcar cumplido**.

![Pestaña Vencimientos con el formulario completo y la lista de pendientes](/ayuda/capturas/contabilidad-vencimientos.jpg)

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Código y nombre son obligatorios** | Falta el código o el nombre del impuesto o del régimen. | Completá los dos. |
| **La tasa es obligatoria** | Creaste un régimen de retención sin tasa. | Completá la **Tasa (%)**. |
| **Fecha y descripción son obligatorias** | Falta la fecha o la descripción del vencimiento. | Completá los dos campos. |
| **No hay regímenes de retención activos habilitados (ver Preferencias e Impuestos → Retenciones).** (al pagar una compra) | No marcaste el carácter de agente en **Preferencias** o no creaste el régimen. | Seguí los pasos de "Retenciones a proveedores". |
| No aparece **Revisar** en una fila | Esa fila es una versión vieja: ya no está vigente. | Revisá la fila que dice **vigente**. |
