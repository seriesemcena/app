import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { api, type AdminActor } from './api';
import { sections, type Section } from './admin-model';
import { AdminLayout, ErrorBox } from './components';
import { auth, firebaseConfigured, loginEmail, loginGoogle, logout } from './firebase';
import {
  AdminsView,
  CommentsView,
  DashboardView,
  GenericResourceView,
  IntegrationsView,
  NotificationsView,
  ReportsView,
  SettingsView,
  UsersView,
} from './views';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Login indisponível.'); }
    finally { setBusy(false); }
  };
  return <main className="login-page"><section className="login-card">
    <div className="login-brand"><span>M</span><div><strong>Maratonou</strong><small>Admin</small></div></div>
    <div><span className="eyebrow">Acesso restrito</span><h1>Bem-vindo de volta</h1><p>Entre com uma conta que possua claim e cadastro administrativo ativos.</p></div>
    {!firebaseConfigured && <div className="feedback feedback-error">Configure as variáveis públicas do Firebase.</div>}
    <form onSubmit={(event) => { event.preventDefault(); void run(() => loginEmail(email.trim(), password)); }}>
      <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@maratonou.com" /></label>
      <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" /></label>
      {error && <div className="feedback feedback-error" role="alert">{error}</div>}
      <button className="button button-primary button-wide" disabled={busy || !firebaseConfigured}>{busy ? 'Validando…' : 'Entrar'}</button>
    </form>
    <div className="login-divider"><span>ou</span></div>
    <button className="button button-quiet button-wide" disabled={busy || !firebaseConfigured} onClick={() => void run(loginGoogle)}>Continuar com Google</button>
    <small className="login-footnote">Ações sensíveis exigem autenticação recente e ficam registradas na auditoria.</small>
  </section></main>;
}

function CurrentView({ section, actor, search }: { section: Section; actor: AdminActor; search: string }) {
  if (section === 'dashboard') return <DashboardView actor={actor}/>;
  if (section === 'users') return <UsersView actor={actor} search={search}/>;
  if (section === 'comments') return <CommentsView actor={actor} search={search}/>;
  if (section === 'reports') return <ReportsView actor={actor} search={search}/>;
  if (section === 'notifications') return <NotificationsView actor={actor} search={search}/>;
  if (section === 'settings') return <SettingsView actor={actor}/>;
  if (section === 'integrations') return <IntegrationsView/>;
  if (section === 'admins') return <AdminsView actor={actor} search={search}/>;
  return <GenericResourceView section={section} search={search}/>;
}

export function App() {
  const [user, setUser] = useState<User | null>(auth?.currentUser || null);
  const [authReady, setAuthReady] = useState(!auth);
  const [actor, setActor] = useState<AdminActor | null>(null);
  const [accessError, setAccessError] = useState<unknown>(null);
  const [section, setSection] = useState<Section>('dashboard');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('maratonou-admin-sidebar') === 'collapsed');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('maratonou-admin-theme') === 'light' ? 'light' : 'dark');

  useEffect(() => auth ? onAuthStateChanged(auth, (next) => { setUser(next); setActor(null); setAccessError(null); setAuthReady(true); }) : undefined, []);
  useEffect(() => {
    const lost = () => { setActor(null); setAccessError(new Error('A autorização administrativa foi encerrada. Entre novamente.')); };
    window.addEventListener('maratonou:admin-authorization-lost', lost);
    return () => window.removeEventListener('maratonou:admin-authorization-lost', lost);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('maratonou-admin-theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('maratonou-admin-sidebar', collapsed ? 'collapsed' : 'expanded'); }, [collapsed]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); document.querySelector<HTMLInputElement>('.global-search input')?.focus();
      }
    };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  }, []);
  useEffect(() => {
    if (!user) return;
    void api.request<{ actor: AdminActor }>('/v1/admin/me').then((result) => setActor(result.actor)).catch(setAccessError);
  }, [user]);
  const visible = useMemo(() => actor ? sections.filter((entry) => actor.permissions.includes('*') || actor.permissions.includes(entry.permission)) : [], [actor]);
  const current = visible.some((entry) => entry.id === section) ? section : visible[0]?.id || 'dashboard';

  if (!authReady) return <main className="center-state"><span className="spinner"/><p>Validando sessão…</p></main>;
  if (!user) return <Login/>;
  if (accessError) return <main className="center-state"><section className="login-card"><h1>Acesso negado</h1><ErrorBox error={accessError}/><button className="button button-quiet" onClick={() => void logout()}>Sair da conta</button></section></main>;
  if (!actor) return <main className="center-state"><span className="spinner"/><p>Verificando função e permissões…</p></main>;
  return <AdminLayout actor={actor} current={current} onSection={(next) => { setSection(next); setSearch(''); if (window.innerWidth < 900) setCollapsed(true); }} search={search} onSearch={setSearch} theme={theme} onTheme={() => setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark')} collapsed={collapsed} onCollapsed={() => setCollapsed((value) => !value)} onLogout={() => void logout()}>
    <CurrentView section={current} actor={actor} search={search}/>
  </AdminLayout>;
}
