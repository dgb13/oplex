// Eventos que emiten AssistantOrchestratorService.chatStream() y
// AssistantHelpService.answerStream() a medida que Claude responde -
// consumidos por AssistantController (POST /assistant/message/stream, ver
// docs/plan-asistente-ia-conversacional.md sección 7) para reenviarlos al
// widget como Server-Sent Events.
export type AssistantStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; tool: string; label: string };
