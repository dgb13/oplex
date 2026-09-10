// Eventos que emiten AssistantOrchestratorService.chatStream() y
// AssistantHelpService.answerStream() a medida que Claude responde -
// consumidos por AssistantController (POST /assistant/message/stream, ver
// docs/plan-asistente-ia-conversacional.md sección 7) para reenviarlos al
// widget como Server-Sent Events.
export type AssistantStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; tool: string; label: string }
  // El dato crudo que devolvió la herramienta (docs/plan-asistente-ia-conversacional.md,
  // sección 5.3) - el widget decide si lo renderiza como mini-gráfico o
  // tabla según `tool` y la forma de `data`. Sólo se emite cuando la
  // herramienta NO terminó en error (ver executeAssistantTool).
  | { type: 'tool_result'; tool: string; data: unknown };
