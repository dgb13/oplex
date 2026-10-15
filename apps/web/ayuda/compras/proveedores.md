---
title: Proveedores
summary: Cómo dar de alta un proveedor buscándolo por CUIT en ARCA, cargar sus contactos e importar tu lista desde Excel.
minutes: 5
roles: Dueño, Administrador, Compras, Inventario
---

Los proveedores son las empresas a las que les comprás. Cargarlos bien te ahorra trabajo después: cada pedido de cotización, orden de compra y factura de compra se arma eligiendo un proveedor de esta lista, y sus contactos son los que reciben las órdenes por email o WhatsApp.

Los ves en **Compras › Proveedores**. También aparecen, junto con clientes y sucursales, en **Empresas** (menú lateral).

## Antes de empezar

- Tené a mano el **CUIT** del proveedor. Con eso Oplex completa solo la razón social, la condición frente al IVA y el domicilio fiscal.
- Para cargar o modificar proveedores necesitás el rol **Dueño/a**, **Admin**, **Compras** o **Inventario**. Los roles **Contador/a** y **Solo lectura** los pueden ver, pero no cambiar.

## Pasos: dar de alta un proveedor

1. **Andá a Compras › Proveedores y tocá + Nuevo proveedor.** Se abre el formulario de alta.
2. **Escribí el CUIT en el campo CUIT del proveedor.** Apenas completás los 11 números, Oplex consulta a ARCA y muestra **⟳ Consultando ARCA...**. Si lo encuentra, aparece **✓ Encontrado** y se completan **Razón social**, **Condición frente al IVA** y **Domicilio fiscal**. Por ejemplo, con el CUIT de Distribuidora Tornillos del Sur SA se completa su razón social tal como figura en ARCA.
3. **Revisá los datos que trajo ARCA.** Si alguno no te sirve, podés editarlo a mano. El campo **Factura que le corresponde** te muestra qué letra de factura te va a hacer ese proveedor según su condición.
4. **Completá lo opcional.** **Email (para enviarle facturas)**, **Teléfono**, **Sitio web**, **Rubro**, **Ingresos Brutos (IIBB)** y **Logo (URL)**. El email es importante: es la casilla institucional a la que podés mandar las órdenes de compra.
5. **Tocá Crear proveedor.** Oplex te ofrece enseguida cargar los contactos de esa empresa (ver abajo). Si no querés hacerlo ahora, tocá **Omitir**.

![Ficha de un proveedor con sus datos de ARCA, contactos y los artículos que lo tienen como preferido](/ayuda/capturas/compras-alta-proveedor.jpg)

> [!NOTA]
> La búsqueda por CUIT funciona aunque todavía no hayas cargado tu propio certificado de ARCA: Oplex usa su propia conexión para consultar el padrón.

> [!NOTA]
> Si el CUIT ya está cargado en Oplex como cliente (por ejemplo, un distribuidor al que también le vendés), Oplex te avisa y te ofrece **Agregar rol Proveedor** en vez de crear una empresa repetida.

## Pasos: cargar los contactos

Los contactos son las personas con las que tratás en el proveedor: el vendedor, el de cobranzas, el de logística. A ellos les podés mandar las órdenes de compra por email o WhatsApp.

1. **Abrí el proveedor.** En la lista de **Compras › Proveedores**, tocá su nombre.
2. **Bajá hasta Contactos y completá Agregar contacto.** Los campos son **Nombre**, **Apellido**, **Cargo**, **Email** y **WhatsApp**.
3. **Tocá + Agregar contacto.** Podés cargar todos los que necesites. Cada contacto puede tener su foto.

## Modificar, cambiar roles o desactivar

Desde la ficha del proveedor:

- **Editar empresa** abre el formulario para cambiar sus datos. Con **Actualizar desde ARCA** volvés a traer la condición de IVA y el domicilio si cambiaron.
- **Editar roles** te deja marcar que esa empresa también es **Cliente** (o sacarle un rol).
- **Desactivar empresa** la saca de las listas para operaciones nuevas, pero conserva todo su historial. Un proveedor no se borra nunca, así no se rompen las facturas y órdenes viejas. Para volver a verlo, marcá **Mostrar inactivas** en la lista y tocá **Activar empresa**.

En la ficha también ves **Artículos que prefieren este proveedor**: son los artículos que tienen a esa empresa como **Proveedor preferido** en su ficha de Inventario. Ese dato se usa para armar pedidos de cotización automáticamente desde las alertas de stock mínimo (ver [Stock mínimo](/documentacion/inventario/stock-minimo)).

## Importar tus proveedores desde Excel

Si ya tenés tu lista de proveedores en otro sistema o en una planilla, no hace falta cargarlos uno por uno. Tocá **Importar proveedores** en **Compras › Proveedores** y seguí los cuatro pasos (**Archivo**, **Columnas**, **Revisión**, **Importar**). El paso a paso completo está en [Importar tus datos](/documentacion/primeros-pasos/importar-datos).

> [!NOTA]
> Los saldos de cuenta corriente (lo que le debés hoy a cada proveedor) todavía no se importan.

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **ARCA no encontró ese CUIT. Revisalo o cargá los datos a mano.** | El CUIT está mal escrito o no existe en el padrón. | Revisá los números. Si está bien, completá los datos a mano. |
| **ARCA no responde ahora. Probá en unos minutos o cargá los datos a mano.** | El servicio de ARCA está caído o lento. | Esperá unos minutos o cargá razón social, condición y domicilio a mano. |
| **El nombre es obligatorio** | Tocaste crear sin razón social. | Completá la **Razón social**. |
| **Tu rol no maneja este tipo de empresa** (al pasar el mouse sobre un rol) | Tu rol no puede tocar ese tipo de empresa (por ejemplo, Compras no maneja clientes). | Pedile el cambio a un Dueño o Administrador. |
