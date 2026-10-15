/**
 * FORK: the Novus by Pendo agent that the install snippet in `client/index.html` defines as
 * `window.pendo`. The snippet stubs `initialize` and `identify` and queues their calls until the
 * agent script loads. Only the calls this app makes are typed.
 */
declare namespace Pendo {
  /** Pendo stores strings, numbers, booleans, ISO-8601 dates and lists; unset fields are omitted. */
  type MetadataValue = string | number | boolean | string[] | undefined;

  interface Metadata {
    id: string;
    [field: string]: MetadataValue;
  }

  interface Identity {
    visitor: Metadata;
    account?: Metadata;
  }

  /**
   * A Location API rule. Only the pair this app registers is typed: an invalid attr/action pair
   * throws inside `initialize`, which then never boots, so check the agent's table before widening.
   */
  interface LocationTransform {
    attr: 'search';
    action: 'ExcludeKeys';
    /** Receives the query string and the URL being recorded; returns the keys to drop. */
    data: (search: string, url?: URL) => string[];
  }

  interface InitializeOptions extends Identity {
    location?: { transforms: LocationTransform[] };
  }

  interface Agent {
    initialize(options: InitializeOptions): void;
    identify(identity: Identity): void;
    /** Not stubbed by the snippet, so it only exists once the agent script has loaded. */
    clearSession?: () => void;
  }
}

interface Window {
  /** Read through `window` so code still runs when the snippet is absent (tests, a removed tag). */
  pendo?: Pendo.Agent;
}
