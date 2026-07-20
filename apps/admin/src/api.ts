import { MaratonouApiClient } from '@maratonou/api-client';
import { appCheckToken, authToken } from './firebase';

export const api = new MaratonouApiClient({
  baseUrl: import.meta.env.VITE_ADMIN_API_URL || 'http://127.0.0.1:5001/demo-maratonou/us-central1/centralApi',
  getAuthToken: authToken,
  getAppCheckToken: appCheckToken,
});

export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'editor' | 'support';
export type AdminActor = {
  uid: string;
  email: string;
  name: string;
  role: AdminRole;
  permissions: string[];
};

export type Dashboard = {
  metrics: Record<string, number> | null;
  metricsUpdatedAt: string | null;
  recentAudit: Array<Record<string, unknown>>;
  unavailable: string[];
};
