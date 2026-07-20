export type Section =
  | 'dashboard'
  | 'users'
  | 'content'
  | 'comments'
  | 'reports'
  | 'notifications'
  | 'settings'
  | 'integrations'
  | 'audit'
  | 'admins';

export type SectionDefinition = {
  id: Section;
  label: string;
  description: string;
  permission: string;
  icon: IconName;
};

export type IconName =
  | 'dashboard'
  | 'users'
  | 'content'
  | 'comments'
  | 'reports'
  | 'notifications'
  | 'settings'
  | 'integrations'
  | 'audit'
  | 'admins'
  | 'search'
  | 'menu'
  | 'sun'
  | 'moon'
  | 'refresh'
  | 'logout'
  | 'chevron'
  | 'close'
  | 'check'
  | 'warning'
  | 'plus'
  | 'send'
  | 'more';

export const sections: SectionDefinition[] = [
  { id: 'dashboard', label: 'Visão geral', description: 'Métricas e atividade recente', permission: 'dashboard.read', icon: 'dashboard' },
  { id: 'users', label: 'Usuários', description: 'Contas e assinaturas', permission: 'users.read', icon: 'users' },
  { id: 'content', label: 'Conteúdo', description: 'Curadoria e destaques', permission: 'content.read', icon: 'content' },
  { id: 'comments', label: 'Comentários', description: 'Moderação da comunidade', permission: 'comments.read', icon: 'comments' },
  { id: 'reports', label: 'Denúncias', description: 'Fila de análise', permission: 'reports.read', icon: 'reports' },
  { id: 'notifications', label: 'Notificações', description: 'Comunicados e automações', permission: 'notifications.read', icon: 'notifications' },
  { id: 'settings', label: 'Configurações', description: 'Comportamento do aplicativo', permission: 'settings.read', icon: 'settings' },
  { id: 'integrations', label: 'Integrações', description: 'Serviços externos', permission: 'integrations.read', icon: 'integrations' },
  { id: 'audit', label: 'Auditoria', description: 'Histórico administrativo', permission: 'audit.read', icon: 'audit' },
  { id: 'admins', label: 'Administradores', description: 'Funções e permissões', permission: 'admins.read', icon: 'admins' },
];

export const can = (permissions: string[], permission: string) =>
  permissions.includes('*') || permissions.includes(permission);

export function formatDate(value: unknown, includeTime = true) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    ...(includeTime ? { timeStyle: 'short' as const } : {}),
  }).format(date);
}

export function formatNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat('pt-BR').format(parsed) : '—';
}

export function humanize(value: string) {
  const labels: Record<string, string> = {
    usersTotal: 'Usuários',
    proMembersTotal: 'Membros PRO',
    activityTotal: 'Atividades',
    commentsTotal: 'Comentários',
    reportsTotal: 'Denúncias',
    openReportsTotal: 'Denúncias abertas',
    notificationsTotal: 'Notificações',
    pendingNotificationJobs: 'Envios pendentes',
    reviewsTotal: 'Avaliações',
    ratingsTotal: 'Notas publicadas',
  };
  return labels[value] || value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

export function stringValue(value: unknown) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
