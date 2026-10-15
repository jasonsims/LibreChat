import type { TUser } from 'librechat-data-provider';
import { buildIdentity } from './metadata';

const user: TUser = {
  id: '6650f1c2a9b3e4d5f6a7b8c9',
  username: 'user_12345',
  email: 'user_12345@example.com',
  name: 'Test User',
  avatar: '',
  role: 'USER',
  provider: 'local',
  tenantId: 'tenant_12345',
  plugins: ['google', 'dalle', 'calculator'],
  twoFactorEnabled: false,
  personalization: { memories: true, statefulCodeEnvironment: 'user' },
  createdAt: '2026-01-10T08:00:00.000Z',
  updatedAt: '2026-01-12T08:00:00.000Z',
};

describe('buildIdentity', () => {
  it('maps every visitor field and links the tenant as the account', () => {
    /** The user response also carries these, though `TUser` does not declare them. */
    const response = { ...user, emailVerified: true, termsAccepted: false };

    expect(buildIdentity(response)).toEqual({
      visitor: {
        id: '6650f1c2a9b3e4d5f6a7b8c9',
        email: 'user_12345@example.com',
        full_name: 'Test User',
        username: 'user_12345',
        role: 'USER',
        provider: 'local',
        emailVerified: true,
        twoFactorEnabled: false,
        termsAccepted: false,
        createdAt: '2026-01-10T08:00:00.000Z',
        tenantId: 'tenant_12345',
        plugins: ['google', 'dalle', 'calculator'],
        personalizationMemories: true,
        statefulCodeEnvironment: 'user',
      },
      account: { id: 'tenant_12345' },
    });
  });

  it('omits the account when the user has no tenant', () => {
    const identity = buildIdentity({ ...user, tenantId: undefined });

    expect(identity).not.toHaveProperty('account');
    expect(identity.visitor.id).toBe('6650f1c2a9b3e4d5f6a7b8c9');
  });

  it('takes terms acceptance from the terms response when it has one', () => {
    const response = { ...user, termsAccepted: false };
    const { visitor } = buildIdentity(response, {
      termsAccepted: true,
      termsAcceptedAt: '2026-01-15T10:30:00.000Z',
    });

    expect(visitor.termsAccepted).toBe(true);
    expect(visitor.termsAcceptedAt).toBe('2026-01-15T10:30:00.000Z');
  });

  it('sends a Date acceptance time as an ISO 8601 string', () => {
    const { visitor } = buildIdentity(user, {
      termsAccepted: true,
      termsAcceptedAt: new Date('2026-01-15T10:30:00.000Z'),
    });

    expect(visitor.termsAcceptedAt).toBe('2026-01-15T10:30:00.000Z');
  });

  it('ignores an undeclared response field of the wrong type', () => {
    const response = { ...user, emailVerified: 'yes' };

    expect(buildIdentity(response).visitor.emailVerified).toBeUndefined();
  });
});
