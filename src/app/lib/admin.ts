export function getAdminEmail() {
  return (import.meta.env.VITE_ADMIN_EMAIL as string) || '';
}

export function isAdminEmail(email?: string | null) {
  const adminEmail = getAdminEmail().trim().toLowerCase();
  if (!adminEmail) return false;
  return (email || '').trim().toLowerCase() === adminEmail;
}
