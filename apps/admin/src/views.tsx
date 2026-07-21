import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { CursorPage } from '@maratonou/api-client';
import { api, type AdminActor, type Dashboard, type DashboardPeriod, type DashboardRankingItem } from './api';
import { can, formatDate, formatNumber, humanize, stringValue, type Section } from './admin-model';
import { ConfirmDialog, EmptyState, ErrorBox, Icon, LoadingTable, StatusBadge } from './components';

type RecordItem = Record<string, unknown>;
type Column = { key: string; label: string; render?: (item: RecordItem) => ReactNode };

function usePagedResource(endpoint: string) {
  const [items, setItems] = useState<RecordItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async (next = '', append = false) => {
    setLoading(true); setError(null);
    try {
      const separator = endpoint.includes('?') ? '&' : '?';
      const result = await api.request<CursorPage<RecordItem> | RecordItem>(`${endpoint}${next ? `${separator}cursor=${encodeURIComponent(next)}` : ''}`);
      const nextItems = 'items' in result && Array.isArray(result.items) ? result.items : [result];
      setItems((current) => append ? [...current, ...nextItems] : nextItems);
      setCursor('nextCursor' in result && typeof result.nextCursor === 'string' ? result.nextCursor : null);
    } catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, [endpoint]);
  useEffect(() => { void load(); }, [load]);
  return { items, cursor, loading, error, load };
}

function matchesSearch(item: RecordItem, search: string) {
  if (!search.trim()) return true;
  const needle = search.trim().toLocaleLowerCase('pt-BR');
  return Object.values(item).some((entry) => stringValue(entry).toLocaleLowerCase('pt-BR').includes(needle));
}

function DataTable({ columns, items, search, actions }: { columns: Column[]; items: RecordItem[]; search: string; actions?: (item: RecordItem) => ReactNode }) {
  const filtered = useMemo(() => items.filter((item) => matchesSearch(item, search)), [items, search]);
  if (!filtered.length) return <EmptyState title={search ? 'Nenhum resultado para a busca' : undefined} message={search ? 'Tente buscar por outro termo.' : undefined} />;
  return <div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}{actions && <th className="action-cell">Ações</th>}</tr></thead><tbody>{filtered.map((item, index) => <tr key={String(item.id || item.uid || index)}>{columns.map((column) => <td key={column.key} data-label={column.label}>{column.render ? column.render(item) : stringValue(item[column.key])}</td>)}{actions && <td className="action-cell" data-label="Ações">{actions(item)}</td>}</tr>)}</tbody></table></div>;
}

function PageActions({ onRefresh, busy, children }: { onRefresh?: () => void; busy?: boolean; children?: ReactNode }) {
  return <div className="page-actions">{children}{onRefresh && <button className="button button-quiet" disabled={busy} onClick={onRefresh}><Icon name="refresh" size={17}/>{busy ? 'Atualizando…' : 'Atualizar'}</button>}</div>;
}

export function DashboardView({ actor }: { actor: AdminActor }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [period, setPeriod] = useState<DashboardPeriod>('weekly');
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await api.request<Dashboard>('/v1/admin/dashboard')); }
    catch (reason) { setError(reason); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const rebuild = async () => {
    setRebuilding(true); setError(null);
    try { setData(await api.request<Dashboard>('/v1/admin/dashboard/rebuild', { method: 'POST' })); }
    catch (reason) { setError(reason); }
    finally { setRebuilding(false); }
  };
  if (error && !data) return <ErrorBox error={error} onRetry={() => void load()} />;
  const metricOrder = ['usersTotal', 'activeUsers7d', 'activeUsers14d', 'activeUsers30d', 'proMembersTotal', 'activityTotal', 'commentsTotal', 'openReportsTotal', 'notificationsTotal', 'pendingNotificationJobs'];
  const entries = Object.entries(data?.metrics || {}).sort(([left], [right]) => {
    const leftIndex = metricOrder.indexOf(left); const rightIndex = metricOrder.indexOf(right);
    return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
  });
  const currentRanking = data?.rankings?.[period];
  const rankingList = (items: DashboardRankingItem[] | undefined, emptyMessage: string) => items?.length
    ? <ol className="ranking-list">{items.map((item, index) => <li key={item.titleKey}><span className="ranking-position">{index + 1}</span><div className="ranking-copy"><strong>{item.titleName}</strong><small>{item.titleType === 'tv' ? 'Série' : 'Filme'}</small></div><span className="ranking-count">{formatNumber(item.count)} {item.count === 1 ? 'membro' : 'membros'}</span></li>)}</ol>
    : <EmptyState title="Ainda sem dados" message={emptyMessage}/>;
  return <div className="stack">
    <div className="toolbar"><div><h2>Saúde do Maratonou</h2><p>Indicadores agregados do ambiente de produção.</p></div><PageActions onRefresh={() => void load()} busy={loading}>{can(actor.permissions, 'dashboard.rebuild') && <button className="button button-primary" disabled={rebuilding} onClick={() => void rebuild()}><Icon name="refresh" size={17}/>{rebuilding ? 'Calculando…' : data?.unavailable.length ? 'Inicializar métricas' : 'Recalcular métricas'}</button>}</PageActions></div>
    {Boolean(error) && <ErrorBox error={error} />}
    {loading && !data ? <div className="metric-grid"><span className="metric-skeleton"/><span className="metric-skeleton"/><span className="metric-skeleton"/><span className="metric-skeleton"/></div> : <div className="metric-grid">{entries.length ? entries.map(([key, metric], index) => <article className="metric-card" key={key}><span className={`metric-icon tone-${index % 4}`}><Icon name={key.includes('user') || key.includes('Member') ? 'users' : key.includes('report') ? 'reports' : key.includes('notification') ? 'notifications' : 'dashboard'} /></span><div><span>{humanize(key)}</span><strong>{formatNumber(metric)}</strong><small>Atualizado {data?.metricsUpdatedAt ? formatDate(data.metricsUpdatedAt) : 'agora'}</small></div></article>) : <article className="metric-card metric-card-empty"><span className="metric-icon"><Icon name="warning"/></span><div><span>Métricas</span><strong>Não inicializadas</strong><small>Use o botão acima para contar os dados reais.</small></div></article>}</div>}
    {!!data?.unavailable.length && <div className="feedback feedback-warning"><span className="feedback-icon"><Icon name="warning" /></span><div><strong>Fonte agregada pendente</strong><p>{data.unavailable.join(', ')} ainda não existe. Nenhum valor fictício está sendo exibido.</p></div></div>}
    <section className="panel ranking-panel"><div className="panel-title ranking-heading"><div><span className="eyebrow">Preferências da comunidade</span><h2>Títulos mais adicionados e assistidos</h2><p>Cada membro conta uma vez por título em cada período.</p></div><div className="period-tabs" aria-label="Período dos rankings">{([['weekly', '7 dias'], ['monthly', '30 dias'], ['yearly', '1 ano']] as Array<[DashboardPeriod, string]>).map(([value, label]) => <button key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{label}</button>)}</div></div>
      {data?.rankingsPartial && <div className="feedback feedback-warning"><span className="feedback-icon"><Icon name="warning"/></span><div><strong>Resultado parcial</strong><p>O cálculo atingiu o limite de 10 mil atividades no último ano.</p></div></div>}
      <div className="ranking-columns"><div><h3>Mais adicionados</h3><p>Quero assistir e maratonando</p>{rankingList(currentRanking?.added, 'Nenhum filme ou série foi adicionado neste período.')}</div><div><h3>Mais assistidos</h3><p>Títulos marcados como finalizados</p>{rankingList(currentRanking?.watched, 'Nenhum filme ou série foi finalizado neste período.')}</div></div>
      {data?.rankingsUpdatedAt && <small className="ranking-updated">Consolidado em {formatDate(data.rankingsUpdatedAt)}</small>}
    </section>
    <section className="panel"><div className="panel-title"><div><span className="eyebrow">Rastreabilidade</span><h2>Atividade administrativa recente</h2></div></div>{loading && !data ? <LoadingTable/> : <DataTable search="" columns={[
      { key: 'action', label: 'Ação' },
      { key: 'actorEmail', label: 'Responsável' },
      { key: 'resource', label: 'Recurso' },
      { key: 'outcome', label: 'Resultado', render: (item) => <StatusBadge value={item.outcome}/> },
      { key: 'createdAt', label: 'Data', render: (item) => formatDate(item.createdAt) },
    ]} items={data?.recentAudit || []}/>}</section>
  </div>;
}

const resourceConfig: Partial<Record<Section, { endpoint: string; columns: Column[] }>> = {
  content: { endpoint: '/v1/admin/content?limit=25', columns: [
    { key: 'id', label: 'Conteúdo' }, { key: 'localTitle', label: 'Título local' },
    { key: 'visibility', label: 'Visibilidade', render: (item) => <StatusBadge value={item.visibility}/> },
    { key: 'featured', label: 'Destaque', render: (item) => item.featured ? 'Sim' : 'Não' },
    { key: 'updatedAt', label: 'Atualizado', render: (item) => formatDate(item.updatedAt) },
  ] },
  audit: { endpoint: '/v1/admin/audit-logs?limit=30', columns: [
    { key: 'action', label: 'Ação' }, { key: 'actorEmail', label: 'Responsável' }, { key: 'actorRole', label: 'Função' },
    { key: 'resource', label: 'Recurso' }, { key: 'outcome', label: 'Resultado', render: (item) => <StatusBadge value={item.outcome}/> },
    { key: 'createdAt', label: 'Data', render: (item) => formatDate(item.createdAt) },
  ] },
};

export function GenericResourceView({ section, search }: { section: 'content' | 'audit'; search: string }) {
  const config = resourceConfig[section]!;
  const { items, cursor, loading, error, load } = usePagedResource(config.endpoint);
  return <div className="stack"><div className="toolbar"><div><h2>{section === 'content' ? 'Curadoria de conteúdo' : 'Histórico de auditoria'}</h2><p>{section === 'content' ? 'Overrides editoriais publicados no aplicativo.' : 'Registro imutável das operações administrativas.'}</p></div><PageActions onRefresh={() => void load()} busy={loading}/></div>{Boolean(error) && <ErrorBox error={error} onRetry={() => void load()}/>}<section className="panel">{loading && !items.length ? <LoadingTable/> : <DataTable columns={config.columns} items={items} search={search}/>} {cursor && <div className="load-more"><button className="button button-quiet" disabled={loading} onClick={() => void load(cursor, true)}>Carregar mais</button></div>}</section></div>;
}

type BannerKind = 'image' | 'html';
type BannerPage = 'home' | 'search' | 'profile';
type BannerForm = {
  id: string;
  name: string;
  kind: BannerKind;
  pages: BannerPage[];
  imageUrl: string;
  html: string;
  destinationUrl: string;
  altText: string;
  status: 'draft' | 'published';
  startsAt: string;
  endsAt: string;
  priority: number;
  height: number;
};

const EMPTY_BANNER: BannerForm = {
  id: '', name: '', kind: 'image', pages: ['home'], imageUrl: '', html: '',
  destinationUrl: '', altText: '', status: 'draft', startsAt: '', endsAt: '',
  priority: 0, height: 160,
};

function localDateTime(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function bannerFromItem(item: RecordItem): BannerForm {
  return {
    ...EMPTY_BANNER,
    id: String(item.id || ''),
    name: String(item.name || ''),
    kind: item.kind === 'html' ? 'html' : 'image',
    pages: (Array.isArray(item.pages) ? item.pages : []).filter((page): page is BannerPage => ['home', 'search', 'profile'].includes(String(page))),
    imageUrl: String(item.imageUrl || ''),
    html: String(item.html || ''),
    destinationUrl: String(item.destinationUrl || ''),
    altText: String(item.altText || ''),
    status: item.status === 'published' ? 'published' : 'draft',
    startsAt: localDateTime(item.startsAt),
    endsAt: localDateTime(item.endsAt),
    priority: Number(item.priority || 0),
    height: Number(item.height || 160),
  };
}

function bannerPreviewDocument(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; script-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;overflow:hidden}body{display:grid;place-items:center;font-family:system-ui;background:transparent;color:#fff}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
}

export function BannersView({ actor, search }: { actor: AdminActor; search: string }) {
  const { items, loading, error, load } = usePagedResource('/v1/admin/banners?limit=50');
  const { items: overrides, loading: overridesLoading, error: overridesError, load: loadOverrides } = usePagedResource('/v1/admin/content?limit=25');
  const [form, setForm] = useState<BannerForm>(EMPTY_BANNER);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [deleting, setDeleting] = useState<RecordItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const update = <K extends keyof BannerForm>(key: K, value: BannerForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const togglePage = (page: BannerPage) => setForm((current) => ({ ...current, pages: current.pages.includes(page) ? current.pages.filter((value) => value !== page) : [...current.pages, page] }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setActionError(null);
    try {
      const body = { ...form, startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : '', endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : '' };
      await api.request(form.id ? `/v1/admin/banners/${encodeURIComponent(form.id)}` : '/v1/admin/banners', { method: form.id ? 'PATCH' : 'POST', body });
      setForm(EMPTY_BANNER); await load();
    } catch (reason) { setActionError(reason); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true); setActionError(null);
    try {
      await api.request(`/v1/admin/banners/${encodeURIComponent(String(deleting.id))}`, { method: 'DELETE', body: { confirmation: 'EXCLUIR' }, idempotencyKey: crypto.randomUUID() });
      if (form.id === deleting.id) setForm(EMPTY_BANNER);
      setDeleting(null); await load();
    } catch (reason) { setActionError(reason); }
    finally { setDeleteBusy(false); }
  };
  const canSave = form.id ? can(actor.permissions, 'content.update') : can(actor.permissions, 'content.create');
  return <div className="stack">
    <div className="toolbar"><div><h2>Banners do aplicativo</h2><p>Publique imagens ou HTML isolado na Home, Busca e Perfil.</p></div><PageActions onRefresh={() => void load()} busy={loading}><button className="button button-quiet" onClick={() => setForm(EMPTY_BANNER)}><Icon name="plus" size={17}/>Novo banner</button></PageActions></div>
    <div className="feedback notification-info"><span className="feedback-icon"><Icon name="content"/></span><div><strong>HTML protegido</strong><p>Scripts, formulários e eventos são bloqueados. Use o campo de destino para tornar o banner clicável.</p></div></div>
    {(error || actionError) ? <ErrorBox error={error || actionError} onRetry={() => void load()}/> : null}
    <div className="banner-admin-layout">
      <form className="panel banner-form" onSubmit={(event) => void submit(event)}>
        <div className="panel-title"><div><span className="eyebrow">{form.id ? 'Editando' : 'Novo banner'}</span><h2>{form.id ? form.name || 'Banner' : 'Configurar exibição'}</h2></div>{form.id && <button type="button" className="mini-button" onClick={() => setForm(EMPTY_BANNER)}>Cancelar edição</button>}</div>
        <label>Nome interno<input required maxLength={120} value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Ex.: Lançamento da semana"/></label>
        <div className="form-grid"><label>Formato<select value={form.kind} onChange={(event) => update('kind', event.target.value as BannerKind)}><option value="image">Imagem</option><option value="html">HTML</option></select></label><label>Status<select value={form.status} onChange={(event) => update('status', event.target.value as BannerForm['status'])}><option value="draft">Rascunho</option><option value="published">Publicado</option></select></label></div>
        <fieldset className="banner-pages"><legend>Exibir em</legend>{([['home', 'Home'], ['search', 'Busca'], ['profile', 'Perfil']] as Array<[BannerPage, string]>).map(([page, label]) => <label key={page}><input type="checkbox" checked={form.pages.includes(page)} onChange={() => togglePage(page)}/><span>{label}</span></label>)}</fieldset>
        {form.kind === 'image' ? <><label>URL HTTPS da imagem<input required type="url" value={form.imageUrl} onChange={(event) => update('imageUrl', event.target.value)} placeholder="https://…/banner.jpg"/></label><label>Texto alternativo<input maxLength={180} value={form.altText} onChange={(event) => update('altText', event.target.value)} placeholder="Descrição acessível da imagem"/></label></> : <label>HTML do banner<textarea required maxLength={20000} value={form.html} onChange={(event) => update('html', event.target.value)} placeholder="<div style=&quot;...&quot;>...</div>"/></label>}
        <label>Destino ao tocar<input value={form.destinationUrl} onChange={(event) => update('destinationUrl', event.target.value)} placeholder="/title/movie/123 ou https://maratonou.com/…"/></label>
        <div className="form-grid"><label>Início opcional<input type="datetime-local" value={form.startsAt} onChange={(event) => update('startsAt', event.target.value)}/></label><label>Término opcional<input type="datetime-local" value={form.endsAt} onChange={(event) => update('endsAt', event.target.value)}/></label></div>
        <div className="form-grid"><label>Prioridade<input type="number" min="0" max="100" value={form.priority} onChange={(event) => update('priority', Number(event.target.value))}/></label><label>Altura do HTML<input type="number" min="80" max="500" disabled={form.kind !== 'html'} value={form.height} onChange={(event) => update('height', Number(event.target.value))}/></label></div>
        {(form.kind === 'image' ? form.imageUrl : form.html) && <div className="banner-preview"><span>Prévia</span>{form.kind === 'image' ? <img src={form.imageUrl} alt={form.altText || ''}/> : <iframe title="Prévia do banner HTML" sandbox="" srcDoc={bannerPreviewDocument(form.html)} style={{ height: Math.min(form.height, 260) }}/>}</div>}
        {canSave && <button className="button button-primary button-wide" disabled={saving || !form.pages.length}>{saving ? 'Salvando…' : form.id ? 'Salvar alterações' : 'Criar banner'}</button>}
      </form>
      <section className="panel banner-list-panel"><div className="panel-title"><div><span className="eyebrow">Campanhas</span><h2>Banners cadastrados</h2></div></div>{loading && !items.length ? <LoadingTable/> : <DataTable search={search} items={items} columns={[{ key: 'name', label: 'Banner' }, { key: 'kind', label: 'Formato', render: (item) => item.kind === 'html' ? 'HTML' : 'Imagem' }, { key: 'pages', label: 'Páginas', render: (item) => (Array.isArray(item.pages) ? item.pages : []).map((page) => ({ home: 'Home', search: 'Busca', profile: 'Perfil' }[String(page)] || String(page))).join(', ') }, { key: 'status', label: 'Status', render: (item) => <StatusBadge value={item.status}/> }, { key: 'updatedAt', label: 'Atualizado', render: (item) => formatDate(item.updatedAt) }]} actions={(item) => <div className="row-actions"><button className="mini-button" onClick={() => setForm(bannerFromItem(item))}>Editar</button>{can(actor.permissions, 'content.delete') && <button className="mini-button danger-text" onClick={() => setDeleting(item)}>Excluir</button>}</div>}/>}</section>
    </div>
    {overridesError ? <ErrorBox error={overridesError} onRetry={() => void loadOverrides()}/> : <section className="panel"><div className="panel-title"><div><span className="eyebrow">Curadoria existente</span><h2>Overrides editoriais</h2><p>Os ajustes de títulos e destaques existentes continuam preservados.</p></div></div>{overridesLoading && !overrides.length ? <LoadingTable/> : <DataTable search={search} items={overrides} columns={resourceConfig.content!.columns}/>}</section>}
    <ConfirmDialog open={!!deleting} title="Excluir banner" message={`${String(deleting?.name || 'O banner')} será removido do painel e do aplicativo.`} expected="EXCLUIR" busy={deleteBusy} onClose={() => setDeleting(null)} onConfirm={() => void remove()}/>
  </div>;
}

export function UsersView({ actor, search }: { actor: AdminActor; search: string }) {
  const { items, cursor, loading, error, load } = usePagedResource('/v1/admin/users?limit=25');
  const [dialog, setDialog] = useState<{ item: RecordItem; action: 'suspend' | 'ban' | 'restore' } | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async () => {
    if (!dialog) return;
    setBusy(true);
    try {
      const uid = String(dialog.item.uid);
      await api.request(`/v1/admin/users/${encodeURIComponent(uid)}/${dialog.action}`, { method: 'POST', body: { confirmation: dialog.action === 'ban' ? 'BANIR' : dialog.action === 'suspend' ? 'SUSPENDER' : 'REATIVAR', reason: 'Ação realizada pelo painel administrativo.' }, idempotencyKey: crypto.randomUUID() });
      setDialog(null); await load();
    } finally { setBusy(false); }
  };
  return <div className="stack"><div className="toolbar"><div><h2>Base de usuários</h2><p>Contas do Firebase Authentication combinadas aos perfis do Firestore.</p></div><PageActions onRefresh={() => void load()} busy={loading}/></div>{Boolean(error) && <ErrorBox error={error} onRetry={() => void load()}/>}<section className="panel">{loading && !items.length ? <LoadingTable/> : <DataTable search={search} items={items} columns={[
    { key: 'displayName', label: 'Usuário', render: (item) => <div className="primary-cell"><span className="mini-avatar">{String(item.displayName || item.email || '?').slice(0, 1).toUpperCase()}</span><div><strong>{stringValue(item.displayName)}</strong><small>{stringValue(item.email)}</small></div></div> },
    { key: 'accountStatus', label: 'Status', render: (item) => <StatusBadge value={item.accountStatus}/> },
    { key: 'proMember', label: 'Plano', render: (item) => <span className={item.proMember ? 'pro-label' : ''}>{item.proMember ? 'PRO' : 'Gratuito'}</span> },
    { key: 'createdAt', label: 'Cadastro', render: (item) => formatDate(item.createdAt) },
    { key: 'lastSignInAt', label: 'Último acesso', render: (item) => formatDate(item.lastSignInAt) },
  ]} actions={(item) => String(item.uid) === actor.uid ? <span className="muted">Sua conta</span> : <div className="row-actions">{String(item.accountStatus) === 'active' ? <>{can(actor.permissions, 'users.suspend') && <button className="mini-button" onClick={() => setDialog({ item, action: 'suspend' })}>Suspender</button>}{can(actor.permissions, 'users.ban') && <button className="mini-button danger-text" onClick={() => setDialog({ item, action: 'ban' })}>Banir</button>}</> : can(actor.permissions, 'users.suspend') && <button className="mini-button" onClick={() => setDialog({ item, action: 'restore' })}>Reativar</button>}</div>}/>} {cursor && <div className="load-more"><button className="button button-quiet" onClick={() => void load(cursor, true)}>Carregar mais</button></div>}</section><ConfirmDialog open={!!dialog} title={dialog?.action === 'restore' ? 'Reativar conta' : dialog?.action === 'ban' ? 'Banir usuário' : 'Suspender usuário'} message={`${stringValue(dialog?.item.email)} será ${dialog?.action === 'restore' ? 'reativado' : dialog?.action === 'ban' ? 'banido' : 'suspenso'}. A ação será registrada na auditoria.`} expected={dialog?.action === 'ban' ? 'BANIR' : dialog?.action === 'suspend' ? 'SUSPENDER' : 'REATIVAR'} busy={busy} onClose={() => setDialog(null)} onConfirm={() => void act()}/></div>;
}

export function CommentsView({ actor, search }: { actor: AdminActor; search: string }) {
  const { items, loading, error, load } = usePagedResource('/v1/admin/comments?limit=40');
  const [dialog, setDialog] = useState<RecordItem | null>(null);
  const [busy, setBusy] = useState(false);
  const hide = async (item: RecordItem) => {
    const hidden = Boolean((item.moderation as RecordItem | undefined)?.hidden);
    await api.request(`/v1/admin/comments/${encodeURIComponent(String(item.id))}/${hidden ? 'show' : 'hide'}`, { method: 'POST', body: { reason: hidden ? 'Comentário restaurado pelo painel.' : 'Comentário ocultado pela moderação.' } });
    await load();
  };
  const remove = async () => {
    if (!dialog) return; setBusy(true);
    try { await api.request(`/v1/admin/comments/${encodeURIComponent(String(dialog.id))}`, { method: 'DELETE', body: { confirmation: 'EXCLUIR' }, idempotencyKey: crypto.randomUUID() }); setDialog(null); await load(); }
    finally { setBusy(false); }
  };
  return <div className="stack"><div className="toolbar"><div><h2>Moderação de comentários</h2><p>Oculte conteúdo para revisão ou exclua definitivamente em casos críticos.</p></div><PageActions onRefresh={() => void load()} busy={loading}/></div>{Boolean(error) && <ErrorBox error={error} onRetry={() => void load()}/>}<section className="panel">{loading && !items.length ? <LoadingTable/> : <DataTable search={search} items={items} columns={[
    { key: 'authorName', label: 'Autor', render: (item) => <div><strong>{stringValue(item.authorName || item.username || item.authorUid)}</strong><small>{stringValue(item.authorUid)}</small></div> },
    { key: 'body', label: 'Comentário', render: (item) => <span className="comment-preview">{stringValue(item.body || item.text || item.comment)}</span> },
    { key: 'rating', label: 'Nota' }, { key: 'moderation', label: 'Moderação', render: (item) => <StatusBadge value={(item.moderation as RecordItem | undefined)?.hidden ? 'hidden' : 'visible'}/> },
    { key: 'createdAt', label: 'Publicado', render: (item) => formatDate(item.createdAt) },
  ]} actions={(item) => <div className="row-actions">{can(actor.permissions, 'comments.moderate') && <button className="mini-button" onClick={() => void hide(item)}>{(item.moderation as RecordItem | undefined)?.hidden ? 'Restaurar' : 'Ocultar'}</button>}{can(actor.permissions, 'comments.delete') && <button className="mini-button danger-text" onClick={() => setDialog(item)}>Excluir</button>}</div>}/>}</section><ConfirmDialog open={!!dialog} title="Excluir comentário definitivamente" message="O comentário será removido do Firestore e não poderá ser recuperado pelo painel." expected="EXCLUIR" busy={busy} onClose={() => setDialog(null)} onConfirm={() => void remove()}/></div>;
}

export function ReportsView({ actor, search }: { actor: AdminActor; search: string }) {
  const { items, cursor, loading, error, load } = usePagedResource('/v1/admin/reports?limit=30');
  const update = async (id: unknown, status: string) => { await api.request(`/v1/admin/reports/${encodeURIComponent(String(id))}`, { method: 'PATCH', body: { status, note: `Status alterado para ${status} no painel.` } }); await load(); };
  return <div className="stack"><div className="toolbar"><div><h2>Fila de denúncias</h2><p>Analise ocorrências e acompanhe o estado de resolução.</p></div><PageActions onRefresh={() => void load()} busy={loading}/></div>{Boolean(error) && <ErrorBox error={error} onRetry={() => void load()}/>}<section className="panel">{loading && !items.length ? <LoadingTable/> : <DataTable search={search} items={items} columns={[
    { key: 'type', label: 'Tipo' }, { key: 'reason', label: 'Motivo' }, { key: 'targetId', label: 'Alvo' },
    { key: 'status', label: 'Status', render: (item) => <StatusBadge value={item.status || 'open'}/> },
    { key: 'createdAt', label: 'Recebida', render: (item) => formatDate(item.createdAt) },
  ]} actions={can(actor.permissions, 'reports.resolve') ? (item) => <select className="status-select" aria-label="Alterar status" value={String(item.status || 'open')} onChange={(event) => void update(item.id, event.target.value)}><option value="open">Aberta</option><option value="in_review">Em análise</option><option value="resolved">Resolvida</option><option value="rejected">Rejeitada</option></select> : undefined}/>} {cursor && <div className="load-more"><button className="button button-quiet" onClick={() => void load(cursor, true)}>Carregar mais</button></div>}</section></div>;
}

export function NotificationsView({ actor, search }: { actor: AdminActor; search: string }) {
  const { items, loading, error, load } = usePagedResource('/v1/admin/notifications?limit=30');
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [target, setTarget] = useState('all'); const [link, setLink] = useState(''); const [saving, setSaving] = useState(false);
  const create = async (event: FormEvent) => { event.preventDefault(); setSaving(true); try { await api.request('/v1/admin/notifications', { method: 'POST', body: { title, body, target, link } }); setTitle(''); setBody(''); setLink(''); await load(); } finally { setSaving(false); } };
  const send = async (item: RecordItem) => { if (!window.confirm(`Enviar “${stringValue(item.title)}” agora?`)) return; await api.request(`/v1/admin/notifications/${encodeURIComponent(String(item.id))}/send`, { method: 'POST', body: { confirmation: 'ENVIAR' }, idempotencyKey: crypto.randomUUID() }); await load(); };
  return <div className="stack"><div className="toolbar"><div><h2>Central de notificações</h2><p>Crie, revise e aprove comunicados antes do processamento.</p></div><PageActions onRefresh={() => void load()} busy={loading}/></div>{Boolean(error) && <ErrorBox error={error} onRetry={() => void load()}/>}<div className="feedback notification-info"><span className="feedback-icon"><Icon name="notifications"/></span><div><strong>Envio push + caixa de entrada</strong><p>Ao clicar em Enviar, o comunicado entra na caixa de notificações de todos os destinatários. O alerta push também aparece nos aparelhos que concederam permissão e possuem um token FCM válido.</p></div></div><div className="split-layout">{can(actor.permissions, 'notifications.create') && <form className="panel form-card" onSubmit={(event) => void create(event)}><div className="panel-title"><div><span className="eyebrow">Novo comunicado</span><h2>Criar rascunho</h2></div></div><label>Título<input maxLength={100} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Novidades desta semana"/></label><label>Mensagem<textarea maxLength={500} required value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escreva uma mensagem clara e objetiva."/></label><div className="form-grid"><label>Público<select value={target} onChange={(event) => setTarget(event.target.value)}><option value="all">Todos</option><option value="pro">Membros PRO</option><option value="free">Plano gratuito</option></select></label><label>Link opcional<input type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://maratonou.com/…"/></label></div><div className="notification-preview"><span>Prévia do push</span><strong>{title || 'Título da notificação'}</strong><p>{body || 'A mensagem aparecerá aqui.'}</p></div><button className="button button-primary" disabled={saving}><Icon name="plus" size={17}/>{saving ? 'Salvando…' : 'Salvar rascunho'}</button></form>}<section className="panel"><div className="panel-title"><div><span className="eyebrow">Histórico</span><h2>Fila de envios</h2></div></div>{loading && !items.length ? <LoadingTable/> : <DataTable search={search} items={items} columns={[{ key: 'title', label: 'Notificação' }, { key: 'target', label: 'Público' }, { key: 'status', label: 'Status', render: (item) => <StatusBadge value={item.status}/> }, { key: 'deliveries', label: 'Caixas de entrada' }, { key: 'pushDeliveries', label: 'Push entregues' }, { key: 'createdAt', label: 'Criada', render: (item) => formatDate(item.createdAt) }]} actions={can(actor.permissions, 'notifications.send') ? (item) => item.status === 'draft' ? <button className="mini-button" onClick={() => void send(item)}><Icon name="send" size={15}/>Enviar</button> : null : undefined}/>}</section></div></div>;
}

type SettingsPayload = { settings?: RecordItem; versions?: RecordItem; unavailable?: string[] };
export function SettingsView({ actor }: { actor: AdminActor }) {
  const [data, setData] = useState<SettingsPayload | null>(null); const [error, setError] = useState<unknown>(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setData(await api.request<SettingsPayload>('/v1/admin/settings')); } catch (reason) { setError(reason); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); try { await api.request('/v1/admin/settings', { method: 'PATCH', body: { confirmation: 'ALTERAR', maintenanceMode: form.get('maintenanceMode') === 'on', registrationsEnabled: form.get('registrationsEnabled') === 'on', reviewsEnabled: form.get('reviewsEnabled') === 'on', commentsEnabled: form.get('commentsEnabled') === 'on', proEnabled: form.get('proEnabled') === 'on', defaultLocale: form.get('defaultLocale'), defaultRegion: form.get('defaultRegion') }, idempotencyKey: crypto.randomUUID() }); await load(); } catch (reason) { setError(reason); } finally { setSaving(false); } };
  if (loading && !data) return <LoadingTable/>;
  if (error && !data) return <ErrorBox error={error} onRetry={() => void load()}/>;
  const settings = data?.settings || {};
  return <div className="stack"><div className="toolbar"><div><h2>Configuração global</h2><p>Alterações afetam o comportamento do aplicativo em produção.</p></div></div>{Boolean(error) && <ErrorBox error={error}/>} {!!data?.unavailable?.length && <div className="feedback feedback-warning"><span className="feedback-icon"><Icon name="warning"/></span><div><strong>Configuração ainda não criada</strong><p>Ao salvar, os documentos ausentes serão inicializados com estes valores.</p></div></div>}<form className="panel settings-form" onSubmit={(event) => void save(event)}><div className="settings-group"><div><h3>Recursos do aplicativo</h3><p>Ative ou pause áreas sem precisar publicar uma nova versão.</p></div><div className="toggle-list">{[
    ['registrationsEnabled', 'Novos cadastros', 'Permitir criação de novas contas'], ['reviewsEnabled', 'Avaliações', 'Permitir notas e avaliações'], ['commentsEnabled', 'Comentários', 'Permitir comentários da comunidade'], ['proEnabled', 'Recursos PRO', 'Disponibilizar benefícios da assinatura'], ['maintenanceMode', 'Modo manutenção', 'Bloquear temporariamente o acesso público'],
  ].map(([name, label, description]) => <label className="toggle-row" key={name}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" name={name} defaultChecked={name === 'maintenanceMode' ? settings[name] === true : settings[name] !== false}/><i/></label>)}</div></div><div className="settings-group"><div><h3>Localização padrão</h3><p>Usada quando o usuário ainda não escolheu região ou idioma.</p></div><div className="form-grid"><label>Idioma<select name="defaultLocale" defaultValue={String(settings.defaultLocale || 'pt-BR')}><option value="pt-BR">Português (Brasil)</option><option value="en-US">English (US)</option><option value="es-ES">Español</option></select></label><label>Região<input name="defaultRegion" maxLength={2} defaultValue={String(settings.defaultRegion || 'BR')}/></label></div></div>{can(actor.permissions, 'settings.update') && <div className="sticky-actions"><span>Esta ação será registrada na auditoria.</span><button className="button button-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar configurações'}</button></div>}</form></div>;
}

export function IntegrationsView() {
  const { items, loading, error, load } = usePagedResource('/v1/admin/integrations');
  const labels: Record<string, { name: string; description: string }> = { firebase: { name: 'Firebase', description: 'Autenticação, Firestore, Functions e mensageria.' }, tmdb: { name: 'TMDB', description: 'Metadados, imagens e disponibilidade de títulos.' }, giphy: { name: 'GIPHY', description: 'Pesquisa e incorporação de GIFs.' } };
  return <div className="stack"><div className="toolbar"><div><h2>Serviços conectados</h2><p>O painel informa apenas o estado; credenciais nunca são expostas.</p></div><PageActions onRefresh={() => void load()} busy={loading}/></div>{Boolean(error) && <ErrorBox error={error} onRetry={() => void load()}/>}<div className="integration-grid">{loading && !items.length ? <LoadingTable/> : items.map((item) => { const info = labels[String(item.id)] || { name: String(item.id), description: 'Integração externa.' }; return <article className="integration-card" key={String(item.id)}><span className="integration-logo">{info.name.slice(0, 2).toUpperCase()}</span><div><h3>{info.name}</h3><p>{info.description}</p></div><StatusBadge value={item.configured ? 'configured' : 'not configured'}/></article>; })}</div></div>;
}

export function AdminsView({ actor, search }: { actor: AdminActor; search: string }) {
  const { items, loading, error, load } = usePagedResource('/v1/admin/admins');
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false); const [formError, setFormError] = useState<unknown>(null);
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); setFormError(null); try { await api.request('/v1/admin/admins', { method: 'POST', body: { email: form.get('email'), role: form.get('role'), status: 'active', confirmation: 'CONCEDER' }, idempotencyKey: crypto.randomUUID() }); setOpen(false); await load(); } catch (reason) { setFormError(reason); } finally { setSaving(false); } };
  return <div className="stack"><div className="toolbar"><div><h2>Equipe administrativa</h2><p>Funções são aplicadas no Firebase Auth e validadas novamente pela API.</p></div><PageActions onRefresh={() => void load()} busy={loading}>{can(actor.permissions, 'admins.create') && <button className="button button-primary" onClick={() => setOpen(true)}><Icon name="plus" size={17}/>Adicionar administrador</button>}</PageActions></div>{Boolean(error) && <ErrorBox error={error} onRetry={() => void load()}/>}<section className="panel">{loading && !items.length ? <LoadingTable/> : <DataTable search={search} items={items} columns={[
    { key: 'name', label: 'Administrador', render: (item) => <div className="primary-cell"><span className="mini-avatar">{String(item.name || item.email || '?').slice(0, 1).toUpperCase()}</span><div><strong>{stringValue(item.name)}</strong><small>{stringValue(item.email)}</small></div></div> },
    { key: 'role', label: 'Função' }, { key: 'status', label: 'Status', render: (item) => <StatusBadge value={item.status}/> },
    { key: 'lastAdminAccessAt', label: 'Último acesso', render: (item) => formatDate(item.lastAdminAccessAt) },
    { key: 'createdAt', label: 'Concedido em', render: (item) => formatDate(item.createdAt) },
  ]}/>}</section>{open && <div className="modal-backdrop"><form className="modal form-card" onSubmit={(event) => void create(event)}><div className="modal-title"><div><span className="eyebrow">Controle de acesso</span><h2>Novo administrador</h2></div><button className="icon-button" type="button" onClick={() => setOpen(false)}><Icon name="close"/></button></div>{Boolean(formError) && <ErrorBox error={formError}/>}<label>E-mail da conta Firebase<input required name="email" type="email"/></label><label>Função<select name="role"><option value="support">Suporte</option><option value="editor">Editor</option><option value="moderator">Moderador</option><option value="admin">Administrador</option><option value="super_admin">Superadministrador</option></select></label><p className="confirmation-copy">A conta precisa existir e a alteração revogará sessões anteriores.</p><div className="modal-actions"><button className="button button-quiet" type="button" onClick={() => setOpen(false)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? 'Concedendo…' : 'Conceder acesso'}</button></div></form></div>}</div>;
}
