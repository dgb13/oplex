---
title: Clave privada y pedido de certificado
summary: Paso 2 de Conexión con ARCA - Oplex genera la clave privada y el pedido de certificado (CSR) que vas a llevar a ARCA, con un clic.
minutes: 3
roles: Dueño, Administrador
---

Para que ARCA te dé un certificado, primero hay que pedírselo con un archivo especial llamado **pedido de certificado** (en inglés, CSR). Junto con ese pedido se crea una **clave privada**, que es como la llave que hace funcionar el certificado: sin ella, el certificado no sirve. Oplex genera las dos cosas por vos, sin instalar ningún programa.

## Antes de empezar

- Tener guardado el [paso 1, Datos de la empresa](/documentacion/arca/datos-de-la-empresa): el pedido lleva tu CUIT.

## Pasos

1. **Abrí el paso 2.** En **Conexión con ARCA**, tocá **Clave privada y pedido de certificado**.
2. **Dejá elegida la opción Generarlos con Oplex** (tiene la etiqueta **recomendado**). La clave privada queda guardada cifrada en Oplex y nunca sale de acá; vos sólo descargás el pedido.
3. **Revisá el nombre del certificado.** En **Nombre del certificado (el alias que vas a usar en ARCA)** Oplex te sugiere uno armado con el nombre de tu empresa, por ejemplo `ferreterialosandes`. Podés cambiarlo: sólo acepta letras y números, sin espacios ni acentos. Anotalo: lo vas a escribir en ARCA.
4. **Tocá Generar clave y pedido.** Mientras trabaja dice **Generando...**. Al terminar aparecen dos botones nuevos y la casilla **Clave y pedido (CSR)** de arriba pasa a **Generados**.
5. **Tocá Descargar pedido (ferreterialosandes.csr).** Se descarga el archivo `ferreterialosandes.csr` en tu carpeta de descargas. Es el que vas a subir a ARCA en producción.
6. **Si vas a usar homologación, también podés tocar Copiar pedido.** En WSASS el pedido se pega como texto, no se sube como archivo. El botón dice **Copiado** cuando lo copió.

![Paso 2 con el nombre del certificado y los botones Descargar pedido y Copiar pedido](/ayuda/capturas/arca-paso2-generar.jpg)

Seguí con [Certificado de producción](/documentacion/arca/certificado-produccion) (para facturar) o [Certificado de homologación](/documentacion/arca/certificado-homologacion) (para probar).

> [!NOTA]
> El pedido (CSR) no es secreto: es sólo una solicitud. Lo que sí es secreto es la clave privada, y esa nunca sale de Oplex.

> [!IMPORTANTE]
> Si tocás **Generar de nuevo**, Oplex crea una clave nueva y el pedido anterior deja de servir. Si ya habías llevado el pedido viejo a ARCA, ese certificado no va a funcionar: tenés que llevar el pedido nuevo. Usalo sólo si te equivocaste o para [renovar el certificado](/documentacion/arca/renovar-certificado).

## Si ya tenés tus propios archivos

Si vos o tu técnico ya generaron la clave y el pedido con otro programa (por ejemplo OpenSSL), elegí **Ya tengo mis archivos**. En ese caso Oplex no genera nada: en el paso 4 vas a subir el certificado **y** tu clave privada (archivo `.key`).

## Si algo sale mal

| Lo que ves | Por qué pasa | Qué hacer |
|---|---|---|
| **Cargá primero el CUIT de la empresa (paso 1).** | La empresa no tiene CUIT guardado. | Completá y guardá el [paso 1](/documentacion/arca/datos-de-la-empresa). |
| **No se pudo generar el pedido** | Falla momentánea. | Probá de nuevo en unos minutos. |
| El navegador no descarga el archivo | El navegador bloqueó la descarga. | Permití descargas para Oplex, o usá **Copiar pedido**, pegalo en el Bloc de notas y guardalo como `ferreterialosandes.csr`. |
