import type { TUser } from 'librechat-data-provider';
import { buildPendoIdentity } from './metadata';

const user: TUser & { emailVerified: boolean; termsAccepted: boolean } = {
  id: '665f1a2b3c4d5e6f7a8b9c0d',
  username: 'sampleuser',
  email: 'user@example.com',
  name: 'Sample User',
  avatar: '',
  role: 'USER',
  provider: 'local',
  plugins: ['calculator', 'dalle'],
  twoFactorEnabled: false,
  personalization: { memories: true, statefulCodeEnvironment: 'user' },
  createdAt: '2025-01-15T10:30:00.000Z',
  updatedAt: '2025-01-16T10:30:00.000Z',
  emailVerified: true,
  termsAccepted: false,
};

describe('buildPendoIdentity', () => {
  it('maps the user to visitor metadata and leaves out the account without a tenant', () => {
    expect(buildPendoIdentity(user)).toEqual({
      visitor: {
        id: '665f1a2b3c4d5e6f7a8b9c0d',
        email: 'user@example.com',
        full_name: 'Sample User',
        username: 'sampleuser',
        role: 'USER',
        provider: 'local',
        createdAt: '2025-01-15T10:30:00.000Z',
        emailVerified: true,
        twoFactorEnabled: false,
        termsAccepted: false,
        memories: true,
        statefulCodeEnvironment: 'user',
        plugins: ['calculator', 'dalle'],
      },
    });
  });

  it('sends the tenant as the account', () => {
    const { visitor, account } = buildPendoIdentity({ ...user, tenantId: 'tenant_12345' });

    expect(visitor.tenantId).toBe('tenant_12345');
    expect(account).toEqual({ id: 'tenant_12345' });
  });

  it('prefers the terms query, which is the only source of the acceptance time', () => {
    const acceptedAt = '2025-01-15T10:35:00.000Z';

    const fromString = buildPendoIdentity(user, {
      termsAccepted: true,
      termsAcceptedAt: acceptedAt,
    });
    const fromDate = buildPendoIdentity(user, {
      termsAccepted: true,
      termsAcceptedAt: new Date(acceptedAt),
    });
    const notAccepted = buildPendoIdentity(user, { termsAccepted: false, termsAcceptedAt: null });

    expect(fromString.visitor).toMatchObject({ termsAccepted: true, termsAcceptedAt: acceptedAt });
    expect(fromDate.visitor.termsAcceptedAt).toBe(acceptedAt);
    expect(notAccepted.visitor).not.toHaveProperty('termsAcceptedAt');
  });
});
