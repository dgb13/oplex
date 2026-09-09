import type Anthropic from '@anthropic-ai/sdk';

// loadHelpCorpus() lee docs/ayuda/*.md relativo a process.cwd() - bajo
// Jest, cwd es apps/api (ver apps/api/jest.config.cts), no la raíz del
// repo, así que la ruta real no existe en este contexto. Se mockea
// node:fs directo (mismo patrón ya usado en
// admin-system-status.service.spec.ts para node:child_process) en vez de
// depender de un cwd particular.
jest.mock('node:fs', () => ({
  readdirSync: jest.fn().mockReturnValue(['a.md', 'b.md']),
  readFileSync: jest.fn((path: string) => (path.endsWith('a.md') ? 'Artículo A' : 'Artículo B')),
}));

import { AssistantHelpService } from './assistant-help.service.js';

function textResponse(text: string): Anthropic.Messages.Message {
  return { content: [{ type: 'text', text, citations: [] }] } as unknown as Anthropic.Messages.Message;
}

describe('AssistantHelpService', () => {
  function makeService() {
    const create = jest.fn();
    const anthropic = { messages: { create } } as unknown as Anthropic;
    const service = new AssistantHelpService(anthropic);
    return { service, create };
  }

  it('answers using the loaded corpus as a cached system block', async () => {
    const { service, create } = makeService();
    create.mockResolvedValue(textResponse('Andá a Ventas → Facturación → Nueva factura.'));

    const reply = await service.answer([], '¿Cómo hago una factura?');

    expect(reply).toBe('Andá a Ventas → Facturación → Nueva factura.');
    const call = create.mock.calls[0][0];
    expect(call.tools).toBeUndefined();
    expect(call.system[0]).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } });
    expect(call.system[0].text).toContain('Artículo A');
    expect(call.system[0].text).toContain('Artículo B');
    expect(call.messages).toEqual([{ role: 'user', content: '¿Cómo hago una factura?' }]);
  });

  it('prepends the conversation history before the new question', async () => {
    const { service, create } = makeService();
    create.mockResolvedValue(textResponse('Sí, se puede parcial.'));
    const history = [
      { role: 'user' as const, content: '¿Cómo hago una nota de crédito?' },
      { role: 'assistant' as const, content: 'Andá a Ventas → Facturación...' },
    ];

    await service.answer(history, '¿y si es sólo parcial?');

    expect(create.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: '¿Cómo hago una nota de crédito?' },
      { role: 'assistant', content: 'Andá a Ventas → Facturación...' },
      { role: 'user', content: '¿y si es sólo parcial?' },
    ]);
  });

  it('wraps an Anthropic API failure as a 503', async () => {
    const { service, create } = makeService();
    create.mockRejectedValue(new Error('network boom'));

    await expect(service.answer([], '¿cómo hago X?')).rejects.toThrow(/no está disponible/);
  });
});
