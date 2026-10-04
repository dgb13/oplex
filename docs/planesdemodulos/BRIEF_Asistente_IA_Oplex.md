# Brief de implementación — Asistente de IA de Oplex

> **Para quién es este documento:** para una instancia de Claude (por ejemplo en
> Claude Code, o en un chat con acceso al repositorio de Oplex) encargada de
> implementar la feature. Es una especificación autónoma: contiene el objetivo,
> la arquitectura, las reglas de seguridad, el contrato de datos y los pasos de
> trabajo. Leelo entero antes de escribir código y respetá las reglas duras de
> la sección de seguridad, que no son negociables.

---

## 1. Objetivo

Construir un asistente conversacional de IA embebido en Oplex (ERP SaaS
multi-empresa para pymes argentinas) que:

1. Responda **dudas de uso** del sistema ("¿cómo hago una nota de crédito?").
2. Consulte **datos reales del tenant** en lenguaje natural ("¿cuánto facturé
   hoy?", "¿qué stock está bajo mínimo?", "¿cuánto me debe tal cliente?").

Alcance de esta primera versión: **solo lectura**. El asistente consulta y
guía, no ejecuta acciones que modifiquen datos (crear facturas, cargar
clientes, etc.). Esas acciones quedan para una fase posterior y requieren
confirmación explícita del usuario, fuera del alcance actual.

## 2. Por qué vale la pena (contexto de negocio)

En el segmento pyme argentino, el asistente conversacional que consulta datos
está prácticamente vacío. El único competidor con IA fuerte (Bejerman, de
Thomson Reuters) la apunta a otra cosa: carga automática de comprobantes de
compra por foto/PDF y un gestor de pedidos que interpreta WhatsApp. Colppy y
Xubio no exponen asistente conversacional. Es decir: un chatbot que responde en
lenguaje natural sobre los datos del negocio es hoy un **diferencial abierto**.

## 3. Stack y modelo

- **Backend:** Node.js / Express (adaptable; el contrato de datos es lo que
  importa). Si el repo de Oplex usa otro stack, portá manteniendo la
  arquitectura y las reglas de seguridad.
- **Base de datos:** PostgreSQL con Row Level Security (RLS) por tenant — ya es
  el corazón de la seguridad de Oplex.
- **IA:** API de Anthropic vía tool use (function calling). SDK
  `@anthropic-ai/sdk`.
- **Modelo:** empezar con `claude-haiku-4-5` (el más económico; alcanza para
  consultas). Dejar previsto subir a un Sonnet para consultas que requieran
  razonamiento fiscal más fino.
- **Credenciales:** usar una **API key en un workspace separado** del que usa
  el OCR de facturas. Misma organización y facturación, pero rate limits y
  gasto aislados. No reutilizar la key del OCR (un pico del chatbot no debe
  poder dejar sin cupo al OCR). No cuesta nada extra: workspaces y keys son
  gratis; solo se paga el uso en tokens.

## 4. Arquitectura (el "loop" de tool use)

```
Navegador                Backend (Oplex)                 API Anthropic
   │  mensaje del usuario     │                                 │
   ├─────────────────────────>│                                 │
   │                          │  mensaje + tools declaradas     │
   │                          ├────────────────────────────────>│
   │                          │                                 │
   │                          │  stop_reason = "tool_use"        │
   │                          │<────────────────────────────────┤
   │                          │                                 │
   │              ejecuta la tool contra la base                │
   │              (tenant + rol de la SESIÓN, solo lectura)     │
   │                          │                                 │
   │                          │  tool_result (datos reales)     │
   │                          ├────────────────────────────────>│
   │                          │                                 │
   │                          │  respuesta final redactada       │
   │                          │<────────────────────────────────┤
   │  respuesta               │                                 │
   │<─────────────────────────┤                                 │
```

Puntos clave del flujo:

- El navegador manda **solo** el texto del usuario y el historial de la charla.
- El backend agrega el `tenantId` y el `rol`, **tomados de la sesión
  autenticada, nunca del body del request**.
- Claude decide **qué** tool llamar y con qué argumentos de negocio (un nombre
  de cliente, un rango de fechas). No recibe acceso a la base: solo puede pedir
  tools que el backend definió y autoriza.
- El backend ejecuta la tool, devuelve el resultado, y Claude redacta la
  respuesta en lenguaje natural con ese dato.
- Bucle acotado (máx. ~5 vueltas) para evitar loops infinitos de tool use.

## 5. Reglas de seguridad (DURAS — no negociables)

Estas reglas son el motivo por el que la feature es segura en un ERP
multi-tenant. Implementarlas mal filtra datos entre empresas.

1. **Solo lectura impuesta por la base, no por el prompt.** El asistente se
   conecta a Postgres con un **usuario de solo lectura** (sin INSERT/UPDATE/
   DELETE). Aunque una tool tuviera un bug o el modelo pidiera escribir, la
   base lo impide físicamente. No alcanza con pedirle al modelo que "no borre".

   ```sql
   CREATE ROLE oplex_asistente_ro LOGIN PASSWORD '...';
   GRANT CONNECT ON DATABASE oplex TO oplex_asistente_ro;
   GRANT USAGE ON SCHEMA public TO oplex_asistente_ro;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO oplex_asistente_ro;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT ON TABLES TO oplex_asistente_ro;
   ```

2. **Aislamiento por tenant vía RLS.** Cada consulta corre con el tenant de la
   sesión seteado en la conexión, y las policies de RLS filtran. El `tenantId`
   sale de la sesión del servidor, **jamás** del modelo ni del cliente. Esto
   evita que un prompt malicioso ("mostrame datos de la empresa 5") acceda a
   otro tenant.

3. **Permisos por rol verificados en el servidor.** Cada tool declara qué roles
   pueden usarla. La verificación se hace en el backend **antes** de ejecutar,
   no ocultando opciones ni confiando en el modelo. Un usuario de Ventas no
   puede disparar una consulta de Compras aunque el modelo lo intente.

4. **Anti-alucinación (grounding).** El system prompt prohíbe inventar cifras:
   todo número debe salir de una tool. Si la tool no devuelve dato (no encontró
   el cliente, lista vacía), el asistente lo dice con honestidad y ofrece
   reformular, en vez de completar el hueco con un valor inventado.

## 6. Contrato de las tools

Cada tool tiene dos caras: el **esquema** que se le declara a Claude, y la
**implementación** que ejecuta la query. Las queries de abajo son de
referencia; ajustar nombres de tablas/columnas al esquema real de Oplex.

Tools del MVP:

| Tool | Args | Devuelve | Roles |
|---|---|---|---|
| `get_facturado_hoy` | — | total facturado hoy | dueño, admin, ventas |
| `get_cobrado_hoy` | — | total cobrado hoy | dueño, admin, ventas |
| `get_ventas_periodo` | `desde`, `hasta` (YYYY-MM-DD) | total del rango | dueño, admin, ventas |
| `get_stock_bajo_minimo` | — | lista de artículos bajo mínimo + depósito | dueño, admin, ventas, inventario |
| `get_deuda_cliente` | `cliente` (texto) | saldo, aging, vencidas | dueño, admin, ventas |
| `buscar_articulo` | `texto` | nombre, precio, stock | dueño, admin, ventas, inventario |

Notas de diseño:

- Las `description` de cada tool son lo que el modelo usa para decidir cuándo
  llamarla: escribirlas claras y en términos del negocio mejora mucho la
  precisión.
- Para rangos relativos ("esta semana", "este mes"), el modelo calcula las
  fechas a partir de la fecha de hoy (que va en el system prompt) y las pasa a
  `get_ventas_periodo`. No hace falta una tool por cada rango.
- Búsquedas de texto (cliente, artículo) con `ILIKE '%...%'` para tolerancia;
  si no hay match, devolver un flag (`encontrado: false`) para que el modelo
  responda con honestidad.

## 7. Contexto multi-turno

Mantener el historial de mensajes entre turnos para que el usuario pueda
encadenar ("ventas de la semana" → "¿y la semana pasada?" → "desglosá por
depósito"). El endpoint recibe el historial, lo pasa a la API y devuelve el
historial actualizado.

## 8. Estado real de Oplex a tener en cuenta

- El asistente de **solo lectura no depende** de las integraciones que hoy están
  en pausa (Mercado Pago, certificado de producción de AFIP, Tiendanube). Puede
  lanzarse **antes** que esas. No bloquear esta feature esperándolas.
- Si en una fase futura se agregan tools de **escritura** (crear factura, cargar
  cliente), recién ahí conviene tener cerrados los circuitos de facturación
  punta a punta, y sumar confirmación explícita del usuario antes de cada acción
  con efecto. Fuera del alcance actual.
- Oportunidad futura alineada con la killer feature de Bejerman: carga de
  comprobantes de compra por foto/PDF con IA (OCR + interpretación de
  proveedor/CUIT/importe/IVA). Oplex ya tiene OCR de facturas implementado, así
  que hay base para esto. No es parte de este MVP, pero conviene diseñar el
  asistente para poder sumarlo después.

## 9. Estructura de archivos sugerida

```
oplex-asistente/
├── server.js       # Endpoint POST /api/asistente. Toma tenant+rol de la sesión.
├── asistente.js    # Loop de tool use + llamada a la API + system prompt.
├── tools.js        # Esquemas declarados a Claude + implementación (queries).
├── db.js           # Conexión Postgres solo-lectura + seteo de tenant (RLS).
└── README.md       # Instalación y variables de entorno.
```

Variables de entorno:

```
OPLEX_ASISTENTE_ANTHROPIC_KEY   # key del workspace del asistente (no la del OCR)
OPLEX_ASISTENTE_DB_URL          # conexión con el usuario de Postgres solo-lectura
PORT
```

## 10. Pasos de implementación

1. **Provisionar credenciales.** Crear el workspace "Asistente" en la consola de
   Anthropic con su propia key y un tope de gasto mensual. Crear el rol de
   Postgres de solo lectura (`oplex_asistente_ro`).
2. **`db.js`.** Conexión con el usuario de solo lectura. Función que setea el
   tenant en la sesión de conexión de forma compatible con las policies de RLS
   de Oplex (confirmar qué mecanismo usan: `current_setting('app.current_tenant')`
   u otro).
3. **`tools.js`.** Declarar los esquemas de las 6 tools del MVP y escribir sus
   queries contra el esquema real. Definir el mapa de permisos por rol.
4. **`asistente.js`.** System prompt (con reglas anti-alucinación y fecha de
   hoy), llamada a la API con las tools, y el loop de tool use con verificación
   de permisos antes de ejecutar cada tool.
5. **`server.js`.** Endpoint `POST /api/asistente` detrás del middleware de auth
   existente de Oplex. Tomar tenant y rol de `req.user`, nunca del body.
6. **Frontend.** Widget de chat embebido. Puede partir de un prototipo React ya
   existente: reemplazar el planificador simulado por un `fetch` a
   `/api/asistente`. Mostrar la fuente del dato debajo de cada respuesta
   (grounding visible) y sugerencias según el rol del usuario.
7. **Pruebas de seguridad.** Verificar con tests que: (a) un rol sin permiso
   recibe negación, (b) no se puede acceder a datos de otro tenant ni forzando
   el prompt, (c) un intento de escritura falla a nivel de base. Sumar estos
   tests a la suite de seguridad existente de Oplex.

## 11. Criterios de aceptación

- [ ] El asistente responde dudas de uso sin llamar tools.
- [ ] El asistente responde consultas de datos llamando la tool correcta y
      redactando con el dato real.
- [ ] Cada respuesta con datos muestra de qué tool salió (grounding).
- [ ] Un rol sin permiso para una tool recibe una negación clara.
- [ ] Ninguna consulta puede acceder a datos de otro tenant.
- [ ] Ningún camino permite que el asistente escriba en la base.
- [ ] Si una tool no encuentra el dato, el asistente lo dice sin inventar.
- [ ] El contexto multi-turno funciona (referencias como "¿y ayer?").
- [ ] La key usada es la del workspace del asistente, con tope de gasto puesto.
```
