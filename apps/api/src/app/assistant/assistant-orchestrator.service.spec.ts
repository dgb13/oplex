import type Anthropic from '@anthropic-ai/sdk';
import type { AuthenticatedUser } from '@plexo/types';

jest.mock('@plexo/receivables', () => ({}));
jest.mock('@plexo/pos', () => ({}));
jest.mock('@plexo/reports-sales', () => ({}));

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
    const service = new AssistantOrchestratorService(anthropic, toolsService);
    return { service, stream, toolsService };
  }

  it('returns the text answer directly when Claude does not need any tool', async () => {
    const { service, stream } = makeService();
    stream.mockReturnValue(fakeStream(textStreamEvents('Facturaste $10.000 este mes.')));

    const reply = await service.chat(makeUser(), [], '¿Cuánto facturé este mes?');

    expect(reply).toEqual({ text: 'Facturaste $10.000 este mes.', toolNames: [] });
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('streams the answer as individual text chunks', async () => {
    const { service, stream } = makeService();
    stream.mockReturnValue(fakeStream(textStreamEvents('Hola')));

    const chunks = [];
    for await (const chunk of service.chatStream(makeUser(), [], 'saludo')) {
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

    const reply = await service.chat(makeUser(), [], '¿Cuánto tengo en caja?');

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
    for await (const chunk of service.chatStream(makeUser(), [], '¿Cuánto tengo en caja?')) {
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

    const reply = await service.chat(makeUser(), [], '¿Cuánto tengo en caja?');

    expect(reply).toEqual({ text: 'No tenés permiso para ver la caja.', toolNames: ['saldo_caja'] });
    const secondCallMessages = stream.mock.calls[1][0].messages;
    const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMessage.content[0]).toMatchObject({ type: 'tool_result', is_error: true });
  });

  it('stops after the max tool-call rounds and returns a fallback message', async () => {
    const { service, stream, toolsService } = makeService();
    (toolsService.saldoCaja as jest.Mock).mockResolvedValue({});
    stream.mockImplementation(() => fakeStream(toolUseStreamEvents('tool-x', 'saldo_caja', {})));

    const reply = await service.chat(makeUser(), [], 'pregunta rara');

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

    await service.chat(makeUser(), history, '¿y subió respecto al anterior?');

    const messages = stream.mock.calls[0][0].messages;
    expect(messages).toEqual([
      { role: 'user', content: '¿Cuánto facturé este mes?' },
      { role: 'assistant', content: 'Facturaste $10.000 este mes.' },
      { role: 'user', content: '¿y subió respecto al anterior?' },
    ]);
  });

  it('wraps an Anthropic API failure as a 503', async () => {
    const { service, stream } = makeService();
    stream.mockImplementation(() => {
      throw new Error('network boom');
    });

    await expect(service.chat(makeUser(), [], 'hola')).rejects.toThrow(/no está disponible/);
  });
});
