import type { ReactNode } from 'react';
import { ApiError } from '@maratonou/api-client';
import type { AdminActor } from './api';
import { sections, type IconName, type Section } from './admin-model';

const paths: Record<IconName, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  content: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m9 9 6 3-6 3Z"/></>,
  comments: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 9h8M8 13h5"/></>,
  reports: <><path d="M4 21V5a2 2 0 0 1 2-2h11l3 4-3 4H6"/><path d="M12 7h.01"/></>,
  notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21H9.6v-.09a1.7 1.7 0 0 0-1.1-1.51 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3V9.6h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.37.21.78.16 1.18H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></>,
  integrations: <><path d="M8 12h8M12 8v8"/><path d="M7 3h3v4H7a4 4 0 0 0 0 8h3v4H7A8 8 0 0 1 7 3ZM17 3h-3v4h3a4 4 0 0 1 0 8h-3v4h3a8 8 0 0 0 0-16Z"/></>,
  audit: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
  admins: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M9 12l2 2 4-4"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  close: <path d="M18 6 6 18M6 6l12 12"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  warning: <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = error instanceof ApiError ? error : null;
  return <div className="feedback feedback-error" role="alert">
    <span className="feedback-icon"><Icon name="warning" /></span>
    <div><strong>Não foi possível carregar</strong><p>{error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'}</p>{apiError?.requestId && <small>ID: {apiError.requestId}</small>}</div>
    {onRetry && <button className="button button-quiet" onClick={onRetry}>Tentar novamente</button>}
  </div>;
}

export function EmptyState({ title = 'Nenhum registro encontrado', message = 'Os dados aparecerão aqui quando estiverem disponíveis.', action }: { title?: string; message?: string; action?: ReactNode }) {
  return <div className="empty-state"><span><Icon name="content" size={24} /></span><strong>{title}</strong><p>{message}</p>{action}</div>;
}

export function LoadingTable() {
  return <div className="skeleton-table" aria-label="Carregando"><span/><span/><span/><span/></div>;
}

export function StatusBadge({ value }: { value: unknown }) {
  const text = String(value || 'indefinido');
  const positive = ['active', 'published', 'resolved', 'sent', 'configured', 'true'].includes(text.toLowerCase());
  const danger = ['banned', 'suspended', 'inactive', 'failed', 'hidden', 'false'].includes(text.toLowerCase());
  return <span className={`status ${positive ? 'positive' : danger ? 'danger' : 'neutral'}`}><i/>{text}</span>;
}

export function ConfirmDialog({ open, title, message, expected, busy, onClose, onConfirm }: { open: boolean; title: string; message: string; expected: string; busy?: boolean; onClose: () => void; onConfirm: () => void }) {
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="modal-title"><div><span className="eyebrow">Confirmação necessária</span><h2 id="confirm-title">{title}</h2></div><button className="icon-button" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button></div>
      <p>{message}</p><p className="confirmation-copy">Confirme a ação <strong>{expected}</strong>.</p>
      <div className="modal-actions"><button className="button button-quiet" onClick={onClose}>Cancelar</button><button className="button button-danger" disabled={busy} onClick={onConfirm}>{busy ? 'Processando…' : 'Confirmar'}</button></div>
    </section>
  </div>;
}

export function AdminLayout({ actor, current, onSection, search, onSearch, theme, onTheme, collapsed, onCollapsed, onLogout, children }: {
  actor: AdminActor;
  current: Section;
  onSection: (section: Section) => void;
  search: string;
  onSearch: (value: string) => void;
  theme: 'dark' | 'light';
  onTheme: () => void;
  collapsed: boolean;
  onCollapsed: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const active = sections.find((entry) => entry.id === current)!;
  const visible = sections.filter((entry) => actor.permissions.includes('*') || actor.permissions.includes(entry.permission));
  return <div className={`admin-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className="sidebar">
      <div className="brand-row"><button className="brand" aria-label="Ir para visão geral" onClick={() => onSection('dashboard')}><span className="brand-mark">M</span><span className="brand-copy">Maratonou <small>Admin</small></span></button><button className="icon-button collapse-button" onClick={onCollapsed} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}><Icon name="menu" /></button></div>
      <nav className="sidebar-nav" aria-label="Administração">{visible.map((item) => <button title={item.label} className={current === item.id ? 'active' : ''} key={item.id} onClick={() => onSection(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav>
      <div className="identity"><span className="avatar">{actor.name.slice(0, 1).toUpperCase()}</span><div><strong>{actor.name}</strong><span>{actor.email}</span><small>{actor.role.replace('_', ' ')}</small></div><button className="icon-button" aria-label="Sair" title="Sair" onClick={onLogout}><Icon name="logout" /></button></div>
    </aside>
    <div className="admin-workspace">
      <header className="topbar"><button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={onCollapsed}><Icon name="menu" /></button><div className="breadcrumb"><span>Administração</span><Icon name="chevron" size={14}/><strong>{active.label}</strong></div><label className="global-search"><Icon name="search" size={18}/><input aria-label="Buscar nesta página" placeholder={`Buscar em ${active.label.toLowerCase()}…`} value={search} onChange={(event) => onSearch(event.target.value)}/><kbd>⌘ K</kbd></label><button className="icon-button" aria-label={`Ativar tema ${theme === 'dark' ? 'claro' : 'escuro'}`} onClick={onTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button></header>
      <main className="content"><div className="page-intro"><div><span className="eyebrow">{active.description}</span><h1>{active.label}</h1></div></div>{children}</main>
    </div>
  </div>;
}
