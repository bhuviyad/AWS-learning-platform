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
    ? profile.appUserId
    : createProfileId(appUserName, appUserEmail);

  return {
    id: typeof profile.id === 'string' && profile.id.trim() ? profile.id : createProfileId(appUserId, appUserEmail),
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

export function readInternProfiles(): InternProfile[] {
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

function writeInternProfiles(profiles: InternProfile[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function listInternProfiles() {
  return [...readInternProfiles()].sort((a, b) => a.appUserName.localeCompare(b.appUserName));
}

export function findInternProfileById(profileId: string) {
  return listInternProfiles().find((profile) => profile.id === profileId) || null;
}

export function findInternProfileForUser(userId: string, email?: string) {
  const normalizedEmail = email?.trim().toLowerCase();
  const profiles = listInternProfiles();

  const byId = profiles.find((profile) => profile.appUserId === userId);
  if (byId) return byId;

  if (normalizedEmail) {
    const byEmail = profiles.find((profile) => profile.appUserEmail === normalizedEmail || profile.awsIdentityCenterEmail === normalizedEmail);
    if (byEmail) return byEmail;
  }

  return null;
}

export function ensureInternProfileForUser(user: AppUserIdentity) {
  const existing = findInternProfileForUser(user.id, user.email);
  if (existing) return existing;

  const newProfile: InternProfile = normalizeProfile({
    appUserId: user.id,
    appUserName: user.name,
    appUserEmail: user.email,
  });

  const next = [...readInternProfiles(), newProfile];
  writeInternProfiles(next);
  return newProfile;
}

export function upsertInternProfile(input: Partial<InternProfile> & { appUserId: string; appUserEmail: string; appUserName: string }) {
  const profiles = readInternProfiles();
  const normalized = normalizeProfile({ ...input, id: input.id || createProfileId(input.appUserId, input.appUserEmail) });
  const index = profiles.findIndex((profile) => profile.id === normalized.id || profile.appUserId === normalized.appUserId || profile.appUserEmail === normalized.appUserEmail);

  if (index >= 0) {
    profiles[index] = {
      ...profiles[index],
      ...normalized,
      createdAt: profiles[index].createdAt,
      updatedAt: nowIso(),
    };
  } else {
    profiles.push(normalized);
  }

  writeInternProfiles(profiles);
  return normalized;
}

export function deleteInternProfile(profileId: string) {
  const next = readInternProfiles().filter((profile) => profile.id !== profileId);
  writeInternProfiles(next);
}

export function identityForLabSession(user: AppUserIdentity) {
  const profile = ensureInternProfileForUser(user);
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
