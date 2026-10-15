import { QueryKeys } from 'librechat-data-provider';
import { act, waitFor, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TUser, TUserTermsResponse } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { initializePendo, credentialParams, clearPendoSession, buildPendoIdentity } from '../agent';
import usePendoIdentity from '../useIdentity';

const user: TUser = {
  id: '665f1c2ab9e4d3f7a1b2c3d4',
  username: 'user_12345',
  email: 'visitor_12345@example.com',
  name: 'Sample User',
  avatar: '',
  role: 'USER',
  provider: 'local',
  plugins: ['dalle', 'calculator'],
  twoFactorEnabled: false,
  personalization: { memories: true, statefulCodeEnvironment: 'user' },
  createdAt: '2025-01-15T10:30:00.000Z',
  updatedAt: '2025-01-15T10:30:00.000Z',
};

const terms: TUserTermsResponse = {
  termsAccepted: true,
  termsAcceptedAt: '2025-03-02T14:05:00.000Z',
};

afterEach(() => {
  window.pendo = undefined;
});

describe('credentialParams', () => {
  it.each([
    ['/login/2fa', ['tempToken']],
    ['/c/new', ['tempToken']],
    ['/register', ['tempToken', 'token']],
    ['/verify', ['tempToken', 'token']],
    ['/reset-password/', ['tempToken', 'token']],
    ['/chat/verify', ['tempToken', 'token']],
  ])('drops the credential keys recorded on %s', (path, keys) => {
    expect(credentialParams('?token=a&tempToken=b', new URL(path, 'https://chat.test'))).toEqual(
      keys,
    );
  });

  it('drops every credential key when there is no URL to match', () => {
    expect(credentialParams('?token=a')).toEqual(['tempToken', 'token']);
  });
});

describe('buildPendoIdentity', () => {
  it('maps the user onto the visitor and omits the account without a tenant', () => {
    expect(buildPendoIdentity({ ...user, emailVerified: true, termsAccepted: false })).toEqual({
      visitor: {
        id: user.id,
        email: user.email,
        full_name: user.name,
        username: user.username,
        role: 'USER',
        provider: 'local',
        emailVerified: true,
        twoFactorEnabled: false,
        termsAccepted: false,
        createdAt: user.createdAt,
        plugins: ['dalle', 'calculator'],
        memories: true,
        statefulCodeEnvironment: 'user',
      },
    });
  });

  it('prefers the loaded terms status and keys the account on the tenant', () => {
    const identity = buildPendoIdentity(
      { ...user, tenantId: 'tenant_acme', termsAccepted: false },
      { termsAccepted: true, termsAcceptedAt: new Date('2025-03-02T14:05:00.000Z') },
    );
    expect(identity.visitor).toMatchObject({
      termsAccepted: true,
      termsAcceptedAt: '2025-03-02T14:05:00.000Z',
      tenantId: 'tenant_acme',
    });
    expect(identity.account).toEqual({ id: 'tenant_acme' });
  });
});

describe('agent calls', () => {
  it('does nothing when the snippet has not defined the agent', () => {
    expect(() => {
      initializePendo();
      clearPendoSession();
    }).not.toThrow();
  });

  it('initializes anonymously with the credential transform', () => {
    const agent = { initialize: jest.fn(), identify: jest.fn() };
    window.pendo = agent;

    initializePendo();

    expect(agent.initialize).toHaveBeenCalledTimes(1);
    expect(agent.initialize).toHaveBeenCalledWith({
      visitor: { id: '' },
      location: { transforms: [{ attr: 'search', action: 'ExcludeKeys', data: credentialParams }] },
    });
  });

  it('clears the session only once the agent script has loaded', () => {
    window.pendo = { initialize: jest.fn(), identify: jest.fn() };
    expect(() => clearPendoSession()).not.toThrow();

    const clearSession = jest.fn();
    window.pendo = { initialize: jest.fn(), identify: jest.fn(), clearSession };
    clearPendoSession();

    expect(clearSession).toHaveBeenCalledTimes(1);
  });
});

describe('usePendoIdentity', () => {
  it('identifies the signed-in user and picks up cached terms without fetching them', async () => {
    const identify = jest.fn();
    window.pendo = { initialize: jest.fn(), identify };
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { rerender } = renderHook(
      ({ current }: { current?: TUser }) => usePendoIdentity(current),
      { wrapper, initialProps: {} },
    );
    expect(identify).not.toHaveBeenCalled();

    rerender({ current: user });
    expect(identify).toHaveBeenLastCalledWith(buildPendoIdentity(user));
    expect(queryClient.getQueryState([QueryKeys.userTerms])?.fetchStatus).toBe('idle');

    act(() => {
      queryClient.setQueryData([QueryKeys.userTerms], terms);
    });
    /** React Query notifies observers on a later tick. */
    await waitFor(() => expect(identify).toHaveBeenLastCalledWith(buildPendoIdentity(user, terms)));
  });
});
