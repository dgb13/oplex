---
title: Punto de venta
summary: Dar de alta en ARCA un punto de venta de Web Services y cargarlo en tu sucursal de Oplex, según seas Responsable Inscripto, Monotributo o Exento.
minutes: 7
roles: Dueño, Administrador
---

El **punto de venta** es el número que va adelante de cada factura (en `00003-00000125`, es el `00003`). ARCA lo usa para saber desde qué sistema facturás. Para facturar con Oplex necesitás uno de tipo **Web Services**, y tiene que estar cargado en una **sucursal** de Oplex: cada sucursal factura con su propio punto de venta.

## Antes de empezar

- Clave fiscal (para entrar a ARCA).
- Saber tu condición frente al IVA: define qué sistema elegir en ARCA.

> [!IMPORTANTE]
> El punto de venta que usás en "Comprobantes en línea" o "Factura en línea" (la página de ARCA donde hacías las facturas a mano) **no sirve** para Oplex. Hace falta uno distinto, de Web Services. Un mismo número no se comparte entre los dos sistemas.

## Qué sistema elegir

| Tu condición | En la columna Sistema tiene que decir |
|---|---|
| Monotributo | **Factura Electrónica - Monotributo - Web Services** |
| Responsable Inscripto | **RECE para aplicativo y web services** |
| Exento | **RECE para aplicativo y web services** |

## Pasos en ARCA: ver o crear el punto de venta

1. **Entrá a ARCA con tu clave fiscal.** En el buscador de servicios escribí `puntos de venta` y abrí **Administración de puntos de venta y domicilios**.
2. **Tocá A/B/M de Puntos de Venta** y, si te lo pide, elegí tu empresa. La otra opción, "Domicilio punto de venta vincular", no hace falta.
3. **Buscá en la lista uno de Web Services.** Mirá la columna **Sistema**: tiene que decir lo de la tabla de arriba. Si ya tenés uno, anotá su número y pasá a los pasos en Oplex.
4. **Si no tenés ninguno, tocá Agregar.** Elegí un número libre (por ejemplo `3`), el sistema que termina en **Web Services** (o **RECE para aplicativo y web services**, si sos Responsable Inscripto o Exento) y tu domicilio. Confirmá.

![Así se ve el listado de puntos de venta en ARCA: el que sirve dice RECE para aplicativo y web services (ilustración de la ayuda de Oplex)](/ayuda/capturas/arca-sitio-puntos-de-venta.png)

> [!NOTA]
> Un punto de venta recién creado puede tardar un rato en quedar habilitado. Si la prueba de conexión falla con "no está habilitado para Web Services" justo después de crearlo, esperá y volvé a probar.

## Pasos en Oplex: cargarlo en la sucursal

1. **Andá a Sucursales** (en el menú de la izquierda) y tocá **+ Nueva sucursal**. Si la sucursal ya existe, tocala en la lista y después **Editar empresa**.
2. **Completá el nombre**, por ejemplo **Casa Central**.
3. **Escribí el número en Punto de venta (ARCA).** Podés poner sólo el número: `3` o `00003` es lo mismo. Oplex lo guarda con 5 dígitos (`00003`), que es como sale impreso en la factura. Si no sabés cuál es, tocá **¿Dónde lo encuentro?**: se abre una ayuda con los mismos pasos de arriba, adaptada a tu condición frente al IVA.
4. **Tocá Crear sucursal** (o **Guardar cambios** si estabas editando).
5. **Probá la conexión.** Volvé a **Contabilidad › Conexión con ARCA**, paso 4, y tocá **Probar conexión con ARCA**. Tiene que nombrar tu punto de venta: *punto de venta 00003 (Casa Central)*.

![Formulario de sucursal con el campo Punto de venta (ARCA) y la ayuda ¿Dónde lo encuentro?](/ayuda/capturas/arca-sucursal-punto-de-venta.png)

> [!NOTA]
> Si tenés varias sucursales, cada una puede tener su propio punto de venta. La prueba de conexión revisa todas las sucursales activas que tienen punto de venta.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Una sucursal necesita un número de punto de venta** | Dejaste vacío el campo. | Escribí el número de Web Services. |
| **El punto de venta tiene que ser un número de 1 a 99999 (por ejemplo 8 o 00008)** | Escribiste letras, guiones o un 0. | Poné sólo el número. |
| **El punto de venta 00003 de la sucursal "Casa Central" no está habilitado para Web Services en ARCA. …** | Ese número es de Comprobantes en línea, no existe, o todavía no se habilitó. | Fijate el final del mensaje: dice **Puntos de venta habilitados para Web Services según ARCA:** y la lista. Corregí el número de la sucursal con uno de esa lista, o creá uno nuevo en ARCA. |
| **ARCA no informa ningún punto de venta habilitado para Web Services en este CUIT.** | No tenés ninguno de Web Services, o lo creaste hace muy poco. | Creá uno con **Agregar** en A/B/M de Puntos de Venta, revisá que el sistema sea el de Web Services y probá más tarde. |
| El mensaje nombra una sucursal que ya no usás | Esa sucursal sigue activa con un punto de venta viejo. | Corregí su número, o abrila y tocá **Desactivar empresa** si ya no la usás. |
