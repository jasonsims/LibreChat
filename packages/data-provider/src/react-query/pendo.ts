/**
 * FORK: Pendo Track Events sent from shared React Query hooks (see FORK.md). The app's own
 * events go through `client/src/lib/pendo.ts`; this package cannot import from the app, so the
 * hooks here use this copy. A no-op unless the page has loaded the Pendo agent.
 */

type PendoEvent = 'tool_credentials_updated' | 'endpoint_api_key_saved';
type PendoProperties = Record<string, string | number | boolean | undefined>;

type PendoAgent = {
  track: (event: string, properties?: PendoProperties) => void;
};

const isPendoAgent = (value: unknown): value is PendoAgent =>
  typeof value === 'object' &&
  value !== null &&
  'track' in value &&
  typeof value.track === 'function';

function track(event: PendoEvent, properties: PendoProperties): void {
  const agent: unknown = typeof window === 'undefined' ? undefined : Reflect.get(window, 'pendo');
  if (!isPendoAgent(agent)) {
    return;
  }
  try {
    agent.track(event, properties);
  } catch {
    /* Analytics must not fail the mutation it records. */
  }
}

export const pendo = { track };
