// FORK: Haiku 5.5 support, not yet upstream; see FORK.md.
import { matchModelName, findMatchingPattern } from './test-helpers';
import { createTxMethods } from './tx';

const { getValueKey, getMultiplier, getCacheMultiplier } = createTxMethods(
  {} as typeof import('mongoose'),
  { matchModelName, findMatchingPattern },
);

describe('Claude Haiku 5.5 pricing', () => {
  const model = 'claude-haiku-5-5';

  it('resolves its own rate instead of the generic claude fallback', () => {
    expect(getValueKey(model)).toBe(model);
    expect(getValueKey('anthropic.claude-haiku-5-5')).toBe(model);
  });

  it('bills prompts up to 100K tokens at the standard rate', () => {
    expect(getMultiplier({ model, tokenType: 'prompt', inputTokenCount: 100000 })).toBe(0.1);
    expect(getMultiplier({ model, tokenType: 'completion', inputTokenCount: 100000 })).toBe(0.5);
    expect(getCacheMultiplier({ model, cacheType: 'write', inputTokenCount: 100000 })).toBe(0.125);
    expect(getCacheMultiplier({ model, cacheType: 'read', inputTokenCount: 100000 })).toBe(0.01);
  });

  it('bills prompts over 100K tokens at 5x', () => {
    expect(getMultiplier({ model, tokenType: 'prompt', inputTokenCount: 100001 })).toBe(0.5);
    expect(getMultiplier({ model, tokenType: 'completion', inputTokenCount: 100001 })).toBe(2.5);
    expect(getCacheMultiplier({ model, cacheType: 'write', inputTokenCount: 100001 })).toBe(0.625);
    expect(getCacheMultiplier({ model, cacheType: 'read', inputTokenCount: 100001 })).toBe(0.05);
  });
});
