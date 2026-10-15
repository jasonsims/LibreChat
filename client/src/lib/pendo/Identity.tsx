import { useEffect, useMemo, useRef } from 'react';
import { useGetStartupConfig, useUserTermsQuery } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { buildIdentity } from './metadata';
import { identifyPendo } from './agent';

/**
 * Identifies the signed-in user to Pendo as soon as the session is known (a password, passkey or
 * 2FA sign-in, or a restored session) and again whenever their metadata changes. Signing out is
 * handled by `logout` in `AuthContext`, which clears the Pendo session. Renders nothing.
 */
export default function PendoIdentity(): null {
  const { user, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  /** Shares the terms modal's query (`Root`), so it adds no request and runs only where terms
   * acceptance is on: accepting in that modal is the only flow that sets `termsAcceptedAt`. */
  const { data: terms } = useUserTermsQuery({
    enabled: isAuthenticated && startupConfig?.interface?.termsOfService?.modalAcceptance === true,
  });
  const identity = useMemo(
    () => (isAuthenticated && user?.id ? buildIdentity(user, terms) : undefined),
    [isAuthenticated, user, terms],
  );
  const identifiedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!identity) {
      /** Signed out: the next sign-in identifies again, even as the same user. */
      identifiedRef.current = undefined;
      return;
    }
    const key = JSON.stringify(identity);
    if (key === identifiedRef.current) {
      return;
    }
    identifiedRef.current = key;
    identifyPendo(identity);
  }, [identity]);

  return null;
}
