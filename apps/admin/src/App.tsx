import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ApiError, type CursorPage } from '@maratonou/api-client';
import { api, type AdminActor, type Dashboard } from './api';
import { auth, firebaseConfigured, loginEmail, loginGoogle, logout } from './firebase';

type Section = 'dashboard' | 'users' | 'content' | 'comments' | 'reports' | 'notifications' | 'settings' | 'integrations' | 'audit' | 'admins';

const sections: Array<{ id: Section; label: string; permission: string }> = [
  { id: 'dashboard', label: 'Visão geral', permission: 'dashboard.read' },
  { id: 'users', label: 'Usuários', permission: 'users.read' },
  { id: 'content', label: 'Conteúdo', permission: 'content.read' },
  { id: 'comments', label: 'Comentários', permission: 'comments.read' },
  { id: 'reports', label: 'Denúncias', permission: 'reports.read' },
  { id: 'notifications', label: 'Notificações', permission: 'notifications.read' },
  { id: 'settings', label: 'Configurações', permission: 'settings.read' },
  { id: 'integrations', label: 'Integrações', permission: 'integrations.read' },
  { id: 'audit', label: 'Auditoria', permission: 'audit.read' },
  { id: 'admins', label: 'Administradores', permission: 'admins.read' },
];

const can = (actor: AdminActor, permission: string) => actor.permissions.includes('*') || actor.permissions.includes(permission);
const value = (item: unknown) => item == null ? '—' : typeof item === 'object' ? JSON.stringify(item) : String(item);

function ErrorBox({ error }: { error: unknown }) {
  const apiError = error instanceof ApiError ? error : null;
  return <div className="error" role="alert"><strong>Não foi possível carregar.</strong><span>{error instanceof Error ? error.message : 'Erro inesperado.'}</span>{apiError?.requestId && <small>ID: {apiError.requestId}</small>}</div>;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Login indisponível.'); }
    finally { setBusy(false); }
  };
  return <main className="login"><section className="login-card">
    <span className="eyebrow">Acesso restrito</span><h1>Maratonou Admin</h1>
    <p>Entre com sua conta administrativa. A autenticação sozinha não concede acesso sem função e cadastro administrativo ativos.</p>
    {!firebaseConfigured && <div className="error">Configure as variáveis públicas do Firebase.</div>}
    <form onSubmit={(event) => { event.preventDefault(); void run(() => loginEmail(email.trim(), password)); }}>
      <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="primary" disabled={busy || !firebaseConfigured}>{busy ? 'Validando…' : 'Entrar'}</button>
    </form>
    <button disabled={busy || !firebaseConfigured} onClick={() => void run(loginGoogle)}>Continuar com Google</button>
  </section></main>;
}

function DashboardView() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { void api.request<Dashboard>('/v1/admin/dashboard').then(setData).catch(setError); }, []);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <div className="loading">Carregando métricas reais…</div>;
  const entries = Object.entries(data.metrics || {});
  return <div className="stack"><header className="section-head"><div><h2>Visão geral</h2><p>Somente dados agregados existentes são exibidos.</p></div></header>
    <div className="metrics">{entries.length ? entries.map(([key, metric]) => <article key={key}><span>{key}</span><strong>{metric}</strong></article>) : <article><span>Métricas</span><strong>Indisponíveis</strong></article>}</div>
    {!!data.unavailable.length && <div className="notice">Ainda indisponível: {data.unavailable.join(', ')}.</div>}
    <DataList title="Atividade administrativa recente" items={data.recentAudit} />
  </div>;
}

function DataList({ title, items }: { title: string; items: Array<Record<string, unknown>> }) {
  return <section className="panel"><h3>{title}</h3>{items.length === 0 ? <p className="muted">Nenhum registro disponível.</p> : <div className="data-list">{items.map((item, index) => <article key={String(item.id || index)}>{Object.entries(item).slice(0, 6).map(([key, entry]) => <div key={key}><span>{key}</span><strong>{value(entry)}</strong></div>)}</article>)}</div>}</section>;
}

function ResourceView({ section, actor }: { section: Exclude<Section, 'dashboard' | 'notifications'>; actor: AdminActor }) {
  const endpoint: Record<string, string> = {
    users: 'users', content: 'content', comments: 'comments', reports: 'reports', settings: 'settings', integrations: 'integrations', audit: 'audit-logs', admins: 'admins',
  };
  const [data, setData] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const load = (cursor = '', append = false) => api.request<CursorPage<Record<string, unknown>> | Record<string, unknown>>(`/v1/admin/${endpoint[section]}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`).then((result) => {
    const items = 'items' in result && Array.isArray(result.items) ? result.items : [result];
    setData((current) => append ? [...current, ...items] : items);
    setNextCursor('nextCursor' in result && typeof result.nextCursor === 'string' ? result.nextCursor : null);
  }).catch(setError);
  useEffect(() => { void load(); }, [section]);

  const removeComment = async (item: Record<string, unknown>) => {
    if (!can(actor, 'comments.delete')) return;
    const id = String(item.id || '');
    const confirmation = window.prompt('A exclusão é permanente. Digite EXCLUIR para confirmar:');
    if (confirmation !== 'EXCLUIR') return;
    setBusyId(id);
    try {
      await api.request(`/v1/admin/comments/${encodeURIComponent(id)}`, {
        method: 'DELETE', body: { confirmation }, idempotencyKey: crypto.randomUUID(),
      });
      await load();
    } catch (reason) { setError(reason); }
    finally { setBusyId(''); }
  };

  if (error) return <ErrorBox error={error} />;
  return <div className="stack"><header className="section-head"><div><h2>{sections.find((entry) => entry.id === section)?.label}</h2><p>Dados carregados da API administrativa.</p></div><button onClick={() => void load()}>Atualizar</button></header>
    <section className="panel"><div className="data-list">{data.length ? data.map((item, index) => <article key={String(item.id || item.uid || index)}>{Object.entries(item).slice(0, 8).map(([key, entry]) => <div key={key}><span>{key}</span><strong>{value(entry)}</strong></div>)}{section === 'comments' && can(actor, 'comments.delete') && <button className="danger" disabled={busyId === item.id} onClick={() => void removeComment(item)}>{busyId === item.id ? 'Excluindo…' : 'Excluir definitivamente'}</button>}</article>) : <p className="muted">Nenhum registro disponível.</p>}</div>{nextCursor && <button onClick={() => void load(nextCursor, true)}>Carregar mais</button>}</section>
  </div>;
}

function NotificationsView({ actor }: { actor: AdminActor }) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState('all');
  const [error, setError] = useState<unknown>(null);
  const load = () => api.request<CursorPage<Record<string, unknown>>>('/v1/admin/notifications').then((result) => setItems(result.items)).catch(setError);
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!title && !body) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [title, body]);
  const createDraft = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    try {
      await api.request('/v1/admin/notifications', { method: 'POST', body: { title, body, target } });
      setTitle(''); setBody(''); await load();
    } catch (reason) { setError(reason); }
  };
  return <div className="stack"><header className="section-head"><div><h2>Notificações</h2><p>Crie um rascunho; o envio exige uma ação separada, confirmação e autenticação recente.</p></div></header>
    {Boolean(error) && <ErrorBox error={error} />}
    {can(actor, 'notifications.create') && <form className="panel form" onSubmit={(event) => void createDraft(event)}><h3>Novo rascunho</h3><label>Título<input maxLength={100} required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Mensagem<textarea maxLength={500} required value={body} onChange={(event) => setBody(event.target.value)} /></label><label>Público<select value={target} onChange={(event) => setTarget(event.target.value)}><option value="all">Todos</option><option value="pro">Membros PRO</option><option value="free">Plano gratuito</option></select></label><button className="primary">Salvar rascunho</button></form>}
    <DataList title="Fila" items={items} />
  </div>;
}

export function App() {
  const [user, setUser] = useState<User | null>(auth?.currentUser || null);
  const [authReady, setAuthReady] = useState(!auth);
  const [actor, setActor] = useState<AdminActor | null>(null);
  const [accessError, setAccessError] = useState<unknown>(null);
  const [section, setSection] = useState<Section>('dashboard');

  useEffect(() => auth ? onAuthStateChanged(auth, (next) => { setUser(next); setActor(null); setAccessError(null); setAuthReady(true); }) : undefined, []);
  useEffect(() => {
    const lost = () => { setActor(null); setAccessError(new Error('A autorização administrativa foi encerrada. Entre novamente.')); };
    window.addEventListener('maratonou:admin-authorization-lost', lost);
    return () => window.removeEventListener('maratonou:admin-authorization-lost', lost);
  }, []);
  useEffect(() => {
    if (!user) return;
    void api.request<{ actor: AdminActor }>('/v1/admin/me').then((result) => setActor(result.actor)).catch(setAccessError);
  }, [user]);
  const visible = useMemo(() => actor ? sections.filter((entry) => can(actor, entry.permission)) : [], [actor]);

  if (!authReady) return <main className="center">Validando sessão…</main>;
  if (!user) return <Login />;
  if (accessError) return <main className="center"><section className="login-card"><h1>Acesso negado</h1><ErrorBox error={accessError} /><button onClick={() => void logout()}>Sair da conta</button></section></main>;
  if (!actor) return <main className="center">Verificando claim, cadastro e permissões…</main>;
  const current = visible.some((entry) => entry.id === section) ? section : visible[0]?.id || 'dashboard';
  return <div className="admin-shell"><aside><div className="brand">Maratonou <span>Admin</span></div><nav>{visible.map((item) => <button className={current === item.id ? 'active' : ''} key={item.id} onClick={() => setSection(item.id)}>{item.label}</button>)}</nav><div className="identity"><strong>{actor.name}</strong><span>{actor.email}</span><small>{actor.role}</small><button onClick={() => void logout()}>Sair</button></div></aside><main className="content">{current === 'dashboard' ? <DashboardView /> : current === 'notifications' ? <NotificationsView actor={actor} /> : <ResourceView section={current} actor={actor} />}</main></div>;
}
