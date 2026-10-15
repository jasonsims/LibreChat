/** Visitor or account metadata. Dates travel as ISO 8601 strings. */
export type PendoMetadata = {
  id: string;
  [field: string]: string | number | boolean | string[] | undefined;
};

export type PendoIdentity = {
  visitor: PendoMetadata;
  account?: PendoMetadata;
};

/**
 * A Location API transform: it rewrites the URL the agent records, never the browser's. Only the
 * attribute/action pair in use is typed, because an invalid pair throws inside `initialize` and
 * the agent then never starts.
 */
type PendoUrlTransform = {
  attr: 'search';
  action: 'ExcludeKeys';
  data: (search: string, url: URL) => string[];
};

type PendoInitializeOptions = PendoIdentity & {
  location?: { transforms: PendoUrlTransform[] };
};

type PendoAgent = {
  initialize: (options: PendoInitializeOptions) => void;
  identify: (identity: PendoIdentity) => void;
  /** Not stubbed by the snippet: it exists only once the agent script itself has loaded. */
  clearSession?: () => void;
};

declare global {
  interface Window {
    /** Defined by the install snippet in `index.html`, so absent wherever that does not load. */
    pendo?: PendoAgent;
  }
}

/**
 * Query parameters that carry a credential, keyed by the route that reads them. The agent runs a
 * transform on every URL it records, so a generic name like `token` is dropped only on its own
 * route. The patterns are end-anchored so they still match under a `DOMAIN_CLIENT` subpath.
 */
const CREDENTIAL_PARAMS: ReadonlyArray<{ route: RegExp; keys: string[] }> = [
  /** The 2FA hand-off: `AuthContext` and `usePasskey` navigate here, `TwoFactorScreen` reads it. */
  { route: /\/login\/2fa\/?$/, keys: ['tempToken'] },
  /** Reset, verification and invite links (`ResetPassword`, `VerifyEmail`, `Registration`). */
  { route: /\/(?:reset-password|verify|register)\/?$/, keys: ['token'] },
];

/**
 * `ExcludeKeys` data for the `search` transform: the credential parameters of this URL's route.
 * It must never throw, because the agent then falls back to recording the untransformed URL.
 */
export function credentialParams(_search: string, url: URL): string[] {
  const pathname = typeof url?.pathname === 'string' ? url.pathname : '';
  return CREDENTIAL_PARAMS.find(({ route }) => route.test(pathname))?.keys ?? [];
}

/**
 * Starts the agent with an anonymous visitor, which it resolves to the returning visitor when it
 * has one stored. Call once per page load, before the app renders: later calls are ignored.
 */
export function initializePendo(): void {
  if (!window.pendo) {
    return;
  }
  window.pendo.initialize({
    visitor: { id: '' },
    location: { transforms: [{ attr: 'search', action: 'ExcludeKeys', data: credentialParams }] },
  });
}

export function identifyPendo(identity: PendoIdentity): void {
  if (!window.pendo) {
    return;
  }
  window.pendo.identify(identity);
}

/** Starts a fresh anonymous visitor, so whoever signs in next is not recorded as this user. */
export function clearPendoSession(): void {
  if (typeof window.pendo?.clearSession !== 'function') {
    return;
  }
  window.pendo.clearSession();
}
