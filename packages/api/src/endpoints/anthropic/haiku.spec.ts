// FORK: Haiku 5.5 support, not yet upstream; see FORK.md.
import { Providers, getChatModelClass } from '@librechat/agents';
import { EModelEndpoint, AnthropicEffort, ThinkingDisplay } from 'librechat-data-provider';
import { getModelMaxTokens, getModelMaxOutputTokens } from '~/utils/tokens';
import { getLLMConfig } from './llm';

jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn().mockImplementation((proxy) => ({ proxy })),
}));

const HAIKU_55_IDS = ['claude-haiku-5-5', 'claude-haiku-5.5'];

type ModelOptions = NonNullable<Parameters<typeof getLLMConfig>[1]>['modelOptions'];

function wirePayload(modelOptions: ModelOptions) {
  const { llmConfig } = getLLMConfig('test-key', { modelOptions });
  const Anthropic = getChatModelClass(Providers.ANTHROPIC);
  return new Anthropic(llmConfig).invocationParams();
}

describe('getLLMConfig - Claude Haiku 5.5', () => {
  it.each(HAIKU_55_IDS)(
    'sends adaptive thinking instead of a budget with the default settings for %s',
    (model) => {
      const payload = wirePayload({ model, thinking: true, thinkingBudget: 2000 });

      expect(payload.thinking).toEqual({
        type: 'adaptive',
        display: 'summarized',
        block_binding: { prefix_mismatch_behavior: 'drop_block' },
      });
      expect(payload.thinking).not.toHaveProperty('budget_tokens');
      expect(payload.max_tokens).toBe(128000);
    },
  );

  it.each(HAIKU_55_IDS)('omits sampling parameters for %s', (model) => {
    const payload = wirePayload({
      model,
      thinking: true,
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
    });

    expect(payload).not.toHaveProperty('temperature');
    expect(payload).not.toHaveProperty('top_p');
    expect(payload).not.toHaveProperty('top_k');
  });

  it('passes the chosen effort through with adaptive thinking', () => {
    const payload = wirePayload({
      model: 'claude-haiku-5-5',
      thinking: true,
      effort: AnthropicEffort.low,
    });

    expect(payload.output_config).toEqual({ effort: AnthropicEffort.low });
  });

  it('sends an explicit disabled config without display or binding when thinking is off', () => {
    const payload = wirePayload({
      model: 'claude-haiku-5-5',
      thinking: false,
      thinkingBudget: 5000,
      thinkingDisplay: ThinkingDisplay.summarized,
      effort: AnthropicEffort.high,
    });

    expect(payload.thinking).toEqual({ type: 'disabled' });
    expect(payload.output_config).toEqual({ effort: AnthropicEffort.high });
  });

  it.each([AnthropicEffort.xhigh, AnthropicEffort.max])(
    'clamps effort %s to high while thinking is disabled',
    (effort) => {
      const payload = wirePayload({ model: 'claude-haiku-5-5', thinking: false, effort });

      expect(payload.thinking).toEqual({ type: 'disabled' });
      expect(payload.output_config).toEqual({ effort: AnthropicEffort.high });
    },
  );

  it('leaves Haiku 4.5 on its manual thinking budget', () => {
    const payload = wirePayload({
      model: 'claude-haiku-4-5',
      thinking: true,
      thinkingBudget: 2000,
    });

    expect(payload.thinking).toEqual({ type: 'enabled', budget_tokens: 2000 });
  });
});

describe('token limits - Claude Haiku 5.5', () => {
  it.each([EModelEndpoint.anthropic, EModelEndpoint.agents, EModelEndpoint.bedrock])(
    'reports a 1M context and 128K output on %s',
    (endpoint) => {
      const model =
        endpoint === EModelEndpoint.bedrock ? 'anthropic.claude-haiku-5-5' : 'claude-haiku-5-5';

      expect(getModelMaxTokens(model, endpoint)).toBe(1000000);
      expect(getModelMaxOutputTokens(model, endpoint)).toBe(128000);
    },
  );
});
