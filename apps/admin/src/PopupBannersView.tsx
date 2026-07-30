import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import type { CursorPage } from '@maratonou/api-client';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { api, type AdminActor } from './api';
import { can, formatDate, formatNumber } from './admin-model';
import { ConfirmDialog, EmptyState, ErrorBox, Icon, LoadingTable, StatusBadge } from './components';
import { auth, storage } from './firebase';

type Audience = 'all' | 'visitors' | 'registered' | 'free' | 'pro';
type Frequency = 'every_visit' | 'once_session' | 'once_day' | 'once_user' | 'custom';
type Campaign = {
  id: string; name: string; imageDesktopUrl: string; imageMobileUrl: string; altText: string;
  destinationUrl: string; openTarget: 'same' | 'new'; active: boolean; audiences: Audience[];
  frequency: Frequency; frequencyHours: number; priority: number; startsAt: string; endsAt: string;
  updatedAt?: string; metrics: { views: number; clicks: number; closes: number };
};
type Metric = { id: string; date: string; platform: string; views?: number; clicks?: number; closes?: number };

const EMPTY: Campaign = {
  id: '', name: '', imageDesktopUrl: '', imageMobileUrl: '', altText: '', destinationUrl: '',
  openTarget: 'same', active: false, audiences: ['all'], frequency: 'once_session',
  frequencyHours: 24, priority: 0, startsAt: '', endsAt: '', metrics: { views: 0, clicks: 0, closes: 0 },
};
const AUDIENCES: Array<[Audience, string]> = [['all', 'Todos'], ['visitors', 'Visitantes'], ['registered', 'Cadastrados'], ['free', 'Plano gratuito'], ['pro', 'Membros PRO']];
const FREQUENCIES: Array<[Frequency, string]> = [['every_visit', 'A cada visita'], ['once_session', 'Uma vez por sessão'], ['once_day', 'Uma vez por dia'], ['once_user', 'Uma vez por usuário'], ['custom', 'Intervalo personalizado']];

function localDateTime(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function statusOf(item: Campaign) {
  const now = Date.now(); const start = item.startsAt ? new Date(item.startsAt).getTime() : 0; const end = item.endsAt ? new Date(item.endsAt).getTime() : 0;
  if (!item.active) return 'inactive';
  if (start && start > now) return 'scheduled';
  if (end && end <= now) return 'ended';
  return 'active';
}

function asForm(item: Campaign): Campaign {
  return { ...item, startsAt: localDateTime(item.startsAt), endsAt: localDateTime(item.endsAt), audiences: [...item.audiences] };
}

async function optimizedWebp(file: File, maxWidth: number) {
  if (!file.type.startsWith('image/')) throw new Error('Selecione uma imagem válida.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (!blob) throw new Error('Não foi possível otimizar a imagem.');
  return blob;
}

export function PopupBannersView({ actor, search }: { actor: AdminActor; search: string }) {
  const [items, setItems] = useState<Campaign[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState<Campaign>(EMPTY); const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'desktop' | 'mobile' | null>(null);
  const [statusFilter, setStatusFilter] = useState('all'); const [audienceFilter, setAudienceFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all'); const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [preview, setPreview] = useState<Campaign | null>(null); const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [metrics, setMetrics] = useState<{ campaign: Campaign; items: Metric[] } | null>(null);

  const load = useCallback(async (next = '', append = false) => {
    setLoading(true); setError(null);
    try {
      const result = await api.request<CursorPage<Campaign>>(`/v1/admin/popup-banners?limit=25${next ? `&cursor=${encodeURIComponent(next)}` : ''}`);
      setItems((current) => append ? [...current, ...result.items] : result.items); setCursor(result.nextCursor || null);
    } catch (reason) { setError(reason); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => items.filter((item) => {
    const needle = search.trim().toLocaleLowerCase('pt-BR'); const state = statusOf(item);
    return (!needle || `${item.name} ${item.altText} ${item.destinationUrl}`.toLocaleLowerCase('pt-BR').includes(needle))
      && (statusFilter === 'all' || state === statusFilter)
      && (audienceFilter === 'all' || item.audiences.includes(audienceFilter as Audience))
      && (periodFilter === 'all' || state === periodFilter);
  }), [items, search, statusFilter, audienceFilter, periodFilter]);

  const update = <K extends keyof Campaign>(key: K, value: Campaign[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleAudience = (audience: Audience) => setForm((current) => {
    if (audience === 'all') return { ...current, audiences: ['all'] };
    const withoutAll = current.audiences.filter((value) => value !== 'all');
    return { ...current, audiences: withoutAll.includes(audience) ? withoutAll.filter((value) => value !== audience) : [...withoutAll, audience] };
  });
  const payload = (value: Campaign) => ({ ...value, startsAt: value.startsAt ? new Date(value.startsAt).toISOString() : '', endsAt: value.endsAt ? new Date(value.endsAt).toISOString() : '' });

  const upload = async (event: ChangeEvent<HTMLInputElement>, kind: 'desktop' | 'mobile') => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!storage || !auth?.currentUser) { setError(new Error('Firebase Storage não está configurado no painel.')); return; }
    setUploading(kind); setError(null);
    try {
      const blob = await optimizedWebp(file, kind === 'desktop' ? 1920 : 960);
      if (blob.size > 5 * 1024 * 1024) throw new Error('A imagem otimizada excede 5 MB.');
      const object = ref(storage, `admin/popup-banners/${auth.currentUser.uid}/${crypto.randomUUID()}-${kind}.webp`);
      await uploadBytes(object, blob, { contentType: 'image/webp', customMetadata: { ownerUid: auth.currentUser.uid } });
      update(kind === 'desktop' ? 'imageDesktopUrl' : 'imageMobileUrl', await getDownloadURL(object));
    } catch (reason) { setError(reason); } finally { setUploading(null); event.target.value = ''; }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null);
    try {
      await api.request(form.id ? `/v1/admin/popup-banners/${encodeURIComponent(form.id)}` : '/v1/admin/popup-banners', { method: form.id ? 'PATCH' : 'POST', body: payload(form) });
      setForm(EMPTY); await load();
    } catch (reason) { setError(reason); } finally { setSaving(false); }
  };
  const toggle = async (item: Campaign) => {
    setError(null); try { await api.request(`/v1/admin/popup-banners/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: payload({ ...asForm(item), active: !item.active }) }); await load(); } catch (reason) { setError(reason); }
  };
  const remove = async () => {
    if (!deleting) return; setSaving(true); setError(null);
    try { await api.request(`/v1/admin/popup-banners/${encodeURIComponent(deleting.id)}`, { method: 'DELETE', body: { confirmation: 'EXCLUIR' }, idempotencyKey: crypto.randomUUID() }); setDeleting(null); if (form.id === deleting.id) setForm(EMPTY); await load(); }
    catch (reason) { setError(reason); } finally { setSaving(false); }
  };
  const showMetrics = async (item: Campaign) => {
    setError(null); try { setMetrics(await api.request<{ campaign: Campaign; items: Metric[] }>(`/v1/admin/popup-banners/${encodeURIComponent(item.id)}/metrics`)); } catch (reason) { setError(reason); }
  };
  const showPreview = (item: Campaign, mode: 'desktop' | 'mobile' = 'desktop') => { setPreviewMode(mode); setPreview(item); };
  const ctr = (value: Campaign) => value.metrics.views ? `${((value.metrics.clicks / value.metrics.views) * 100).toFixed(1)}%` : '0%';

  return <div className="stack popup-admin">
    <div className="toolbar"><div><h2>Campanhas pop-up</h2><p>Segmente imagens responsivas sem bloquear o carregamento do aplicativo.</p></div><div className="page-actions"><button className="button button-quiet" onClick={() => void load()}><Icon name="refresh" size={17}/>Atualizar</button><button className="button button-primary" onClick={() => setForm(EMPTY)}><Icon name="plus" size={17}/>Nova campanha</button></div></div>
    {error ? <ErrorBox error={error}/> : null}
    <div className="popup-admin-layout">
      <form className="panel popup-form" onSubmit={(event) => void submit(event)}>
        <div className="panel-title"><div><span className="eyebrow">{form.id ? 'Editando campanha' : 'Nova campanha'}</span><h2>{form.id ? form.name : 'Criar banner pop-up'}</h2></div>{form.id && <button type="button" className="mini-button" onClick={() => setForm(EMPTY)}>Cancelar</button>}</div>
        <label>Nome interno<input required maxLength={120} value={form.name} onChange={(event) => update('name', event.target.value)}/></label>
        <div className="form-grid"><label>Imagem desktop<input type="file" accept="image/*" onChange={(event) => void upload(event, 'desktop')}/><small>{uploading === 'desktop' ? 'Otimizando e enviando…' : form.imageDesktopUrl ? 'Imagem enviada' : 'Obrigatória · WebP até 5 MB'}</small></label><label>Imagem mobile<input type="file" accept="image/*" onChange={(event) => void upload(event, 'mobile')}/><small>{uploading === 'mobile' ? 'Otimizando e enviando…' : form.imageMobileUrl ? 'Imagem enviada' : 'Opcional · fallback desktop'}</small></label></div>
        <label>Texto alternativo<input required maxLength={240} value={form.altText} onChange={(event) => update('altText', event.target.value)} placeholder="Descreva objetivamente a imagem"/></label>
        <div className="form-grid"><label>Link opcional<input value={form.destinationUrl} onChange={(event) => update('destinationUrl', event.target.value)} placeholder="/pagina ou https://…"/></label><label>Abertura<select value={form.openTarget} onChange={(event) => update('openTarget', event.target.value as Campaign['openTarget'])}><option value="same">Mesma janela</option><option value="new">Nova janela</option></select></label></div>
        <div className="form-grid"><label>Início<input type="datetime-local" value={form.startsAt} onChange={(event) => update('startsAt', event.target.value)}/></label><label>Término<input type="datetime-local" value={form.endsAt} onChange={(event) => update('endsAt', event.target.value)}/></label></div>
        <fieldset><legend>Públicos</legend><div className="choice-grid">{AUDIENCES.map(([value, label]) => <label key={value}><input type="checkbox" checked={form.audiences.includes(value)} onChange={() => toggleAudience(value)}/><span>{label}</span></label>)}</div></fieldset>
        <div className="form-grid"><label>Frequência<select value={form.frequency} onChange={(event) => update('frequency', event.target.value as Frequency)}>{FREQUENCIES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Intervalo (horas)<input type="number" min="1" max="8760" disabled={form.frequency !== 'custom'} value={form.frequencyHours} onChange={(event) => update('frequencyHours', Number(event.target.value))}/></label></div>
        <div className="form-grid"><label>Prioridade<input type="number" min="0" max="100" value={form.priority} onChange={(event) => update('priority', Number(event.target.value))}/></label><label className="toggle-row compact"><span><strong>Campanha ativa</strong><small>Respeita agendamento e segmentação</small></span><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)}/><i/></label></div>
        {form.imageDesktopUrl && <button type="button" className="popup-preview-trigger" onClick={() => showPreview(form)}><picture>{form.imageMobileUrl && <source media="(max-width: 600px)" srcSet={form.imageMobileUrl}/>}<img src={form.imageDesktopUrl} alt={form.altText}/></picture><span>Visualizar campanha</span></button>}
        {(form.id ? can(actor.permissions, 'content.update') : can(actor.permissions, 'content.create')) && <button className="button button-primary button-wide" disabled={saving || uploading !== null || !form.imageDesktopUrl || !form.audiences.length}>{saving ? 'Salvando…' : form.id ? 'Salvar alterações' : 'Criar campanha'}</button>}
      </form>
      <section className="panel popup-list"><div className="panel-title"><div><span className="eyebrow">Campanhas</span><h2>Publicação e desempenho</h2></div></div>
        <div className="filter-row"><select aria-label="Filtrar status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos os status</option><option value="active">Ativas</option><option value="inactive">Inativas</option></select><select aria-label="Filtrar público" value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value)}><option value="all">Todos os públicos</option>{AUDIENCES.slice(1).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Filtrar período" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}><option value="all">Qualquer período</option><option value="scheduled">Agendadas</option><option value="active">Em exibição</option><option value="ended">Encerradas</option></select></div>
        {loading && !items.length ? <LoadingTable/> : !filtered.length ? <EmptyState/> : <div className="popup-campaign-list">{filtered.map((item) => <article key={item.id}><img src={item.imageMobileUrl || item.imageDesktopUrl} alt=""/><div className="popup-campaign-copy"><div><StatusBadge value={statusOf(item)}/><small>Prioridade {item.priority}</small></div><h3>{item.name}</h3><p>{item.altText}</p><small>{item.audiences.join(', ')} · atualizado {formatDate(item.updatedAt)}</small><div className="popup-metrics"><span><strong>{formatNumber(item.metrics.views)}</strong> visualizações</span><span><strong>{formatNumber(item.metrics.clicks)}</strong> cliques</span><span><strong>{ctr(item)}</strong> CTR</span></div><div className="row-actions"><button className="mini-button" onClick={() => showPreview(item)}>Prévia</button><button className="mini-button" onClick={() => void showMetrics(item)}>Métricas</button>{can(actor.permissions, 'content.update') && <><button className="mini-button" onClick={() => setForm(asForm(item))}>Editar</button><button className="mini-button" onClick={() => void toggle(item)}>{item.active ? 'Desativar' : 'Ativar'}</button></>}{can(actor.permissions, 'content.delete') && <button className="mini-button danger-text" onClick={() => setDeleting(item)}>Excluir</button>}</div></div></article>)}</div>}
        {cursor && <div className="load-more"><button className="button button-quiet" disabled={loading} onClick={() => void load(cursor, true)}>Carregar mais</button></div>}
      </section>
    </div>
    {preview && <div className="popup-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}><section className={`popup-preview-dialog ${previewMode === 'mobile' ? 'is-mobile' : ''}`} role="dialog" aria-modal="true" aria-label="Prévia do banner"><div className="popup-preview-modes" role="group" aria-label="Dispositivo da prévia"><button type="button" className={previewMode === 'desktop' ? 'is-active' : ''} onClick={() => setPreviewMode('desktop')}>Desktop</button><button type="button" className={previewMode === 'mobile' ? 'is-active' : ''} onClick={() => setPreviewMode('mobile')}>Celular</button></div><button type="button" className="popup-preview-close" aria-label="Fechar" onClick={() => setPreview(null)}><Icon name="close"/></button><img src={previewMode === 'mobile' && preview.imageMobileUrl ? preview.imageMobileUrl : preview.imageDesktopUrl} alt={preview.altText}/></section></div>}
    {metrics && <div className="modal-backdrop"><section className="modal popup-metrics-modal"><div className="modal-title"><div><span className="eyebrow">Métricas deduplicadas</span><h2>{metrics.campaign.name}</h2></div><button className="icon-button" onClick={() => setMetrics(null)} aria-label="Fechar"><Icon name="close"/></button></div><div className="popup-metrics-summary"><strong>{formatNumber(metrics.campaign.metrics.views)} visualizações</strong><strong>{formatNumber(metrics.campaign.metrics.clicks)} cliques</strong><strong>{ctr(metrics.campaign)} CTR</strong></div>{metrics.items.length ? <div className="table-scroll"><table><thead><tr><th>Data</th><th>Plataforma</th><th>Visualizações</th><th>Cliques</th><th>Fechamentos</th></tr></thead><tbody>{metrics.items.map((item) => <tr key={item.id}><td>{item.date}</td><td>{item.platform}</td><td>{formatNumber(item.views)}</td><td>{formatNumber(item.clicks)}</td><td>{formatNumber(item.closes)}</td></tr>)}</tbody></table></div> : <EmptyState title="Ainda sem métricas"/>}</section></div>}
    <ConfirmDialog open={!!deleting} title="Excluir campanha" message="A campanha e sua projeção pública serão removidas. Métricas históricas permanecem para auditoria." expected="EXCLUIR" busy={saving} onClose={() => setDeleting(null)} onConfirm={() => void remove()}/>
  </div>;
}
