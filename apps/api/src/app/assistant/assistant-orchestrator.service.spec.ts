import type Anthropic from '@anthropic-ai/sdk';
import type { AuthenticatedUser } from '@plexo/types';

jest.mock('@plexo/receivables', () => ({}));
jest.mock('@plexo/pos', () => ({}));
jest.mock('@plexo/reports-sales', () => ({}));
jest.mock('@plexo/payables', () => ({}));
jest.mock('@plexo/purchases', () => ({}));
jest.mock('@plexo/inventory', () => ({}));

import {
  accessFromConfig,
  normalizeActionLevels,
  normalizeActionRoles,
  type AssistantAccess,
} from './assistant-access.service.js';
import type { ActionTurn, AssistantActionsService } from './assistant-actions.service.js';
import { AssistantOrchestratorService } from './assistant-orchestrator.service.js';
import { AssistantToolsService } from './assistant-tools.service.js';

function makeUser(): AuthenticatedUser {
  return {
    sub: 'user-1',
    tenantId: 'tenant-1',
    email: 'a@b.com',
    role: 'OWNER',
    moduleAccess: [],
    mustChangePassword: false,
  };
}

const TURN: ActionTurn = { conversationId: 'conv-1', questionMessageId: 'q-1', channel: 'WEB' };

// Dueño: todos los temas.
const FULL: AssistantAccess = accessFromConfig(
  { webEnabled: true, whatsappEnabled: true, salesOwnDataOnly: true, actionLevels: normalizeActionLevels({ recordatorio: 'OFF' }), actionRoles: normalizeActionRoles(null), maxQuoteAmountWhatsapp: null, maxActionsPerDay: 40, confirmExpiryMinutes: 10, topicsByRole: { ventas: [], deudas: [], caja: [], stock: [], costos: [], compras: [], ayuda: [] } },
  { sub: 'user-1', role: 'OWNER' },
);

/** Fake mínimo de lo que devuelve `anthropic.messages.stream()` - un async
 * iterable de raw events, EXACTAMENTE lo que chatStream() consume (no usa
 * `finalMessage()`: ver el comentario en assistant-orchestrator.service.ts
 * sobre por qué, encontrado en vivo contra Claude real - la reconstrucción
 * automática del SDK 0.35.0 rompe con los bloques `thinking` que devuelve
 * claude-sonnet-5 en vueltas de tool use). Un evento por carácter de texto
 * alcanza para probar la concatenación sin simular el protocolo completo. */
function fakeStream(events: Anthropic.Messages.RawMessageStreamEvent[]) {
  const gen = (async function* () {
    for (const e of events) yield e;
  })();
  return gen;
}

function textStreamEvents(text: string): Anthropic.Messages.RawMessageStreamEvent[] {
  return [
    ...[...text].map(
      (ch) =>
        ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ch } }) as unknown as Anthropic.Messages.RawMessageStreamEvent,
    ),
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} } as unknown as Anthropic.Messages.RawMessageStreamEvent,
  ];
}

function toolUseStreamEvents(id: string, name: string, input: unknown): Anthropic.Messages.RawMessageStreamEvent[] {
  return [
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id, name, input: {} } } as unknown as Anthropic.Messages.RawMessageStreamEvent,
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) },
    } as unknown as Anthropic.Messages.RawMessageStreamEvent,
    { type: 'content_block_stop', index: 0 } as unknown as Anthropic.Messages.RawMessageStreamEvent,
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: {} } as unknown as Anthropic.Messages.RawMessageStreamEvent,
  ];
}

describe('AssistantOrchestratorService', () => {
  function makeService() {
    const stream = jest.fn();
    const anthropic = { messages: { stream } } as unknown as Anthropic;
    const toolsService = { ventasPorArticulo: jest.fn(), deudaPorCliente: jest.fn(), saldoCaja: jest.fn() } as unknown as AssistantToolsService;
    const actionsService = { propose: jest.fn() } as unknown as AssistantActionsService;
    const service = new AssistantOrchestratorService(anthropic, toolsService, actionsService);
    return { service, stream, toolsService, actionsService };
  }

  it('returns the text answer directly when Claude does not need any tool', async () => {
    const { service, stream } = makeService();
    stream.mockReturnValue(fakeStream(textStreamEvents('Facturaste $10.000 este mes.')));

    const reply = await service.chat(makeUser(), FULL, [], '¿Cuánto facturé este mes?', TURN);

    expect(reply).toEqual({ text: 'Facturaste $10.000 este mes.', toolNames: [] });
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('streams the answer as individual text chunks', async () => {
    const { service, stream } = makeService();
    stream.mockReturnValue(fakeStream(textStreamEvents('Hola')));

    const chunks = [];
    for await (const chunk of service.chatStream(makeUser(), FULL, [], 'saludo', TURN)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'text', text: 'H' },
      { type: 'text', text: 'o' },
      { type: 'text', text: 'l' },
      { type: 'text', text: 'a' },
    ]);
  });

  it('executes the requested tool and feeds the result back for a second round', async () => {
    const { service, stream, toolsService } = makeService();
    (toolsService.saldoCaja as jest.Mock).mockResolvedValue({ openSessionsCount: 2 });
    stream
      .mockReturnValueOnce(fakeStream(toolUseStreamEvents('tool-1', 'saldo_caja', {})))
      .mockReturnValueOnce(fakeStream(textStreamEvents('Tenés 2 cajas abiertas.')));

    const reply = await service.chat(makeUser(), FULL, [], '¿Cuánto tengo en caja?', TURN);

    expect(reply).toEqual({ text: 'Tenés 2 cajas abiertas.', toolNames: ['saldo_caja'] });
    expect(toolsService.saldoCaja).toHaveBeenCalledTimes(1);
    expect(stream).toHaveBeenCalledTimes(2);
    // El segundo llamado debe llevar el resultado de la herramienta como tool_result.
    const secondCallMessages = stream.mock.calls[1][0].messages;
    const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMessage.content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'tool-1',
      is_error: false,
    });
  });

  it('emits a tool_start event with a human label when a tool is invoked', async () => {
    const { service, stream, toolsService } = makeService();
    (toolsService.saldoCaja as jest.Mock).mockResolvedValue({});
    stream
      .mockReturnValueOnce(fakeStream(toolUseStreamEvents('tool-1', 'saldo_caja', {})))
      .mockReturnValueOnce(fakeStream(textStreamEvents('Tenés 2 cajas abiertas.')));

    const chunks = [];
    for await (const chunk of service.chatStream(makeUser(), FULL, [], '¿Cuánto tengo en caja?', TURN)) {
      chunks.push(chunk);
    }

    expect(chunks[0]).toEqual({ type: 'tool_start', tool: 'saldo_caja', label: expect.stringContaining('caja') });
  });

  it('feeds a permission error back as an is_error tool_result instead of throwing', async () => {
    const { service, stream, toolsService } = makeService();
    (toolsService.saldoCaja as jest.Mock).mockRejectedValue(new Error('El rol "ACCOUNTANT" no puede usar la herramienta "saldo_caja"'));
    stream
      .mockReturnValueOnce(fakeStream(toolUseStreamEvents('tool-1', 'saldo_caja', {})))
      .mockReturnValueOnce(fakeStream(textStreamEvents('No tenés permiso para ver la caja.')));

    const reply = await service.chat(makeUser(), FULL, [], '¿Cuánto tengo en caja?', TURN);

    expect(reply).toEqual({ text: 'No tenés permiso para ver la caja.', toolNames: ['saldo_caja'] });
    const secondCallMessages = stream.mock.calls[1][0].messages;
    const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMessage.content[0]).toMatchObject({ type: 'tool_result', is_error: true });
  });

  it('stops after the max tool-call rounds and returns a fallback message', async () => {
    const { service, stream, toolsService } = makeService();
    (toolsService.saldoCaja as jest.Mock).mockResolvedValue({});
    stream.mockImplementation(() => fakeStream(toolUseStreamEvents('tool-x', 'saldo_caja', {})));

    const reply = await service.chat(makeUser(), FULL, [], 'pregunta rara', TURN);

    expect(reply.text).toMatch(/no pude/i);
    expect(reply.toolNames).toEqual(['saldo_caja']);
    expect(stream).toHaveBeenCalledTimes(4);
  });

  it('prepends the conversation history before the new user message', async () => {
    const { service, stream } = makeService();
    stream.mockReturnValue(fakeStream(textStreamEvents('Sí, subió respecto al mes anterior.')));
    const history = [
      { role: 'user' as const, content: '¿Cuánto facturé este mes?' },
      { role: 'assistant' as const, content: 'Facturaste $10.000 este mes.' },
    ];

    await service.chat(makeUser(), FULL, history, '¿y subió respecto al anterior?', TURN);

    const messages = stream.mock.calls[0][0].messages;
    expect(messages).toEqual([
      { role: 'user', content: '¿Cuánto facturé este mes?' },
      { role: 'assistant', content: 'Facturaste $10.000 este mes.' },
      { role: 'user', content: '¿y subió respecto al anterior?' },
    ]);
  });

  it('offers Claude only the tools of the topics this person has', async () => {
    const { service, stream } = makeService();
    stream.mockReturnValue(fakeStream(textStreamEvents('Hola.')));
    const salesOnlyStock = accessFromConfig(
      { webEnabled: true, whatsappEnabled: true, salesOwnDataOnly: true, actionLevels: normalizeActionLevels({ recordatorio: 'OFF' }), actionRoles: normalizeActionRoles(null), maxQuoteAmountWhatsapp: null, maxActionsPerDay: 40, confirmExpiryMinutes: 10, topicsByRole: { ventas: [], deudas: [], caja: [], stock: ['SALES'], costos: [], compras: [], ayuda: [] } },
      { sub: 'user-2', role: 'SALES' },
    );

    await service.chat(makeUser(), salesOnlyStock, [], 'hola', TURN);

    expect(stream.mock.calls[0][0].tools.map((t: { name: string }) => t.name)).toEqual(['stock_articulo']);
  });

  it('omits the tools field entirely when the person has no data topic', async () => {
    const { service, stream } = makeService();
    stream.mockReturnValue(fakeStream(textStreamEvents('No tengo cómo consultar eso.')));
    const viewer = accessFromConfig(
      { webEnabled: true, whatsappEnabled: true, salesOwnDataOnly: true, actionLevels: normalizeActionLevels({ recordatorio: 'OFF' }), actionRoles: normalizeActionRoles(null), maxQuoteAmountWhatsapp: null, maxActionsPerDay: 40, confirmExpiryMinutes: 10, topicsByRole: { ventas: [], deudas: [], caja: [], stock: [], costos: [], compras: [], ayuda: ['VIEWER'] } },
      { sub: 'user-3', role: 'VIEWER' },
    );

    await service.chat(makeUser(), viewer, [], '¿cuánto vendimos?', TURN);

    expect(stream.mock.calls[0][0]).not.toHaveProperty('tools');
  });

  it('refuses a tool_use for a tool outside the allowed topics without calling the service', async () => {
    const { service, stream, toolsService } = makeService();
    const noCaja = accessFromConfig(
      { webEnabled: true, whatsappEnabled: true, salesOwnDataOnly: true, actionLevels: normalizeActionLevels({ recordatorio: 'OFF' }), actionRoles: normalizeActionRoles(null), maxQuoteAmountWhatsapp: null, maxActionsPerDay: 40, confirmExpiryMinutes: 10, topicsByRole: { ventas: ['SALES'], deudas: [], caja: [], stock: [], costos: [], compras: [], ayuda: [] } },
      { sub: 'user-2', role: 'SALES' },
    );
    stream
      .mockReturnValueOnce(fakeStream(toolUseStreamEvents('tool-1', 'saldo_caja', {})))
      .mockReturnValueOnce(fakeStream(textStreamEvents('No tenés permiso.')));

    await service.chat(makeUser(), noCaja, [], '¿Cuánto tengo en caja?', TURN);

    expect(toolsService.saldoCaja).not.toHaveBeenCalled();
    const secondCallMessages = stream.mock.calls[1][0].messages;
    expect(secondCallMessages[secondCallMessages.length - 1].content[0]).toMatchObject({ type: 'tool_result', is_error: true });
  });

  it('routes an action tool to the actions service (never runs it directly) and emits its card', async () => {
    const { service, stream, actionsService } = makeService();
    const card = { type: 'assistant_action', id: 'act-1', label: 'Agendar', status: 'PENDING_CONFIRMATION', summary: 'x', expiresAt: null };
    (actionsService.propose as jest.Mock).mockResolvedValue({ content: '{"estado":"esperando_confirmacion"}', isError: false, card });
    const withReminder = accessFromConfig(
      {
        webEnabled: true,
        whatsappEnabled: true,
        salesOwnDataOnly: true,
        actionLevels: normalizeActionLevels({ recordatorio: 'DRAFT' }),
        actionRoles: normalizeActionRoles(null),
        maxQuoteAmountWhatsapp: null,
        maxActionsPerDay: 40,
        confirmExpiryMinutes: 10,
        topicsByRole: { ventas: [], deudas: [], caja: [], stock: [], costos: [], compras: [], ayuda: [] },
      },
      { sub: 'user-2', role: 'SALES' },
    );
    stream
      .mockReturnValueOnce(fakeStream(toolUseStreamEvents('tool-1', 'crear_recordatorio', { titulo: 'x', fecha: '2099-01-01' })))
      .mockReturnValueOnce(fakeStream(textStreamEvents('¿Lo confirmo?')));

    const chunks = [];
    for await (const chunk of service.chatStream(makeUser(), withReminder, [], 'recordame x', TURN)) {
      chunks.push(chunk);
    }

    expect(stream.mock.calls[0][0].tools.map((t: { name: string }) => t.name)).toEqual(['crear_recordatorio']);
    expect(actionsService.propose).toHaveBeenCalledWith(makeUser(), withReminder, 'crear_recordatorio', { titulo: 'x', fecha: '2099-01-01' }, TURN);
    expect(chunks).toContainEqual({ type: 'tool_result', tool: 'crear_recordatorio', data: card });
  });

  it('wraps an Anthropic API failure as a 503', async () => {
    const { service, stream } = makeService();
    stream.mockImplementation(() => {
      throw new Error('network boom');
    });

    await expect(service.chat(makeUser(), FULL, [], 'hola', TURN)).rejects.toThrow(/no está disponible/);
  });
});
