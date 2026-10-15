/** Metadata the agent records on a visitor or an account. */
export type PendoMetadata = Record<string, string | number | boolean | string[]>;

export interface PendoIdentity {
  visitor: PendoMetadata & { id: string };
  account?: PendoMetadata & { id: string };
}

/**
 * A Location API transform. Each `attr` accepts only some actions and the agent throws inside
 * `initialize` on any other pair, which would leave it uninitialized, so only the pair used here
 * is typed.
 */
interface PendoTransform {
  attr: 'search';
  action: 'ExcludeKeys';
  data: (search: string, url?: { pathname?: unknown }) => string[];
}

interface PendoAgent {
  initialize: (options: {
    visitor: { id: string };
    location: { transforms: PendoTransform[] };
  }) => void;
  identify: (identity: PendoIdentity) => void;
  /** The install snippet stubs `initialize` and `identify` only; this exists once the agent loads. */
  clearSession?: () => void;
}

declare global {
  interface Window {
    /** Defined by the install snippet in `index.html`, so absent wherever that script never ran. */
    pendo?: PendoAgent;
  }
}

/** Routes reached from an emailed or invite link that carries a one-time `token`. */
const TOKEN_ROUTE = /\/(?:verify|reset-password|register)\/?$/i;

/**
 * Query keys kept out of the URLs the agent records. `tempToken` is the sign-in JWT that
 * `/login/2fa` carries between the password and code steps, a name no other parameter uses, so it
 * is dropped everywhere. `token` is generic, so it is dropped only on the routes that receive one.
 * The agent applies this to every recorded URL and falls back to the untransformed URL if it
 * throws, so nothing about its arguments is trusted.
 */
export function credentialParams(_search: string, url?: { pathname?: unknown }): string[] {
  const pathname = typeof url?.pathname === 'string' ? url.pathname : '';
  return TOKEN_ROUTE.test(pathname) ? ['tempToken', 'token'] : ['tempToken'];
}

/** The agent is third-party code: nothing it throws may reach the app. */
function withAgent(call: (agent: PendoAgent) => void): void {
  const agent = window.pendo;
  if (agent == null) {
    return;
  }
  try {
    call(agent);
  } catch {
    /* Analytics must never affect the app. */
  }
}

/** Boots the agent once, as an anonymous visitor: the empty id lets it resume a visitor it stored. */
export function initializePendo(): void {
  withAgent((agent) =>
    agent.initialize({
      visitor: { id: '' },
      location: { transforms: [{ attr: 'search', action: 'ExcludeKeys', data: credentialParams }] },
    }),
  );
}

/** The identity last sent to the agent, so an unchanged user is not sent again on every render. */
let identified: { visitorId: string; key: string } | undefined;
/**
 * The visitor whose sign-out is in flight. The auth state keeps reporting them until the sign-out
 * request returns, and identifying them again in that window would undo `clearPendoSession`.
 */
let departingVisitorId: string | undefined;

/** Identifies the signed-in user to the agent, or records that nobody is signed in. */
export function syncPendoIdentity(identity: PendoIdentity | undefined): void {
  if (identity == null) {
    identified = undefined;
    departingVisitorId = undefined;
    return;
  }
  const visitorId = identity.visitor.id;
  if (visitorId === departingVisitorId) {
    return;
  }
  const key = JSON.stringify(identity);
  if (key === identified?.key) {
    return;
  }
  identified = { visitorId, key };
  withAgent((agent) => agent.identify(identity));
}

/** Starts a new anonymous visitor so whoever signs in next is not tracked as the user leaving. */
export function clearPendoSession(): void {
  departingVisitorId = identified?.visitorId;
  identified = undefined;
  withAgent((agent) => agent.clearSession?.());
}
