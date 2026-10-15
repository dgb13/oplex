---
title: Clientes
summary: Cómo dar de alta un cliente con su CUIT, dejar cargada su condición frente al IVA y sumarle contactos.
minutes: 4
roles: Dueño, Administrador, Ventas
---

Cada factura, cotización o venta de Caja va a nombre de un cliente. Si cargás bien su CUIT y su **condición frente al IVA**, Oplex elige sola la letra de la factura (A, B o C) y ARCA no te la rechaza. Con el CUIT, Oplex busca los datos en ARCA y completa casi todo por vos.

## Antes de empezar

- Tener cargada la condición frente al IVA de tu empresa en [Datos de la empresa](/documentacion/arca/datos-de-la-empresa). Sin ese dato Oplex no puede decirte qué factura le corresponde a cada cliente.
- El CUIT del cliente (si no tiene CUIT, se carga como Consumidor Final, ver más abajo).

> [!IMPORTANTE]
> Desde el 1/12/2026 ARCA exige informar la condición frente al IVA del cliente en cada factura (RG 5616). Si un cliente tiene CUIT pero no tiene la condición cargada, Oplex no va a poder emitirle la factura hasta que la completes.

## Pasos

1. **Abrí la lista de clientes.** Andá a **Ventas › Clientes** y tocá **+ Nuevo cliente**.
2. **Escribí el CUIT.** En el recuadro **CUIT del cliente** escribí los 11 números (por ejemplo `30-70987654-3`, de Talleres Rivera SA). Al completarlo vas a ver **⟳ Consultando ARCA...** y, si lo encuentra, **✓ Encontrado**.
3. **Revisá lo que trajo ARCA.** Se completan **Razón social**, **Condición frente al IVA** y **Domicilio fiscal**, con la marca **✓ de ARCA**. Al lado de la condición, el campo **Factura que le corresponde** te muestra la letra (por ejemplo, **Factura A** para un Responsable Inscripto). Si un dato está mal, tocá **✎ corregir** y escribilo bien.
4. **Completá los datos de contacto.** **Email (para enviarle facturas)** y **Teléfono** son opcionales, pero con el email Oplex le avisa al cliente cada vez que le emitís una factura.
5. **Completá lo opcional.** **Sitio web**, **Rubro**, **Ingresos Brutos (IIBB)**, **Logo (URL)** y **Límite de crédito** (el tope de saldo que le das en cuenta corriente; lo ves después en Cuentas a Cobrar).
6. **Marcá las retenciones, si corresponde.** En **Retenciones (agente ARCA/ARBA)** tildá **Retiene IVA**, **Retiene Ganancias** o **Retiene Ingresos Brutos** si el cliente es agente de retención.
7. **Tocá Crear cliente.** El cliente queda en la lista y ya lo podés elegir en una factura o cotización.

![Ficha de un cliente con su condición frente al IVA, domicilio fiscal, límite de crédito y contactos](/ayuda/capturas/ventas-cliente-alta.jpg)

> [!NOTA]
> No hace falta salir de una factura para crear un cliente: en **Nueva factura** y en **Nueva cotización** tenés el atajo **+ Nuevo cliente**, que abre este mismo formulario.

## Cliente sin CUIT (Consumidor Final)

Para alguien que no te da CUIT, como Martina Sosa, tocá **Cargar sólo con nombre** (debajo del CUIT, donde dice **¿Sin CUIT (consumidor final)?**). Escribí el nombre y tocá **Crear cliente**. Si sos Responsable Inscripto, a un cliente sin CUIT le corresponde siempre Factura B.

## Contactos del cliente

Tocá el cliente en la lista para abrir su ficha. Abajo, en **Contactos**, completá **Nombre**, **Apellido**, **Cargo**, **Email** y **WhatsApp** y tocá **+ Agregar contacto**. Los contactos aparecen después en el campo **Dirigida a** de las cotizaciones.

## Editar, actualizar o desactivar

- **Editar:** abrí la ficha y tocá **Editar empresa**. Cambiá lo que necesites y tocá **Guardar cambios**.
- **Actualizar desde ARCA:** en la edición, al lado del CUIT, el botón **Actualizar desde ARCA** vuelve a consultar el padrón. Usalo si el cliente cambió de condición (por ejemplo, pasó de Monotributo a Responsable Inscripto).
- **Desactivar:** en la ficha, **Desactivar empresa**. Un cliente no se borra para no romper el historial de facturas; desactivado deja de aparecer para operaciones nuevas. Para verlo, tildá **Mostrar inactivas** en la lista y usá **Activar empresa**.

> [!NOTA]
> Las facturas ya emitidas guardan los datos del cliente de ese momento. Si después le cambiás la condición, las facturas viejas no cambian.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **✕ ARCA no encontró ese CUIT. Revisalo o cargá los datos a mano.** | El CUIT está mal escrito o no existe. | Revisá los números. Si es correcto, cargá los datos con **✎ corregir**. |
| **✕ ARCA no responde ahora. Probá en unos minutos o cargá los datos a mano.** | El padrón de ARCA no está respondiendo. | Esperá un rato o cargá razón social, condición y domicilio a mano. |
| **Ya existe un/a cliente con este CUIT: …** | Ese cliente ya está cargado. | Buscalo en la lista con **Buscar por nombre o CUIT...**. |
| **Ya existe … con este CUIT, con el rol Proveedor. ¿Agregarle el rol Cliente en vez de crear una empresa nueva?** | Le comprás a esa empresa y ahora también le vendés. | Tocá **Agregar rol Cliente**: queda una sola empresa con los dos roles. |
| **Alcanzaste el límite de clientes de tu plan actual (…)** | Tu plan tiene un tope de clientes activos. | Desactivá clientes que ya no uses o cambiá de plan en [Planes y facturación](/documentacion/cuenta/planes-y-facturacion). |

Si ya tenés tus clientes en una planilla, podés traerlos todos juntos con **Importar clientes** (ver [Importar datos](/documentacion/primeros-pasos/importar-datos)).
