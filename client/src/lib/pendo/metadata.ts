import type { TUser, TUserTermsResponse } from 'librechat-data-provider';
import type { PendoIdentity, PendoMetadata } from './agent';

/** Fields the public user response carries (`PUBLIC_USER_RESPONSE_FIELDS`) that `TUser` omits. */
type TIdentityUser = TUser & { emailVerified?: boolean; termsAccepted?: boolean };

/** Leaves out fields without a value rather than recording them as empty. */
function definedFields(
  fields: Record<string, PendoMetadata[string] | null | undefined>,
): PendoMetadata {
  const metadata: PendoMetadata = {};
  for (const [name, value] of Object.entries(fields)) {
    if (value != null) {
      metadata[name] = value;
    }
  }
  return metadata;
}

/** Time fields go to the agent as ISO 8601; an invalid date is left out rather than thrown on. */
function isoTime(value: Date | string | null | undefined): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  return value ?? undefined;
}

/**
 * The `identify` payload for a signed-in user. The account is the tenant, so only multi-tenant
 * deployments, where users carry a `tenantId`, send one. `terms` is `GET /api/user/terms` when the
 * app has fetched it: the only source of `termsAcceptedAt`, and its `termsAccepted` stays current
 * after the user accepts in this session, while the user payload's does not.
 */
export function buildPendoIdentity(user: TIdentityUser, terms?: TUserTermsResponse): PendoIdentity {
  const visitor = {
    ...definedFields({
      email: user.email,
      full_name: user.name,
      username: user.username,
      role: user.role,
      provider: user.provider,
      tenantId: user.tenantId,
      createdAt: user.createdAt,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      termsAccepted: terms?.termsAccepted ?? user.termsAccepted,
      termsAcceptedAt: isoTime(terms?.termsAcceptedAt),
      memories: user.personalization?.memories,
      statefulCodeEnvironment: user.personalization?.statefulCodeEnvironment,
      plugins: user.plugins,
    }),
    id: user.id,
  };
  return user.tenantId ? { visitor, account: { id: user.tenantId } } : { visitor };
}
