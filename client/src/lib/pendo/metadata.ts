import type { TUser, TUserTermsResponse } from 'librechat-data-provider';
import type { PendoIdentity, PendoMetadata } from './agent';

/** Reads a boolean the user response carries (`PUBLIC_USER_RESPONSE_FIELDS`) but `TUser` omits. */
function readFlag(user: TUser, field: 'emailVerified' | 'termsAccepted'): boolean | undefined {
  const fields: Record<string, unknown> = user;
  const value = fields[field];
  return typeof value === 'boolean' ? value : undefined;
}

function toIsoString(value: Date | string | null | undefined): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? undefined;
}

/**
 * Maps the signed-in user to Pendo visitor metadata, plus an account when the user belongs to a
 * tenant; single-tenant deployments have none. `terms` is the `GET /api/user/terms` response,
 * the only source of `termsAcceptedAt` and the one that stays current once the modal is accepted.
 */
export function buildIdentity(user: TUser, terms?: TUserTermsResponse): PendoIdentity {
  const visitor: PendoMetadata = {
    id: user.id,
    email: user.email,
    full_name: user.name,
    username: user.username,
    role: user.role,
    provider: user.provider,
    emailVerified: readFlag(user, 'emailVerified'),
    twoFactorEnabled: user.twoFactorEnabled,
    termsAccepted: terms?.termsAccepted ?? readFlag(user, 'termsAccepted'),
    termsAcceptedAt: toIsoString(terms?.termsAcceptedAt),
    createdAt: user.createdAt,
    tenantId: user.tenantId,
    plugins: user.plugins,
    personalizationMemories: user.personalization?.memories,
    statefulCodeEnvironment: user.personalization?.statefulCodeEnvironment,
  };

  if (!user.tenantId) {
    return { visitor };
  }

  return { visitor, account: { id: user.tenantId } };
}
