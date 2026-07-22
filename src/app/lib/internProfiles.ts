export type InternProfileStatus = 'active' | 'disabled' | 'suspended';

export interface InternProfile {
  id: string;
  appUserId: string;
  appUserName: string;
  appUserEmail: string;
  awsIdentityCenterUsername: string;
  awsIdentityCenterEmail: string;
  awsAccountId: string;
  permissionSetName: string;
  status: InternProfileStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppUserIdentity {
  id: string;
  name: string;
  email: string;
}

export interface LabIdentityContext {
  id: string;
  name: string;
  email: string;
  awsIdentityCenterUsername?: string;
  awsIdentityCenterEmail?: string;
  permissionSetName?: string;
  awsAccountId?: string;
}

const STORAGE_KEY = 'aws-learning-lab-intern-profiles';
const DEFAULT_ACCOUNT_ID = '483591406604';
const DEFAULT_PERMISSION_SET = 'LearningLabSandbox';

function nowIso() {
  return new Date().toISOString();
}

function createProfileId(userId: string, email: string) {
  const suffix = email.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `intern-${userId || suffix || 'profile'}`;
}

function inferIdentityCenterUsername(email: string) {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.split('@')[0] || trimmed;
}

function normalizeProfile(profile: Partial<InternProfile> & { appUserId?: string; appUserEmail?: string; appUserName?: string }): InternProfile {
  const appUserEmail = typeof profile.appUserEmail === 'string' ? profile.appUserEmail.trim().toLowerCase() : '';
  const appUserName = typeof profile.appUserName === 'string' ? profile.appUserName.trim() : 'Intern';
  const appUserId = typeof profile.appUserId === 'string' && profile.appUserId.trim()
    ? profile.appUserId.trim()
    : createProfileId(appUserName, appUserEmail);

  return {
    id: typeof profile.id === 'string' && profile.id.trim() ? profile.id.trim() : createProfileId(appUserId, appUserEmail),
    appUserId,
    appUserName,
    appUserEmail,
    awsIdentityCenterUsername: typeof profile.awsIdentityCenterUsername === 'string' && profile.awsIdentityCenterUsername.trim()
      ? profile.awsIdentityCenterUsername.trim()
      : inferIdentityCenterUsername(appUserEmail),
    awsIdentityCenterEmail: typeof profile.awsIdentityCenterEmail === 'string' && profile.awsIdentityCenterEmail.trim()
      ? profile.awsIdentityCenterEmail.trim().toLowerCase()
      : appUserEmail,
    awsAccountId: typeof profile.awsAccountId === 'string' && profile.awsAccountId.trim()
      ? profile.awsAccountId.trim()
      : DEFAULT_ACCOUNT_ID,
    permissionSetName: typeof profile.permissionSetName === 'string' && profile.permissionSetName.trim()
      ? profile.permissionSetName.trim()
      : DEFAULT_PERMISSION_SET,
    status: profile.status === 'disabled' || profile.status === 'suspended' ? profile.status : 'active',
    notes: typeof profile.notes === 'string' ? profile.notes : '',
    createdAt: typeof profile.createdAt === 'string' && profile.createdAt.trim() ? profile.createdAt : nowIso(),
    updatedAt: nowIso(),
  };
}

function getBackendBaseUrl() {
  const startLabUrl = (import.meta.env.VITE_LOCAL_START_LAB_URL as string) || '';
  const trimmed = startLabUrl.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/start-lab\/?$/, '');
}

function getProfilesEndpoint(path = '') {
  const base = getBackendBaseUrl();
  return base ? `${base}${path}` : '';
}

function readCachedProfiles(): InternProfile[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as InternProfile[];
    return Array.isArray(parsed) ? parsed.map((profile) => normalizeProfile(profile)) : [];
  } catch {
    return [];
  }
}

function writeCachedProfiles(profiles: InternProfile[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

function upsertCachedProfile(profile: InternProfile) {
  const profiles = readCachedProfiles();
  const index = profiles.findIndex((item) => item.id === profile.id || item.appUserId === profile.appUserId || item.appUserEmail === profile.appUserEmail);
  if (index >= 0) {
    profiles[index] = { ...profiles[index], ...profile };
  } else {
    profiles.push(profile);
  }
  writeCachedProfiles(profiles);
}

function removeCachedProfile(profileId: string) {
  writeCachedProfiles(readCachedProfiles().filter((profile) => profile.id !== profileId));
}

function mapBackendProfile(row: any): InternProfile {
  return normalizeProfile({
    id: row.id,
    appUserId: row.app_user_id || row.appUserId || row.app_user_email || row.appUserEmail || '',
    appUserName: row.display_name || row.appUserName || 'Intern',
    appUserEmail: row.app_user_email || row.appUserEmail || '',
    awsIdentityCenterUsername: row.aws_identity_center_username || row.awsIdentityCenterUsername || '',
    awsIdentityCenterEmail: row.aws_identity_center_email || row.awsIdentityCenterEmail || '',
    awsAccountId: row.aws_account_id || row.awsAccountId || DEFAULT_ACCOUNT_ID,
    permissionSetName: row.permission_set_name || row.permissionSetName || DEFAULT_PERMISSION_SET,
    status: row.status || 'active',
    notes: row.notes || '',
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  });
}

function toBackendPayload(profile: InternProfile) {
  return {
    id: profile.id,
    app_user_id: profile.appUserId,
    app_user_email: profile.appUserEmail,
    display_name: profile.appUserName,
    aws_identity_center_username: profile.awsIdentityCenterUsername,
    aws_identity_center_email: profile.awsIdentityCenterEmail,
    aws_account_id: profile.awsAccountId,
    permission_set_name: profile.permissionSetName,
    status: profile.status,
    notes: profile.notes,
  };
}

async function fetchBackendProfiles(): Promise<InternProfile[] | null> {
  const endpoint = getProfilesEndpoint('/intern-profiles');
  if (!endpoint) return null;

  try {
    const res = await fetch(endpoint, { credentials: 'omit' });
    if (!res.ok) {
      throw new Error(`Intern profiles request failed with ${res.status}`);
    }

    const data = await res.json();
    const rows = Array.isArray(data?.profiles) ? data.profiles : Array.isArray(data) ? data : [];
    const profiles = rows.map(mapBackendProfile).sort((a, b) => a.appUserName.localeCompare(b.appUserName));
    writeCachedProfiles(profiles);
    return profiles;
  } catch {
    return null;
  }
}

async function saveBackendProfile(profile: InternProfile): Promise<InternProfile | null> {
  const endpoint = getProfilesEndpoint('/intern-profiles');
  if (!endpoint) return null;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: toBackendPayload(profile) }),
      credentials: 'omit',
    });

    if (!res.ok) {
      throw new Error(`Intern profile save failed with ${res.status}`);
    }

    const data = await res.json();
    const saved = mapBackendProfile(data.profile ?? data);
    upsertCachedProfile(saved);
    return saved;
  } catch {
    return null;
  }
}

async function deleteBackendProfile(profileId: string): Promise<boolean> {
  const endpoint = getProfilesEndpoint(`/intern-profiles/${encodeURIComponent(profileId)}`);
  if (!endpoint) return false;

  try {
    const res = await fetch(endpoint, {
      method: 'DELETE',
      credentials: 'omit',
    });

    if (!res.ok) {
      throw new Error(`Intern profile delete failed with ${res.status}`);
    }

    removeCachedProfile(profileId);
    return true;
  } catch {
    return false;
  }
}

export function listInternProfilesLocal() {
  return [...readCachedProfiles()].sort((a, b) => a.appUserName.localeCompare(b.appUserName));
}

export function findInternProfileForUser(userId: string, email?: string) {
  const normalizedEmail = email?.trim().toLowerCase();
  const profiles = listInternProfilesLocal();

  const byId = profiles.find((profile) => profile.appUserId === userId);
  if (byId) return byId;

  if (normalizedEmail) {
    const byEmail = profiles.find((profile) => profile.appUserEmail === normalizedEmail || profile.awsIdentityCenterEmail === normalizedEmail);
    if (byEmail) return byEmail;
  }

  return null;
}

export async function listInternProfiles(): Promise<InternProfile[]> {
  const remote = await fetchBackendProfiles();
  return remote || listInternProfilesLocal();
}

export async function ensureInternProfileForUser(user: AppUserIdentity): Promise<InternProfile> {
  const profiles = await listInternProfiles();
  const normalizedEmail = user.email.trim().toLowerCase();

  const existing = profiles.find((profile) =>
    profile.appUserId === user.id ||
    profile.appUserEmail === normalizedEmail ||
    profile.awsIdentityCenterEmail === normalizedEmail
  );

  if (existing) {
    upsertCachedProfile(existing);
    return existing;
  }

  const draft = normalizeProfile({
    appUserId: user.id,
    appUserName: user.name,
    appUserEmail: user.email,
  });

  const saved = await upsertInternProfile(draft);
  return saved;
}

export async function upsertInternProfile(input: Partial<InternProfile> & { appUserId: string; appUserEmail: string; appUserName: string }): Promise<InternProfile> {
  const normalized = normalizeProfile({
    ...input,
    id: input.id || createProfileId(input.appUserId, input.appUserEmail),
  });

  const saved = await saveBackendProfile(normalized);
  if (saved) {
    return saved;
  }

  upsertCachedProfile(normalized);
  return normalized;
}

export async function deleteInternProfile(profileId: string) {
  const deleted = await deleteBackendProfile(profileId);
  if (!deleted) {
    removeCachedProfile(profileId);
  }
}

export async function resolveLabIdentity(user: AppUserIdentity): Promise<LabIdentityContext> {
  const profiles = await listInternProfiles();
  const normalizedEmail = user.email.trim().toLowerCase();
  const profile = profiles.find((item) =>
    item.appUserId === user.id ||
    item.appUserEmail === normalizedEmail ||
    item.awsIdentityCenterEmail === normalizedEmail
  ) || null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    awsIdentityCenterUsername: profile?.awsIdentityCenterUsername,
    awsIdentityCenterEmail: profile?.awsIdentityCenterEmail,
    awsAccountId: profile?.awsAccountId,
    permissionSetName: profile?.permissionSetName,
  };
}

export function identityForLabSession(user: AppUserIdentity) {
  const profile = findInternProfileForUser(user.id, user.email) || normalizeProfile({
    appUserId: user.id,
    appUserName: user.name,
    appUserEmail: user.email,
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    awsIdentityCenterUsername: profile.awsIdentityCenterUsername,
    awsIdentityCenterEmail: profile.awsIdentityCenterEmail,
    awsAccountId: profile.awsAccountId,
    permissionSetName: profile.permissionSetName,
  };
}
