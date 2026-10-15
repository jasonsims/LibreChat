import type { TUser, TUserTermsResponse } from 'librechat-data-provider';

/** Fields `GET /api/user` returns (`PUBLIC_USER_RESPONSE_FIELDS`) that the client `TUser` omits. */
type PendoUser = TUser & { emailVerified?: boolean; termsAccepted?: boolean };

/** Routes that receive a `token` from an emailed invite, verification or password-reset link. */
const TOKEN_ROUTE = /\/(?:register|verify|reset-password)\/?$/;

/**
 * Pendo `ExcludeKeys` data: the credential parameters to drop from a recorded URL's query string.
 * `tempToken` (the 2FA step's bearer token) is dropped everywhere; `token` is a generic name, so
 * only on the routes that receive it. Pendo records the untransformed URL if this throws, so it
 * only reads, and drops both when there is no pathname to match.
 */
export function credentialParams(_search: string, url?: URL): string[] {
  const path = url?.pathname;
  if (path == null || TOKEN_ROUTE.test(path)) {
    return ['tempToken', 'token'];
  }
  return ['tempToken'];
}

function toIsoString(value: Date | string | null | undefined): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? undefined;
}

/**
 * Maps the signed-in user onto Pendo's visitor and, for a multi-tenant deployment, its account.
 * `terms` is the `GET /api/user/terms` status, which the app only loads when the terms modal is on.
 */
export function buildPendoIdentity(user: PendoUser, terms?: TUserTermsResponse): Pendo.Identity {
  const visitor: Pendo.Metadata = {
    id: user.id,
    email: user.email,
    full_name: user.name,
    username: user.username,
    role: user.role,
    provider: user.provider,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    termsAccepted: terms?.termsAccepted ?? user.termsAccepted,
    termsAcceptedAt: toIsoString(terms?.termsAcceptedAt),
    createdAt: user.createdAt,
    tenantId: user.tenantId,
    plugins: user.plugins,
    memories: user.personalization?.memories,
    statefulCodeEnvironment: user.personalization?.statefulCodeEnvironment,
  };
  if (!user.tenantId) {
    return { visitor };
  }
  return { visitor, account: { id: user.tenantId } };
}

/** Boots the agent anonymously, once per page; it restores a returning visitor from its storage. */
export function initializePendo(): void {
  const { pendo } = window;
  if (!pendo) {
    return;
  }
  pendo.initialize({
    visitor: { id: '' },
    location: { transforms: [{ attr: 'search', action: 'ExcludeKeys', data: credentialParams }] },
  });
}

export function identifyPendo(user: PendoUser, terms?: TUserTermsResponse): void {
  const { pendo } = window;
  if (!pendo) {
    return;
  }
  pendo.identify(buildPendoIdentity(user, terms));
}

/** Starts a fresh anonymous visitor so the next sign-in is not tracked as the departing user. */
export function clearPendoSession(): void {
  const { pendo } = window;
  if (!pendo?.clearSession) {
    return;
  }
  pendo.clearSession();
}
