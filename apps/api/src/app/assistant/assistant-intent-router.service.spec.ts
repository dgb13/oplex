import type Anthropic from '@anthropic-ai/sdk';
import { AssistantIntentRouterService } from './assistant-intent-router.service.js';

function toolUseResponse(intent: string): Anthropic.Messages.Message {
  return {
    content: [{ type: 'tool_use', id: 'tool-1', name: 'classify_intent', input: { intent } }],
  } as unknown as Anthropic.Messages.Message;
}

describe('AssistantIntentRouterService', () => {
  function makeService() {
    const create = jest.fn();
    const anthropic = { messages: { create } } as unknown as Anthropic;
    const service = new AssistantIntentRouterService(anthropic);
    return { service, create };
  }

  it('classifies a how-to question as "ayuda"', async () => {
    const { service, create } = makeService();
    create.mockResolvedValue(toolUseResponse('ayuda'));

    await expect(service.classify('¿Cómo hago una nota de crédito?')).resolves.toBe('ayuda');
  });

  it('classifies a business-data question as "datos"', async () => {
    const { service, create } = makeService();
    create.mockResolvedValue(toolUseResponse('datos'));

    await expect(service.classify('¿Cuánto tengo en caja?')).resolves.toBe('datos');
  });

  it('defaults to "datos" when Claude does not return the expected enum', async () => {
    const { service, create } = makeService();
    create.mockResolvedValue({ content: [{ type: 'text', text: 'no tool used' }] } as unknown as Anthropic.Messages.Message);

    await expect(service.classify('mensaje raro')).resolves.toBe('datos');
  });

  it('wraps an Anthropic API failure as a 503', async () => {
    const { service, create } = makeService();
    create.mockRejectedValue(new Error('network boom'));

    await expect(service.classify('hola')).rejects.toThrow(/no está disponible/);
  });
});
