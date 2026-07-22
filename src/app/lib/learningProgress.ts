import type { AppUserIdentity } from './internProfiles';

export interface LearningLessonMeta {
  id: string;
  title: string;
}

export interface LearningProgressRecord {
  lessonId: string;
  lessonTitle?: string;
  completed: boolean;
  completedAt?: string | null;
}

const STORAGE_PREFIX = 'aws-learning-lab-learning-progress';

function getBackendBaseUrl() {
  const startLabUrl = (import.meta.env.VITE_LOCAL_START_LAB_URL as string) || '';
  const trimmed = startLabUrl.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/start-lab\/?$/, '');
}

function getEndpoint(path: string) {
  const base = getBackendBaseUrl();
  return base ? `${base}${path}` : '';
}

function cacheKeyForUser(user: AppUserIdentity) {
  return `${STORAGE_PREFIX}:${user.id}:${user.email.trim().toLowerCase()}`;
}

function readCachedRecords(user: AppUserIdentity): LearningProgressRecord[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(cacheKeyForUser(user));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as LearningProgressRecord[];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item.lessonId === 'string') : [];
  } catch {
    return [];
  }
}

function writeCachedRecords(user: AppUserIdentity, records: LearningProgressRecord[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(cacheKeyForUser(user), JSON.stringify(records));
}

function upsertCachedRecord(user: AppUserIdentity, record: LearningProgressRecord) {
  const records = readCachedRecords(user);
  const index = records.findIndex((item) => item.lessonId === record.lessonId);
  if (index >= 0) {
    records[index] = { ...records[index], ...record };
  } else {
    records.push(record);
  }
  writeCachedRecords(user, records);
}

function mapBackendRecord(row: any): LearningProgressRecord {
  return {
    lessonId: String(row.lesson_id || row.lessonId || ''),
    lessonTitle: row.lesson_title || row.lessonTitle || '',
    completed: Boolean(row.completed),
    completedAt: row.completed_at || row.completedAt || null,
  };
}

function toRequestPayload(user: AppUserIdentity, lesson: LearningLessonMeta, completed: boolean) {
  return {
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    completed,
  };
}

export async function loadCompletedLessonIds(user: AppUserIdentity): Promise<string[]> {
  const endpoint = getEndpoint(`/learning-progress?userId=${encodeURIComponent(user.id)}&userEmail=${encodeURIComponent(user.email)}&userName=${encodeURIComponent(user.name)}`);

  if (endpoint) {
    try {
      const res = await fetch(endpoint, { credentials: 'omit' });
      if (!res.ok) throw new Error(`Learning progress request failed with ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data?.progress) ? data.progress : Array.isArray(data) ? data : [];
      const ids = rows
        .map(mapBackendRecord)
        .filter((record) => record.completed)
        .map((record) => record.lessonId)
        .filter(Boolean);
      writeCachedRecords(user, rows.map(mapBackendRecord));
      return ids;
    } catch {
      // Fall back to cache below.
    }
  }

  return readCachedRecords(user).filter((record) => record.completed).map((record) => record.lessonId);
}

export async function markLessonComplete(user: AppUserIdentity, lesson: LearningLessonMeta): Promise<void> {
  const endpoint = getEndpoint('/learning-progress');
  const payload = toRequestPayload(user, lesson, true);

  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'omit',
      });

      if (!res.ok) throw new Error(`Learning progress save failed with ${res.status}`);
      const data = await res.json();
      const record = mapBackendRecord(data?.progress || data?.record || data);
      upsertCachedRecord(user, record);
      return;
    } catch {
      // Fall back to cache below.
    }
  }

  upsertCachedRecord(user, {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    completed: true,
    completedAt: new Date().toISOString(),
  });
}
