# Oplex — Guía de marca (logo)

Esta carpeta contiene el sistema de logotipo de Oplex. Úsala como fuente única de verdad
cuando haya que mostrar el logo, el favicon, el ícono de app o los colores de marca.

## Archivos (`svg/`)

| Archivo | Uso |
|---|---|
| `oplex-horizontal.svg` | Logo principal. Usar por defecto (headers, documentos, fondos claros). |
| `oplex-horizontal-negativo.svg` | Logo principal sobre fondos oscuros (azul Oplex o fotos oscuras). |
| `oplex-horizontal-mono-negro.svg` | Impresión a una tinta, sellos, fax, fondos claros sin color. |
| `oplex-horizontal-sobre-naranja.svg` | Sobre fondo naranja #E8672C. |
| `oplex-vertical.svg` / `oplex-vertical-negativo.svg` | Espacios cuadrados o altos (splash, portadas, pantallas de login). |
| `oplex-isotipo.svg` (+ `-negativo`, `-mono-negro`, `-mono-blanco`) | Símbolo solo: espacios muy chicos, botones, loaders. |
| `oplex-logotipo.svg` / `oplex-logotipo-negativo.svg` | Solo texto, cuando el símbolo ya aparece cerca. |
| `oplex-favicon.svg` | Favicon del sitio. |
| `oplex-app-icon.svg` | Ícono de app / PWA (fondo azul, esquinas redondeadas). |
| `oplex-avatar-redes.svg` | Foto de perfil en redes (círculo naranja). |

El texto "oplex" está convertido a trazos (no depende de tener la fuente instalada).

## Colores

| Nombre | HEX | RGB | Uso |
|---|---|---|---|
| Azul Oplex | `#13233F` | 19 35 63 | Color principal, textos, fondos oscuros |
| Naranja Señal | `#E8672C` | 232 103 44 | Acento (el punto del logo), botones destacados |
| Arena | `#F4F2EE` | 244 242 238 | Fondo neutro |
| Grafito | `#5B6472` | 91 100 114 | Textos secundarios |

Sugerencia de tokens CSS:

```css
:root {
  --oplex-azul: #13233F;
  --oplex-naranja: #E8672C;
  --oplex-arena: #F4F2EE;
  --oplex-grafito: #5B6472;
}
```

## Tipografía

- **Sora** (600 / 700): titulares y logotipo. Google Fonts.
- **IBM Plex Sans** (400 / 500): textos. Google Fonts.
- **IBM Plex Mono**: etiquetas y datos técnicos (opcional).

## Reglas de uso

- Área de protección: dejar alrededor del logo un margen libre igual a 2 veces el diámetro del punto naranja.
- Tamaño mínimo: logo horizontal 24 px de alto; isotipo 16 px (favicon).
- No deformar, rotar, cambiar colores fuera de la paleta, agregar sombras ni contornos.
- Sobre fondo oscuro usar siempre la versión `-negativo`.
