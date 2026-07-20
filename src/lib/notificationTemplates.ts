export type NotificationTemplateKey = 'new_episode' | 'streaming_available' | 'pro_reminder';

export type NotificationTemplate = {
  enabled: boolean;
  title: string;
  body: string;
};

export type NotificationTemplates = Record<NotificationTemplateKey, NotificationTemplate>;

export const NOTIFICATION_TEMPLATE_VARIABLES: Record<NotificationTemplateKey, string[]> = {
  new_episode: ['title', 'season', 'episode', 'episodeName', 'date', 'days'],
  streaming_available: ['title', 'platform', 'date'],
  pro_reminder: ['title', 'listName', 'date', 'days'],
};

export const DEFAULT_NOTIFICATION_TEMPLATES: NotificationTemplates = {
  new_episode: {
    enabled: true,
    title: '📺 Novo episódio de {{title}}',
    body: '{{season}}X{{episode}} {{episodeName}} estreia {{days}} ({{date}}).',
  },
  streaming_available: {
    enabled: true,
    title: '{{title}} chegou ao {{platform}}',
    body: 'Já está disponível para assistir no {{platform}}.',
  },
  pro_reminder: {
    enabled: true,
    title: '{{listName}}',
    body: '{{title}} está chegando na data que você escolheu.',
  },
};

const TEMPLATE_KEY = 'sec_notification_templates_v1';
const ALLOWED_PLACEHOLDER = /{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g;

function normalizeTemplate(
  key: NotificationTemplateKey,
  value?: Partial<NotificationTemplate>,
): NotificationTemplate {
  const fallback = DEFAULT_NOTIFICATION_TEMPLATES[key];
  return {
    enabled: value?.enabled !== false,
    title: typeof value?.title === 'string' && value.title.trim() ? value.title : fallback.title,
    body: typeof value?.body === 'string' && value.body.trim() ? value.body : fallback.body,
  };
}

export function normalizeNotificationTemplates(value?: Partial<NotificationTemplates> | null): NotificationTemplates {
  return {
    new_episode: normalizeTemplate('new_episode', value?.new_episode),
    streaming_available: normalizeTemplate('streaming_available', value?.streaming_available),
    pro_reminder: normalizeTemplate('pro_reminder', value?.pro_reminder),
  };
}

export function validateNotificationTemplate(key: NotificationTemplateKey, template: NotificationTemplate): string | null {
  if (!template.title.trim()) return 'O título não pode ficar vazio.';
  if (!template.body.trim()) return 'A mensagem não pode ficar vazia.';
  const allowed = new Set(NOTIFICATION_TEMPLATE_VARIABLES[key]);
  const text = `${template.title}\n${template.body}`;
  for (const match of text.matchAll(ALLOWED_PLACEHOLDER)) {
    if (!allowed.has(match[1])) return `A variável {{${match[1]}}} não é permitida neste modelo.`;
  }
  return null;
}

export function renderNotificationTemplate(
  template: NotificationTemplate,
  values: Record<string, string | number | null | undefined>,
): { title: string; body: string } {
  const render = (text: string) => text
    .replace(ALLOWED_PLACEHOLDER, (_match, name: string) => String(values[name] ?? ''))
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return { title: render(template.title), body: render(template.body) };
}

export const notificationTemplateStore = {
  get(): NotificationTemplates {
    if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_TEMPLATES;
    try {
      const stored = JSON.parse(localStorage.getItem(TEMPLATE_KEY) || 'null');
      return normalizeNotificationTemplates(stored);
    } catch {
      return DEFAULT_NOTIFICATION_TEMPLATES;
    }
  },
  set(templates: NotificationTemplates) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(normalizeNotificationTemplates(templates))); } catch {}
  },
};
