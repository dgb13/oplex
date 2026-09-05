# Plan — Módulo "Carga de comprobantes IA" (Oplex)

Documento de trabajo interno. Fecha: 2026-09-05.
Objetivo: cargar facturas de **compra** automáticamente con IA, para imputación, de forma **competitiva, simple y segura**, avisando siempre si el servicio está disponible antes de usarlo.

---

## 1. Qué hace la competencia (y dónde falla)

**Xubio** — el más maduro. Combina lectura del **QR de ARCA** (datos de cabecera) + IA (detalle de ítems, impuestos y percepciones). Precarga todo y el usuario solo verifica antes de guardar. Ya procesó decenas de miles de comprobantes. Formatos: PDF e imagen. La carga de facturas era, según ellos mismos, el mayor dolor de sus usuarios.

**Contabilium** — mismo flujo (Compras → "Importar con IA" → subir archivo → detecta proveedor, fecha, monto e ítems). **Limitación dura: solo comprobantes de hasta 60 días de antigüedad.**

**Bejerman** (Thomson Reuters) — "Carga de comprobantes IA" dentro de un ecosistema de IA más amplio (BI, pedidos por WhatsApp, analista en lenguaje natural).

### Debilidades del mercado = tus oportunidades

1. **Solo procesan de a uno (o con fricción para el lote).** Oportunidad: **carga por lote nativa** — arrastrar 20 facturas de una.
2. **Contabilium limita a 60 días.** Oportunidad: **sin límite artificial de antigüedad.**
3. **El QR solo trae cabecera, no el detalle.** (Ver punto 2.) Nadie es transparente sobre qué dato salió del QR (100% confiable) y qué dato "adivinó" la IA (hay que revisar). Oportunidad: **mostrar el origen y la confianza de cada campo.**
4. **No avisan disponibilidad antes de usar.** El usuario sube el archivo y recién ahí falla. Oportunidad: **estado del servicio visible antes de cargar** (requisito que pediste).
5. **No aprenden del proveedor.** Xubio reutiliza el "producto más usado" de los últimos 90 días de forma opaca. Oportunidad: **memoria de imputación por proveedor** explícita y editable.

---

## 2. Dato técnico clave: qué trae y qué NO trae el QR de ARCA

El QR oficial de ARCA codifica un JSON en Base64 con **solo la cabecera**:
`versión, fecha, CUIT emisor, punto de venta, tipo de comprobante, número, importe total, moneda, cotización, tipo y nº de doc. del receptor, y el CAE.`

**El QR NO trae:** detalle de ítems, alícuotas de IVA discriminadas, ni el tipo de percepciones.

Consecuencia para el diseño (esto es la columna vertebral del módulo):

- **Cabecera → del QR.** Exacta, validada por ARCA, cero alucinación. Si la factura tiene QR legible, esos campos son verdad absoluta.
- **Detalle (ítems, alícuotas, percepciones) → de la IA.** Es lo que hay que revisar sí o sí.
- **Si no hay QR** (factura vieja, escaneo malo, ticket): todo sale de la IA, y hay que marcarlo como "confianza menor".

Esto define la **estrategia híbrida QR-primero**: barato, preciso y confiable. Igual que Xubio, pero siendo transparente sobre el origen de cada dato — cosa que ellos no muestran.

---

## 3. Principio rector: la IA acelera, nunca bloquea

Requisito no negociable, atado a tu SLA:

- La carga manual de compras **sigue existiendo siempre**, intacta.
- El módulo IA es un **atajo opcional** encima del flujo manual.
- Si la IA no está disponible (falta de saldo API, caída del proveedor, límite de rate), el módulo **degrada con gracia**: avisa, y el usuario carga a mano como siempre. Nunca se traba el trabajo.

---

## 3 bis. Orígenes de captura (tres vías)

El módulo acepta el comprobante desde tres orígenes, y los trata distinto según traigan o no QR legible:

1. **PDF nativo** (el que el proveedor descarga de ARCA): QR perfecto → cabecera exacta del QR + IA para el detalle. **Máxima confianza.**
2. **Imagen escaneada** (escáner de oficina): QR normalmente legible → igual que el PDF.
3. **Foto sacada con el celular**: probablemente **sin QR usable** (foto movida, reflejo, ángulo) → **todo por IA**, incluida la cabecera → más campos a revisar, resaltados como "confianza menor".

La foto desde el móvil se resuelve con la **cámara del navegador** (captura de imagen estándar, sin necesidad de app). Es el caso de uso estrella: el proveedor deja la factura de papel, el cliente la fotografía y queda imputada.

**Preparación de la imagen antes de procesar:** a la **IA se le manda la mejor calidad disponible** (mejor imagen = mejor extracción). La compresión para guardar viene *después* (ver sección 5 bis). Opcional: avisar si la foto está muy borrosa antes de gastar en procesarla.

### Mobile — tres niveles (no confundir)

1. **Entrar a Oplex desde el navegador del celular**: sí, es una web. (Casi con certeza ya funciona.)
2. **Abrir la cámara para fotografiar la factura**: función web estándar, se agrega sin drama.
3. **Verse *bien* (responsive) en el celular**: **desconocido — hay que probarlo en un teléfono real.** Aplica la lección del proyecto: build verde no alcanza, se prueba en el dispositivo de verdad. Tarea previa antes de diseñar la captura móvil.

---

## 4. Chequeo de disponibilidad (lo que pediste explícitamente)

**Antes** de que el usuario suba nada, la pantalla muestra el estado del servicio:

- 🟢 **Disponible** — botón de carga IA activo.
- 🟡 **Lento / degradado** — activo, con aviso de demora.
- 🔴 **No disponible** — botón IA deshabilitado, con mensaje claro: *"El escaneo automático no está disponible en este momento. Podés cargar la factura manualmente."* + acceso directo a la carga manual.

Cómo se determina el estado (en orden de barato a caro):

1. **Config del tenant**: ¿el plan incluye IA? ¿quedó cuota del mes? (chequeo local, instantáneo).
2. **Health-check liviano** del proveedor de IA, cacheado (ej. cada 60s) para no gastar en cada visita.
3. **Circuit breaker**: si N llamadas seguidas fallan, el módulo pasa a 🔴 solo por un rato y se auto-recupera, sin depender de que alguien lo prenda a mano.

El estado se evalúa **del lado del servidor** y se expone al front, para que la decisión no dependa del navegador.

---

## 5. Flujo de usuario (simple)

1. **Compras → Carga de comprobantes IA.** Arriba, el semáforo de disponibilidad.
2. **Subir** uno o varios archivos (PDF o imagen). Drag & drop. Lote nativo.
3. **Procesamiento**: por cada archivo, primero se intenta leer el QR (cabecera exacta), después la IA completa el detalle.
4. **Pantalla de revisión** — el corazón del módulo:
   - Cada campo muestra su **origen**: `QR` (candado, no editable salvo override explícito) vs `IA` (editable, con nivel de confianza).
   - Los campos de baja confianza quedan **resaltados** para revisar primero.
   - Proveedor: se busca por CUIT; si existe → se vincula; si no → "+ Crear proveedor" precargado.
   - Se aplica la **memoria de imputación** del proveedor (cuenta contable / categoría usada la última vez), editable.
5. **Confirmar** → se crea el comprobante de compra + su asiento contable (reusando lo que Oplex ya hace en el módulo de Compras). El usuario aprobó: recién ahí impacta.

Regla de oro de UX: **la IA precarga, el humano confirma.** Nunca se imputa algo sin una pasada humana. Esto te cubre legal y contablemente.

---

## 5 bis. Almacenamiento del archivo original (Opción B mejorada — DECISIÓN TOMADA)

Se **guarda** el archivo original adjunto al comprobante, como respaldo documental (útil para auditoría, contador, inspección de ARCA). Pero con dos optimizaciones:

**a) Comprimido para cuidar storage.**
- Se guarda una versión **comprimida** del archivo, no el original pesado. Las **fotos de celular** son las que más se benefician (de varios MB a una fracción).
- La compresión debe mantener la factura **legible** (que se pueda leer el CUIT, montos, etc.) — es respaldo, no puede quedar ilegible. Se calibra probando el punto justo "liviana pero legible".
- Orden correcto: imagen buena → **IA la lee** (mejor calidad = mejor extracción) → se comprime → se guarda la comprimida. Nunca comprimir antes de mandar a la IA.

**b) Límite de comprobantes guardados según el plan.**
- El guardado de imágenes es una **palanca de negocio**: plan básico guarda X, pro más, premium mucho/ilimitado. El storage tiene costo directo y creciente, así que atarlo al plan es limpio y el valor es evidente para el cliente.
- Necesita un **contador por tenant** (cuántas imágenes guardadas tiene vs. el límite de su plan). Bajo RLS, como todo.
- **Qué pasa al llegar al tope (regla elegida): la carga del comprobante NUNCA se frena.** Los datos del comprobante siempre entran (eso es sagrado, coherente con "acelera, nunca bloquea"). Al llegar al límite, se deja de guardar *la imagen* y se avisa, invitando a subir de plan. El negocio empuja el upgrade sin trabar el trabajo del cliente.

**Nota fiscal a validar con un contador (NO resuelto):** en Argentina la obligación de conservar comprobantes suele recaer en el **contribuyente**, no en el software. Pero para perfiles como **estudios contables** (obligados a guardar años) el límite por plan podría chocar con esa obligación — quizá para ese perfil el plan deba ser ilimitado, o no rotar imágenes viejas. Confirmar con contador antes de cerrar los límites por plan. No soy contador ni abogado.

**c) Topes por plan (valores de arranque −25%, a validar con datos reales de peso/costo).**

| Plan | Perfil | Tope de imágenes | Equivale a (aprox.) |
|---|---|---|---|
| Básico | Monotributista, emprendedor | **450** | ~9 meses |
| Pro | Pyme chica/mediana | **3.750** | ~1,5 años |
| Premium | Pyme grande / mucho volumen | **15.000** | ~2+ años |
| Estudio contable | Multi-cliente | **Ilimitado** | no se toca |

Criterios: pensar el tope en **meses de respaldo**, no en número pelado (le comunica más al cliente). **Arrancar conservador y agrandar después, nunca al revés** (subir el tope es buena noticia, bajarlo es conflicto). Los números reales salen recién con: peso promedio de imagen comprimida × tope = storage por cliente, × clientes = costo, contra el precio de cada plan. **Vigilar el Básico** con uso real: si topea muy rápido y genera queja, es el primero a reconsiderar. Estudio contable = ilimitado por la nota fiscal de arriba.

**d) Función "Liberar espacio" (gestión del tope por el usuario).**
Cuando el tenant se acerca o llega al tope, puede liberar espacio él mismo, de forma segura:
- **Aviso temprano** al ~80% del tope (no recién al explotar), con acceso directo a esta función y al upgrade de plan.
- **Flujo seguro: descargar → confirmar → borrar.** El usuario elige qué liberar (por antigüedad / rango de fechas; lo más viejo primero). Descarga un **ZIP** con las imágenes **+ un índice** (CSV con nº de comprobante, proveedor, fecha, CAE) para que el respaldo sea ordenado y útil. Confirmación **explícita e inequívoca** ("vas a borrar N imágenes de forma permanente, no se puede deshacer, ¿descargaste el respaldo?") antes de borrar.
- **Qué se borra: SOLO la imagen. NUNCA el comprobante ni su asiento** (datos fiscales/contables intactos para siempre). El comprobante queda con "imagen no disponible — respaldo descargado el DD/MM/AAAA". Queda registro de la liberación y de que hubo descarga (trazabilidad).
- Coherente con la filosofía: el respaldo último es del contribuyente; esta función le da la vía para llevárselo a su lado y liberar el de Oplex. Recordatorio en la confirmación para perfiles obligados a conservar (estudios).

---

## 6. Seguridad (multi-tenant)

- Todo el flujo respeta el **aislamiento por RLS**: el archivo, el comprobante y el asiento pertenecen al tenant que los subió, sin excepción.
- El archivo subido es **input no confiable**: validar tipo/tamaño, tratar el PDF/imagen como potencialmente malicioso, no ejecutar nada de su contenido.
- Lo que se manda al proveedor de IA es el **comprobante del tenant** (dato fiscal sensible): dejar asentado en la política de privacidad/SLA que se procesa vía IA, con qué proveedor, y con qué retención. Transparencia con el cliente.
- **Cuota y costo por tenant**: medir tokens/costo por tenant para (a) no comerte un abuso, (b) poder trasladar el costo al plan. Quien usa la IA, paga la IA.
- Registrar (log) qué se procesó y cuándo, para auditoría — sin guardar de más.

---

## 7. Diferenciadores vs. competencia (resumen para marketing)

| Diferencial | Oplex | Xubio | Contabilium | Bejerman |
|---|---|---|---|---|
| QR + IA híbrido | Sí | Sí | Parcial | Sí |
| **Transparencia de origen/confianza por campo** | **Sí** | No | No | No |
| **Aviso de disponibilidad antes de usar** | **Sí** | No | No | No |
| **Carga por lote nativa** | **Sí** | Fricción | Fricción | N/D |
| **Sin límite de antigüedad** | **Sí** | N/D | No (60 días) | N/D |
| Memoria de imputación por proveedor, editable | Sí | Opaca (90 d) | N/D | N/D |
| Degradación con gracia (nunca bloquea) | Sí | N/D | N/D | N/D |

Los cuatro en negrita son los que nadie más ofrece hoy. Confirmar contra las webs oficiales antes de usar en material comercial (varias fuentes son de los propios competidores).

---

## 8. Fases de entrega

**Fase 1 — MVP usable**
Carga de a uno (PDF/imagen) → QR + IA → pantalla de revisión con origen de campo → confirmar → comprobante + asiento. Semáforo de disponibilidad. Degradación con gracia. Respeto de RLS y cuota por tenant.

**Fase 2 — Competitivo pleno**
Carga por lote (drag & drop múltiple). Memoria de imputación por proveedor. Resaltado por confianza. Medición fina de costo por tenant.

**Fase 3 — Diferencial**
Panel de disponibilidad/uso para el admin. Reglas de imputación automática por proveedor. Reproceso de fallidos. (Opcional futuro: enganche con "Mis Comprobantes" de ARCA.)

---

## 9. Decisiones ya tomadas

- **Orígenes de captura**: PDF nativo, imagen escaneada y foto de celular (cámara del navegador). Trato distinto según haya QR o no. (Sección 3 bis.)
- **Archivo original**: se guarda, **comprimido** (legible), con **límite por plan**; llegar al tope no frena la carga del comprobante, solo el guardado de imagen. (Sección 5 bis — Opción B mejorada.)
- **Topes de arranque (−25%)**: Básico 450 / Pro 3.750 / Premium 15.000 / Estudio contable ilimitado. A validar con peso y costo reales.
- **Función "Liberar espacio"**: aviso al 80%, flujo descargar-ZIP-con-índice → confirmar → borrar SOLO la imagen (nunca el comprobante). (Sección 5 bis d.)
- **Principio**: la IA/función acelera, nunca bloquea. Carga manual siempre disponible.

## 10. Preguntas abiertas antes de programar

1. **¿Cómo está armado hoy el módulo de Compras en Oplex?** El escaneo debe enchufarse ahí (mismo servicio de creación de comprobante + asiento), no crear un flujo paralelo. Necesito ver ese código.
2. **¿Ya se parsea el QR de ARCA en algún lado?** (El módulo de Facturación *emite* QR; quizá haya código reutilizable para *leerlo*.)
3. **¿La cuota de IA va por plan de Oplex?** Definir cómo se cuenta y se cobra (junto con el límite de storage por plan).
4. **Modelo de IA a usar**: multimodal actual vía la API que Oplex ya tiene configurada. Confirmar límites de tamaño/imagen.
5. **¿Es responsive el frontend de Oplex en las pantallas de Compras?** Probar en teléfono real antes de diseñar la captura móvil.
6. **Validar con contador**: obligación de conservación de comprobantes según perfil de cliente (¿estudios contables necesitan storage ilimitado / sin rotación?).
7. **Compresión**: definir el punto "liviana pero legible" probando con facturas reales (foto y PDF).
