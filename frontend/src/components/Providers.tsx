'use client';

import { NhostProvider } from '@nhost/nextjs';
import { NhostApolloProvider } from '@nhost/react-apollo';
import { nhost } from '../lib/nhost';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useUserData } from '@nhost/nextjs';
import { gql, useQuery } from '@apollo/client';

export const OrgContext = createContext<any>(null);

const GET_MY_ORGS = gql`
  query GetMyOrgs {
    org_members {
      user_id
      role
      organization {
        id
        name
      }
    }
  }
`;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NhostProvider nhost={nhost}>
      <NhostApolloProvider nhost={nhost}>
        <OrgProviderWrapper>
          {children}
        </OrgProviderWrapper>
      </NhostApolloProvider>
    </NhostProvider>
  );
}

function OrgProviderWrapper({ children }: { children: React.ReactNode }) {
  const user = useUserData();
  const { data } = useQuery(GET_MY_ORGS, { 
    skip: !user,
    errorPolicy: 'ignore'
  });
  
  const [currentOrg, setCurrentOrg] = useState<any>(null);

  // Deduplicate: Hasura row-level perms may return all members of a user's org.
  // Keep only the current user's own membership per org.
  const myOrgs = React.useMemo(() => {
    if (!data?.org_members || !user) return [];
    const seen = new Map<string, any>();
    for (const m of data.org_members) {
      const orgId = m.organization.id;
      // If we haven't seen this org yet, or this row belongs to us, prefer it
      if (!seen.has(orgId) || m.user_id === user.id) {
        seen.set(orgId, m);
      }
    }
    return Array.from(seen.values());
  }, [data, user]);

  useEffect(() => {
    if (myOrgs.length > 0 && !currentOrg) {
      const member = myOrgs[0];
      setCurrentOrg({
        id: member.organization.id,
        name: member.organization.name,
        role: member.role
      });
    }
  }, [myOrgs, currentOrg]);

  return (
    <OrgContext.Provider value={{ currentOrg, setCurrentOrg, myOrgs }}>
      {children}
    </OrgContext.Provider>
  );
}
