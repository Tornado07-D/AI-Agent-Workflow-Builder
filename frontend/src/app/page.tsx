'use client';

import { useAuthenticationStatus, useSignInEmailPassword, useSignOut } from '@nhost/nextjs';
import { useContext, useState, useEffect } from 'react';
import { OrgContext } from '../components/Providers';
import { WorkflowBuilder } from '../components/WorkflowBuilder';

export default function Home() {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const [isReady, setIsReady] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);

  useEffect(() => {
    // Force wait for Nhost to fully resolve local storage auth before deciding to show login
    import('../lib/nhost').then(({ nhost }) => {
      nhost.auth.isAuthenticatedAsync().then((isAuth) => {
        setAuthResolved(isAuth);
        setIsReady(true);
      }).catch(() => {
        setIsReady(true);
      });
    });
  }, []);
  
  // Wait until both React is mounted AND Nhost has explicitly resolved its async auth check
  if (!isReady || isLoading) return <div className="p-8 text-center text-slate-400">Loading auth state...</div>;
  
  if (!isAuthenticated && !authResolved) return <LoginForm />;
  
  return <Dashboard />;
}

function LoginForm() {
  const { signInEmailPassword, isLoading } = useSignInEmailPassword();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const handleLogin = async (e: any) => {
    e.preventDefault();
    setError('');
    const result = await signInEmailPassword(email, password);
    if (result.isError) {
      setError(result.error?.message || 'Sign in failed. Check your credentials.');
    }
  };
  
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-slate-950">
      <div className="bg-slate-900 p-8 rounded-xl w-full max-w-sm border border-slate-800 shadow-sm relative z-10">
        <div className="flex justify-center mb-6">
          <div className="w-10 h-10 rounded-md bg-white text-slate-950 flex items-center justify-center font-bold text-xl">
            A
          </div>
        </div>
        <h1 className="text-xl font-semibold mb-6 text-center text-slate-100 tracking-tight">
          Sign in to AgentBuilder
        </h1>
        
        {error && (
          <div className="mb-6 p-3 bg-red-950/50 border border-red-900 rounded-md text-red-400 text-sm font-medium">
            {error}
          </div>
        )}
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
            <input 
              type="email" placeholder="ownerA@orga.com" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md p-2.5 text-sm text-slate-200 placeholder-slate-500 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
            <input 
              type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md p-2.5 text-sm text-slate-200 placeholder-slate-500 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none transition-colors"
            />
          </div>
          <button disabled={isLoading} className="w-full mt-2 bg-white hover:bg-slate-200 active:bg-slate-300 active:scale-95 text-slate-900 font-medium text-sm rounded-md p-2.5 transition-all transform">
            {isLoading ? 'Signing in...' : 'Continue'}
          </button>
        </form>
        
        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500 mb-3">Demo Accounts (Password: <span className="font-mono text-slate-300">password123</span>)</p>
          <div className="flex justify-center gap-3">
            <span className="text-xs bg-slate-950 px-2.5 py-1.5 rounded-md text-slate-400 border border-slate-800 font-medium">ownerA@orga.com</span>
            <span className="text-xs bg-slate-950 px-2.5 py-1.5 rounded-md text-slate-400 border border-slate-800 font-medium">viewerA@orga.com</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { signOut } = useSignOut();
  const { currentOrg, setCurrentOrg, myOrgs } = useContext(OrgContext);
  
  if (!currentOrg) return <div className="p-8 text-center">Loading org...</div>;
  
  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <header className="bg-slate-950 border-b border-slate-800 p-4 px-6 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-white text-slate-950 flex items-center justify-center font-bold text-sm">
              A
            </div>
            <h1 className="font-semibold text-sm text-slate-200 tracking-tight">AgentBuilder</h1>
          </div>
          <div className="h-4 w-px bg-slate-800 mx-1"></div>
          <select 
            value={currentOrg.id} 
            onChange={(e) => {
              const selected = myOrgs.find((o: any) => o.organization.id === e.target.value);
              setCurrentOrg({ id: selected.organization.id, name: selected.organization.name, role: selected.role });
            }}
            className="bg-transparent text-sm text-slate-300 hover:text-slate-100 focus:outline-none cursor-pointer"
          >
            {myOrgs?.map((org: any) => (
              <option key={org.organization.id} value={org.organization.id} className="bg-slate-900">
                {org.organization.name} ({org.role})
              </option>
            ))}
          </select>
        </div>
        <button onClick={() => signOut()} className="text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors">Sign out</button>
      </header>
      <main className="flex-1 p-6 overflow-auto">
        <WorkflowBuilder org={currentOrg} />
      </main>
    </div>
  );
}
