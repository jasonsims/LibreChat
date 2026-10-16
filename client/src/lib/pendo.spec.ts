import { fitProperties, pendo, toErrorCode, toFileExtension } from './pendo';

const payloadBytes = (properties: object) =>
  new TextEncoder().encode(JSON.stringify({ properties })).length;

describe('pendo.track', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'pendo');
  });

  it('does nothing when the Pendo agent is not loaded', () => {
    expect(() => pendo.track('chat_message_sent', { endpoint: 'agents' })).not.toThrow();
  });

  it('forwards the event name verbatim and drops unset properties', () => {
    const track = jest.fn();
    Reflect.set(window, 'pendo', { track });

    pendo.track('chat_message_sent', { endpoint: 'agents', model: undefined, fileCount: 0 });

    expect(track).toHaveBeenCalledWith('chat_message_sent', { endpoint: 'agents', fileCount: 0 });
  });

  it('never throws when the agent does', () => {
    Reflect.set(window, 'pendo', {
      track: () => {
        throw new Error('agent failure');
      },
    });

    expect(() => pendo.track('login_failed')).not.toThrow();
  });
});

describe('fitProperties', () => {
  it('caps long strings', () => {
    expect(fitProperties({ query: 'x'.repeat(500) }).query).toHaveLength(100);
  });

  it('drops trailing properties until the payload fits Pendo’s limit', () => {
    const properties = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`property${index}`, 'v'.repeat(60)]),
    );

    const fitted = fitProperties(properties);
    const keptKeys = Object.keys(fitted);

    expect(payloadBytes(properties)).toBeGreaterThan(512);
    expect(payloadBytes(fitted)).toBeLessThanOrEqual(512);
    expect(keptKeys.length).toBeGreaterThan(0);
    expect(keptKeys).toEqual(Object.keys(properties).slice(0, keptKeys.length));
  });

  it('keeps a payload that already fits', () => {
    const properties = { endpoint: 'agents', isTemporary: false, fileCount: 2, tags: ['a', 'b'] };

    expect(fitProperties(properties)).toEqual(properties);
  });
});

describe('toFileExtension', () => {
  it.each([
    ['chats.JSON', 'json'],
    ['my%20export.json', 'json'],
    ['archive.tar.gz', 'gz'],
    ['README', undefined],
    ['.env', undefined],
    ['notes.has spaces', undefined],
    [undefined, undefined],
  ])('reads %p as %p', (name, expected) => {
    expect(toFileExtension(name)).toBe(expected);
  });
});

describe('toErrorCode', () => {
  it.each([
    ['{"type":"no_user_key","info":"anthropic"}', 'no_user_key'],
    [
      'Provider said: {"error":{"type":"rate_limit_error","message":"slow down"}}',
      'rate_limit_error',
    ],
    ['{"code":"MODEL_NOT_FOUND"}', 'MODEL_NOT_FOUND'],
    ['The model could not answer: my private prompt', 'unclassified'],
    ['{"type":"prose with spaces in it"}', 'unclassified'],
    ['', 'unclassified'],
    [undefined, 'unclassified'],
  ])('reads %p as %p', (text, expected) => {
    expect(toErrorCode(text)).toBe(expected);
  });
});
