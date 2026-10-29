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

## Pasos en Oplex: paso 5 de Conexión con ARCA

1. **Abrí el paso 5.** En **Conexión con ARCA**, tocá **Punto de venta**. Arriba te dice qué sistema tenés que elegir en ARCA según tu condición frente al IVA (la del paso 1).
2. **Tocá Buscar mis puntos de venta en ARCA.** Oplex le pregunta a ARCA cuáles tenés de Web Services. No emite nada.
3. **Si ARCA no tiene ninguno**, se abre la guía **Cómo crear el punto de venta en ARCA** con los mismos pasos de arriba. Crealo y tocá **Ya lo creé · buscar de nuevo**.
4. **Si ARCA tiene alguno**, aparece una tabla con tus sucursales: **Hoy tiene** muestra el número cargado (en rojo si ARCA no lo reconoce) y **Va a facturar con** ya trae elegido uno de Web Services. Si todavía no tenés sucursales, escribí el nombre (por ejemplo **Casa Central**) y Oplex la crea.
5. **Tocá Guardar y probar** (o **Crear sucursal y probar**). Oplex carga el número en la sucursal y prueba la conexión. Si sale bien, dice **✓ Listo para facturar** y cuál va a ser tu primera factura, por ejemplo `00002-00000001`.

> [!NOTA]
> Oplex sólo cambia el número de una sucursal cuando ARCA no reconoce el que tiene: una sucursal que ya factura bien no se toca. Si tenés varias sucursales, cada una puede tener su propio punto de venta.

También podés cargarlo a mano en **Sucursales**: abrí la sucursal, escribí el número en **Punto de venta (ARCA)** (`3` o `00003` es lo mismo; se guarda con 5 dígitos) y guardá. Si ya cargaste el certificado, Oplex le pregunta a ARCA antes de guardar y te avisa si ese número no es de Web Services, con un botón para usar uno que sí lo es. Podés guardarlo igual con **Guardar igual**.

![Formulario de sucursal con el campo Punto de venta (ARCA) y la ayuda ¿Dónde lo encuentro?](/ayuda/capturas/arca-sucursal-punto-de-venta.png)

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Una sucursal necesita un número de punto de venta** | Dejaste vacío el campo. | Escribí el número de Web Services. |
| **El punto de venta tiene que ser un número de 1 a 99999 (por ejemplo 8 o 00008)** | Escribiste letras, guiones o un 0. | Poné sólo el número. |
| **El punto de venta 00003 de la sucursal "Casa Central" no está habilitado para Web Services en ARCA. …** | Ese número es de Comprobantes en línea, no existe, o todavía no se habilitó. | Hacé el paso 5: **Buscar mis puntos de venta en ARCA** te muestra los que sirven y lo corrige con un clic. |
| **ARCA no tiene ningún punto de venta de Web Services para tu CUIT** | No tenés ninguno de Web Services, o lo creaste hace muy poco. | Creá uno con **Agregar** en A/B/M de Puntos de Venta, revisá que el sistema sea el de Web Services y tocá **Ya lo creé · buscar de nuevo** (si es muy nuevo, esperá unos minutos). |
| **No se pudo facturar: el punto de venta … no es de Web Services.** (al facturar) | Igual que arriba, pero lo detectó ARCA al emitir. No se emitió nada. | Tocá **Usar … en …** y volvé a facturar, o **Ir a Conexión con ARCA · paso 5**. |
| El mensaje nombra una sucursal que ya no usás | Esa sucursal sigue activa con un punto de venta viejo. | Corregí su número, o abrila y tocá **Desactivar empresa** si ya no la usás. |
