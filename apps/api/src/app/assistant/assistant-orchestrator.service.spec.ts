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

function textMessage(text: string): Anthropic.Messages.Message {
  return {
    content: [{ type: 'text', text, citations: [] }],
    stop_reason: 'end_turn',
  } as unknown as Anthropic.Messages.Message;
}

function toolUseMessage(id: string, name: string, input: unknown): Anthropic.Messages.Message {
  return {
    content: [{ type: 'tool_use', id, name, input }],
    stop_reason: 'tool_use',
  } as unknown as Anthropic.Messages.Message;
}

describe('AssistantOrchestratorService', () => {
  function makeService() {
    const create = jest.fn();
    const anthropic = { messages: { create } } as unknown as Anthropic;
    const toolsService = { ventasPorArticulo: jest.fn(), deudaPorCliente: jest.fn(), saldoCaja: jest.fn() } as unknown as AssistantToolsService;
    const service = new AssistantOrchestratorService(anthropic, toolsService);
    return { service, create, toolsService };
  }

  it('returns the text answer directly when Claude does not need any tool', async () => {
    const { service, create } = makeService();
    create.mockResolvedValue(textMessage('Facturaste $10.000 este mes.'));

    const reply = await service.chat(makeUser(), [], '¿Cuánto facturé este mes?');

    expect(reply).toBe('Facturaste $10.000 este mes.');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('executes the requested tool and feeds the result back for a second round', async () => {
    const { service, create, toolsService } = makeService();
    (toolsService.saldoCaja as jest.Mock).mockResolvedValue({ openSessionsCount: 2 });
    create
      .mockResolvedValueOnce(toolUseMessage('tool-1', 'saldo_caja', {}))
      .mockResolvedValueOnce(textMessage('Tenés 2 cajas abiertas.'));

    const reply = await service.chat(makeUser(), [], '¿Cuánto tengo en caja?');

    expect(reply).toBe('Tenés 2 cajas abiertas.');
    expect(toolsService.saldoCaja).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);
    // El segundo llamado debe llevar el resultado de la herramienta como tool_result.
    const secondCallMessages = create.mock.calls[1][0].messages;
    const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMessage.content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'tool-1',
      is_error: false,
    });
  });

  it('feeds a permission error back as an is_error tool_result instead of throwing', async () => {
    const { service, create, toolsService } = makeService();
    (toolsService.saldoCaja as jest.Mock).mockRejectedValue(new Error('El rol "ACCOUNTANT" no puede usar la herramienta "saldo_caja"'));
    create
      .mockResolvedValueOnce(toolUseMessage('tool-1', 'saldo_caja', {}))
      .mockResolvedValueOnce(textMessage('No tenés permiso para ver la caja.'));

    const reply = await service.chat(makeUser(), [], '¿Cuánto tengo en caja?');

    expect(reply).toBe('No tenés permiso para ver la caja.');
    const secondCallMessages = create.mock.calls[1][0].messages;
    const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMessage.content[0]).toMatchObject({ type: 'tool_result', is_error: true });
  });

  it('stops after the max tool-call rounds and returns a fallback message', async () => {
    const { service, create, toolsService } = makeService();
    (toolsService.saldoCaja as jest.Mock).mockResolvedValue({});
    create.mockResolvedValue(toolUseMessage('tool-x', 'saldo_caja', {}));

    const reply = await service.chat(makeUser(), [], 'pregunta rara');

    expect(reply).toMatch(/no pude/i);
    expect(create).toHaveBeenCalledTimes(4);
  });

  it('prepends the conversation history before the new user message', async () => {
    const { service, create } = makeService();
    create.mockResolvedValue(textMessage('Sí, subió respecto al mes anterior.'));
    const history = [
      { role: 'user' as const, content: '¿Cuánto facturé este mes?' },
      { role: 'assistant' as const, content: 'Facturaste $10.000 este mes.' },
    ];

    await service.chat(makeUser(), history, '¿y subió respecto al anterior?');

    const messages = create.mock.calls[0][0].messages;
    expect(messages).toEqual([
      { role: 'user', content: '¿Cuánto facturé este mes?' },
      { role: 'assistant', content: 'Facturaste $10.000 este mes.' },
      { role: 'user', content: '¿y subió respecto al anterior?' },
    ]);
  });

  it('wraps an Anthropic API failure as a 503', async () => {
    const { service, create } = makeService();
    create.mockRejectedValue(new Error('network boom'));

    await expect(service.chat(makeUser(), [], 'hola')).rejects.toThrow(/no está disponible/);
  });
});
