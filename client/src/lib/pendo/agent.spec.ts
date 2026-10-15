import type { PendoIdentity } from './agent';
import { initializePendo, credentialParams, syncPendoIdentity, clearPendoSession } from './agent';

const agent = {
  initialize: jest.fn(),
  identify: jest.fn(),
  clearSession: jest.fn(),
};

function identity(id: string, role = 'USER'): PendoIdentity {
  return { visitor: { id, role } };
}

function pathParams(path: string): string[] {
  return credentialParams('', new URL(path, 'http://localhost:3080'));
}

describe('credentialParams', () => {
  it('drops the 2FA sign-in token from every URL', () => {
    expect(pathParams('/login/2fa?tempToken=abc')).toEqual(['tempToken']);
    expect(pathParams('/c/new')).toEqual(['tempToken']);
  });

  it('drops `token` only on the routes that receive one from an emailed or invite link', () => {
    for (const path of ['/verify', '/reset-password', '/register', '/chat/Reset-Password/']) {
      expect(pathParams(`${path}?token=abc`)).toEqual(['tempToken', 'token']);
    }
    for (const path of ['/c/new', '/share/verify-me', '/register/extra', '/search']) {
      expect(pathParams(`${path}?token=abc`)).toEqual(['tempToken']);
    }
  });

  it('never throws on arguments it does not expect', () => {
    expect(credentialParams('')).toEqual(['tempToken']);
    expect(credentialParams('', {})).toEqual(['tempToken']);
    expect(credentialParams('', { pathname: 42 })).toEqual(['tempToken']);
  });
});

describe('Pendo agent calls', () => {
  beforeEach(() => {
    syncPendoIdentity(undefined);
    window.pendo = agent;
  });

  afterEach(() => {
    delete window.pendo;
  });

  it('initializes an anonymous visitor with the credential transform', () => {
    initializePendo();

    expect(agent.initialize).toHaveBeenCalledWith({
      visitor: { id: '' },
      location: {
        transforms: [{ attr: 'search', action: 'ExcludeKeys', data: credentialParams }],
      },
    });
  });

  it('does nothing when the install snippet never ran', () => {
    delete window.pendo;

    expect(() => {
      initializePendo();
      syncPendoIdentity(identity('a'));
      clearPendoSession();
    }).not.toThrow();
  });

  it('keeps agent errors away from the app', () => {
    agent.initialize.mockImplementationOnce(() => {
      throw new Error('agent failure');
    });

    expect(() => initializePendo()).not.toThrow();
  });

  it('identifies again only when the identity changes', () => {
    syncPendoIdentity(identity('a'));
    syncPendoIdentity(identity('a'));
    syncPendoIdentity(identity('a', 'ADMIN'));

    expect(agent.identify).toHaveBeenCalledTimes(2);
    expect(agent.identify).toHaveBeenLastCalledWith(identity('a', 'ADMIN'));
  });

  it('clears the session, even before the agent has replaced the snippet stub', () => {
    clearPendoSession();
    expect(agent.clearSession).toHaveBeenCalledTimes(1);

    window.pendo = { initialize: jest.fn(), identify: jest.fn() };
    expect(() => clearPendoSession()).not.toThrow();
  });

  it('does not re-identify the departing user before the sign-out lands', () => {
    syncPendoIdentity(identity('a'));
    clearPendoSession();
    syncPendoIdentity(identity('a', 'ADMIN'));
    expect(agent.identify).toHaveBeenCalledTimes(1);

    syncPendoIdentity(undefined);
    syncPendoIdentity(identity('a'));
    expect(agent.identify).toHaveBeenCalledTimes(2);
  });

  it('identifies a different user right after a sign-out', () => {
    syncPendoIdentity(identity('a'));
    clearPendoSession();
    syncPendoIdentity(identity('b'));

    expect(agent.identify).toHaveBeenLastCalledWith(identity('b'));
  });
});
