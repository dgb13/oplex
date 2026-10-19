import type Anthropic from '@anthropic-ai/sdk';
import { AssistantIntentRouterService } from './assistant-intent-router.service.js';

function toolUseResponse(intent: string, topic?: string): Anthropic.Messages.Message {
  return {
    content: [{ type: 'tool_use', id: 'tool-1', name: 'classify_intent', input: { intent, topic } }],
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
    create.mockResolvedValue(toolUseResponse('ayuda', 'otro'));

    await expect(service.classify('¿Cómo hago una nota de crédito?')).resolves.toEqual({ intent: 'ayuda', topic: 'otro' });
  });

  it('classifies a business-data question as "datos"', async () => {
    const { service, create } = makeService();
    create.mockResolvedValue(toolUseResponse('datos', 'caja'));

    await expect(service.classify('¿Cuánto tengo en caja?')).resolves.toEqual({ intent: 'datos', topic: 'caja' });
  });

  it('falls back to topic "otro" when Claude returns an unknown topic, so nothing gets blocked by mistake', async () => {
    const { service, create } = makeService();
    create.mockResolvedValue(toolUseResponse('datos', 'sueldos'));

    await expect(service.classify('¿Cuánto cobra Juan?')).resolves.toEqual({ intent: 'datos', topic: 'otro' });
  });

  it('defaults to "datos" when Claude does not return the expected enum', async () => {
    const { service, create } = makeService();
    create.mockResolvedValue({ content: [{ type: 'text', text: 'no tool used' }] } as unknown as Anthropic.Messages.Message);

    await expect(service.classify('mensaje raro')).resolves.toEqual({ intent: 'datos', topic: 'otro' });
  });

  it('wraps an Anthropic API failure as a 503', async () => {
    const { service, create } = makeService();
    create.mockRejectedValue(new Error('network boom'));

    await expect(service.classify('hola')).rejects.toThrow(/no está disponible/);
  });
});
