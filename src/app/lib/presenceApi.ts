import type { AppUserIdentity } from './internProfiles';

export type PlatformPage = 'learning' | 'lab' | 'help' | 'interns';

export interface PresenceUpdate {
  currentPage?: PlatformPage;
  currentLessonId?: string | null;
  currentLessonTitle?: string | null;
  login?: boolean;
}

function getBackendBaseUrl() {
  const startLabUrl = (import.meta.env.VITE_LOCAL_START_LAB_URL as string) || '';
  return startLabUrl.trim().replace(/\/start-lab\/?$/, '');
}

async function postPresence(path: string, body: unknown) {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) return;

  try {
    await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      keepalive: true,
    });
  } catch {
    // Presence telemetry must never block the application.
  }
}

export function updateUserPresence(user: AppUserIdentity, update: PresenceUpdate = {}) {
  return postPresence('/presence', {
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    currentPage: update.currentPage,
    currentLessonId: update.currentLessonId,
    currentLessonTitle: update.currentLessonTitle,
    login: Boolean(update.login),
  });
}

export function signOutUserPresence(user: AppUserIdentity) {
  return postPresence('/presence/logout', {
    userId: user.id,
  });
}
