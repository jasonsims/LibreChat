// FORK: Claude Haiku 5.5 support, not yet upstream; see FORK.md.
import { AnthropicEffort, anthropicSettings } from '../src/schemas';
import {
  supportsAdaptiveThinking,
  omitsSamplingParameters,
  omitsThinkingByDefault,
  requiresExplicitThinkingDisabled,
  capsEffortWhenThinkingDisabled,
  clampEffortForDisabledThinking,
  resolveThinkingOffConfig,
  bindsThinkingBlocks,
  supportsContext1m,
  supportsOutput128k,
  hasAlwaysOnThinking,
} from '../src/bedrock';

const HAIKU_55_IDS = [
  'claude-haiku-5-5',
  'claude-haiku-5.5',
  'anthropic.claude-haiku-5-5',
  'claude-5-5-haiku',
  'claude-haiku-5-6',
];

const OLDER_HAIKU_IDS = [
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
  'anthropic.claude-haiku-4-5-20251001-v1:0',
  'claude-3-5-haiku',
  'claude-3-haiku-20240307',
  'claude-haiku-5',
  'claude-haiku-6',
];

describe('Claude Haiku 5.5 capability gates', () => {
  it.each(HAIKU_55_IDS)('treats %s as an adaptive, sampling-free model', (model) => {
    expect(supportsAdaptiveThinking(model)).toBe(true);
    expect(omitsSamplingParameters(model)).toBe(true);
    expect(omitsThinkingByDefault(model)).toBe(true);
    expect(bindsThinkingBlocks(model)).toBe(true);
    expect(supportsContext1m(model)).toBe(true);
    expect(supportsOutput128k(model)).toBe(true);
  });

  it.each(HAIKU_55_IDS)('turns thinking off for %s with an explicit capped disabled', (model) => {
    expect(hasAlwaysOnThinking(model)).toBe(false);
    expect(requiresExplicitThinkingDisabled(model)).toBe(true);
    expect(resolveThinkingOffConfig(model)).toEqual({ type: 'disabled' });
    expect(capsEffortWhenThinkingDisabled(model)).toBe(true);
    expect(clampEffortForDisabledThinking(model, AnthropicEffort.max)).toBe(AnthropicEffort.high);
    expect(clampEffortForDisabledThinking(model, AnthropicEffort.low)).toBe(AnthropicEffort.low);
  });

  it.each(OLDER_HAIKU_IDS)('leaves %s on the manual-budget contract', (model) => {
    expect(supportsAdaptiveThinking(model)).toBe(false);
    expect(omitsSamplingParameters(model)).toBe(false);
    expect(omitsThinkingByDefault(model)).toBe(false);
    expect(bindsThinkingBlocks(model)).toBe(false);
    expect(requiresExplicitThinkingDisabled(model)).toBe(false);
    expect(resolveThinkingOffConfig(model)).toBeUndefined();
    expect(capsEffortWhenThinkingDisabled(model)).toBe(false);
    expect(supportsOutput128k(model)).toBe(false);
  });
});

describe('Claude Haiku 5.5 max output tokens', () => {
  const { reset, set } = anthropicSettings.maxOutputTokens;

  it.each(['claude-haiku-5-5', 'claude-haiku-5.5', 'claude-haiku-5-6'])(
    'allows 128k output for %s',
    (model) => {
      expect(reset(model)).toBe(128000);
      expect(set(200000, model)).toBe(128000);
      expect(set(100000, model)).toBe(100000);
    },
  );

  it.each(['claude-haiku-4-5', 'claude-haiku-5', 'claude-haiku-6'])('keeps %s at 64k', (model) => {
    expect(reset(model)).toBe(64000);
    expect(set(100000, model)).toBe(64000);
  });
});
