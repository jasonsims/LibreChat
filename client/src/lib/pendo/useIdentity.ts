import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TUser, TUserTermsResponse } from 'librechat-data-provider';
import { identifyPendo } from './agent';

/**
 * Identifies the signed-in user to Pendo whenever their record changes. The terms status comes from
 * the query Root runs when the terms modal is enabled: this observer is disabled and never fetches.
 */
export default function usePendoIdentity(user: TUser | undefined): void {
  const { data: terms } = useQuery<TUserTermsResponse>([QueryKeys.userTerms], { enabled: false });

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    identifyPendo(user, terms);
  }, [user, terms]);
}
