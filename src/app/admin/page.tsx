import { redirect } from 'next/navigation';

/** The administrative application has its own build and deployment. */
export default function LegacyAdminRedirect() {
  redirect(process.env.ADMIN_APP_URL || 'https://admin.maratonou.com');
}
