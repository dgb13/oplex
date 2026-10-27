---
title: Letra del comprobante (A, B o C)
summary: Por qué Oplex elige la letra de la factura sola, en qué casos la podés cambiar y qué hacer si no es la que esperabas.
minutes: 3
roles: Dueño, Administrador, Ventas
---

La letra de la factura no es una elección libre: la definen tu condición frente al IVA y la del cliente. Oplex la calcula sola en **Nueva factura**, en **Convertir a factura** y en la **Caja**, y la bloquea cuando no hay otra opción válida. Así evitás el error más común: discriminarle IVA a alguien que no lo puede tomar.

## Qué letra corresponde

| Tu empresa | Cliente | Letra | ¿Se puede cambiar? |
|---|---|---|---|
| Monotributo o Exento | Cualquiera | **C** | No |
| Responsable Inscripto | Responsable Inscripto | **A** | No |
| Responsable Inscripto | Sin CUIT (Consumidor Final) | **B** | No |
| Responsable Inscripto | Monotributo o Exento | **B** | No |
| Responsable Inscripto | Con CUIT pero sin condición cargada | **B** sugerida | Sí, con aviso |

Debajo del selector **Comprobante** siempre ves el motivo, por ejemplo **Cliente Responsable Inscripto: corresponde Factura A.** Cuando la letra está bloqueada, el texto es gris; cuando es sólo una sugerencia, es ámbar.

![Selector de comprobante con la letra bloqueada y el motivo debajo](/ayuda/capturas/ventas-letra-comprobante.png)

## Cómo se ven los importes según la letra

- **Factura A:** precios sin IVA. Abajo, el neto gravado y el IVA de cada alícuota por separado.
- **Factura B:** precios finales con IVA incluido. Abajo, el recuadro **Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)** con el IVA contenido.
- **Factura C:** precios finales, sin IVA. En la pantalla de carga ves **Sin IVA (Factura C): el precio es el final**.

## La letra M

La **M** aparece en el selector, pero Oplex nunca la sugiere: es un régimen especial que ARCA le asigna a algunos Responsables Inscriptos. Usala sólo si ARCA te indicó emitir comprobantes M.

## Si la letra no es la que esperabas

1. **Revisá tu condición.** Está en [Datos de la empresa](/documentacion/arca/datos-de-la-empresa). Si sos Monotributo, siempre vas a ver Factura C.
2. **Revisá la del cliente.** Abrí el cliente en **Ventas › Clientes**. Si en **Condición IVA (ARCA)** no figura nada o está desactualizada, tocá **Editar empresa** y **Actualizar desde ARCA**. El campo **Factura que le corresponde** te muestra la letra que va a salir.
3. **Volvé a elegir el cliente en la factura.** La letra se recalcula cada vez que cambiás de cliente.

> [!NOTA]
> Cada factura guarda la letra y las condiciones frente al IVA del momento en que se emitió. Si después cambia tu condición o la del cliente, las facturas ya emitidas no cambian.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Cargá la condición frente al IVA de tu empresa en Conexión con ARCA → Datos de la empresa: sin ella no se puede saber qué factura corresponde (A, B o C).** | Falta tu condición. | Cargala en [Datos de la empresa](/documentacion/arca/datos-de-la-empresa). |
| **No se conoce la condición IVA de este cliente (en su ficha, Editar empresa → "Actualizar desde ARCA") - se sugiere Factura B por defecto.** | El cliente tiene CUIT pero no condición. | Completala en su ficha con **Actualizar desde ARCA**. Desde el 1/12/2026 ARCA no acepta la factura sin ese dato. |
| **Tu empresa es Monotributo: sólo puede emitir Factura C, no …** | Se intentó emitir una A o B siendo Monotributo. | Emití Factura C. |
| **Tu empresa es Responsable Inscripto: no puede emitir Factura C (corresponde A o B)** | Se intentó emitir una C siendo Responsable Inscripto. | Emití A o B según el cliente. |
