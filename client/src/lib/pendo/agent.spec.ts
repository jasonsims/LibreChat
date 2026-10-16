import { clearPendoSession, credentialParams, identifyPendo, initializePendo } from './agent';

const at = (href: string) => new URL(href, 'https://chat.example.com');

describe('credentialParams', () => {
  it('drops the 2FA hand-off token on its own route only', () => {
    expect(credentialParams('?tempToken=abc', at('/login/2fa?tempToken=abc'))).toEqual([
      'tempToken',
    ]);
    expect(credentialParams('', at('/login/2fa/setup'))).toEqual([]);
    expect(credentialParams('?tempToken=abc', at('/c/new?tempToken=abc'))).toEqual([]);
  });

  it('drops the link token on the reset, verification and invite routes', () => {
    for (const path of ['/reset-password', '/verify', '/register']) {
      expect(credentialParams('?token=abc', at(`${path}?token=abc`))).toEqual(['token']);
    }
  });

  it('keeps a parameter named token on every other route', () => {
    expect(credentialParams('?token=abc', at('/c/new?token=abc'))).toEqual([]);
    expect(credentialParams('?token=abc', at('/search?token=abc'))).toEqual([]);
  });

  it('matches the routes under a DOMAIN_CLIENT subpath', () => {
    expect(credentialParams('', at('/librechat/reset-password/'))).toEqual(['token']);
    expect(credentialParams('', at('/librechat/login/2fa'))).toEqual(['tempToken']);
  });

  it('does not throw on a URL without a pathname', () => {
    expect(credentialParams('', {} as URL)).toEqual([]);
  });
});

describe('agent calls', () => {
  afterEach(() => {
    window.pendo = undefined;
  });

  it('does nothing when the snippet has not run', () => {
    expect(() => {
      initializePendo();
      identifyPendo({ visitor: { id: 'user-1' } });
      clearPendoSession();
    }).not.toThrow();
  });

  it('initializes an anonymous visitor with the credential transform', () => {
    const initialize = jest.fn();
    window.pendo = { initialize, identify: jest.fn() };

    initializePendo();

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledWith({
      visitor: { id: '' },
      location: { transforms: [{ attr: 'search', action: 'ExcludeKeys', data: credentialParams }] },
    });
  });

  it('passes the identity through to identify', () => {
    const identify = jest.fn();
    window.pendo = { initialize: jest.fn(), identify };

    identifyPendo({ visitor: { id: 'user-1' }, account: { id: 'tenant-1' } });

    expect(identify).toHaveBeenCalledWith({
      visitor: { id: 'user-1' },
      account: { id: 'tenant-1' },
    });
  });

  it('clears the session only once the agent script has loaded', () => {
    window.pendo = { initialize: jest.fn(), identify: jest.fn() };
    expect(() => clearPendoSession()).not.toThrow();

    const clearSession = jest.fn();
    window.pendo.clearSession = clearSession;
    clearPendoSession();

    expect(clearSession).toHaveBeenCalledTimes(1);
  });
});
