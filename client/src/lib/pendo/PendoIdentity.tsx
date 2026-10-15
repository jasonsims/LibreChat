import { useEffect } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import { useUserTermsQuery } from '~/data-provider';
import { buildPendoIdentity } from './metadata';
import { syncPendoIdentity } from './agent';

/**
 * Keeps the agent's visitor in step with the signed-in user, from whichever path signed them in.
 * The terms query is read without being fetched: the app requests it only where users must accept
 * terms (`interface.termsOfService.modalAcceptance`), so this adds no request of its own.
 */
export default function PendoIdentity() {
  const { user, isAuthenticated } = useAuthContext();
  const { data: terms } = useUserTermsQuery({ enabled: false });

  useEffect(() => {
    syncPendoIdentity(isAuthenticated && user ? buildPendoIdentity(user, terms) : undefined);
  }, [isAuthenticated, user, terms]);

  return null;
}
