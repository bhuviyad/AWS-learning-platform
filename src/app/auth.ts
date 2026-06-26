export interface AuthUser {
  name: string;
  email: string;
  password: string;
}

const USERS_STORAGE_KEY = 'aws-learning-lab-users';
const CURRENT_USER_STORAGE_KEY = 'aws-learning-lab-current-user';

export interface AuthResult {
  success: boolean;
  message: string;
  user?: {
    name: string;
    email: string;
  };
}

function readStoredUsers(): AuthUser[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const rawUsers = window.localStorage.getItem(USERS_STORAGE_KEY);

  if (!rawUsers) {
    return [];
  }

  try {
    const parsedUsers = JSON.parse(rawUsers) as AuthUser[];
    return Array.isArray(parsedUsers) ? parsedUsers : [];
  } catch {
    return [];
  }
}

function writeStoredUsers(users: AuthUser[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

export function readCurrentUser(): { name: string; email: string } | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawUser = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    const parsedUser = JSON.parse(rawUser) as { name?: unknown; email?: unknown };

    if (typeof parsedUser.name !== 'string' || typeof parsedUser.email !== 'string') {
      return null;
    }

    return {
      name: parsedUser.name,
      email: parsedUser.email,
    };
  } catch {
    return null;
  }
}

export function writeCurrentUser(user: { name: string; email: string }) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearCurrentUser() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}

function createLocalAccount(name: string, email: string, password: string): AuthResult {
  const existingUsers = readStoredUsers();

  if (existingUsers.some((user) => user.email.toLowerCase() === email)) {
    return {
      success: false,
      message: 'An account with this email already exists. Please sign in instead.',
    };
  }

  const nextUsers = [...existingUsers, { name, email, password }];
  writeStoredUsers(nextUsers);

  return {
    success: true,
    message: 'Account created locally. You can now sign in.',
    user: {
      name,
      email,
    },
  };
}

function authenticateLocalUser(email: string, password: string): AuthResult {
  const matchingUser = readStoredUsers().find((user) => user.email.toLowerCase() === email);

  if (!matchingUser) {
    return {
      success: false,
      message: 'No account found for that email. Please sign up first.',
    };
  }

  if (matchingUser.password !== password) {
    return {
      success: false,
      message: 'Incorrect password. Please try again.',
    };
  }

  return {
    success: true,
    message: 'Signed in successfully.',
    user: {
      name: matchingUser.name,
      email: matchingUser.email,
    },
  };
}

function shouldFallbackToLocalAuth(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = 'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
  const name = 'name' in error ? String((error as { name?: unknown }).name ?? '') : '';
  const combined = `${name} ${message}`.toLowerCase();

  return combined.includes('failed to fetch') || combined.includes('fetch') || combined.includes('network');
}

export async function registerUser(name: string, email: string, password: string): Promise<AuthResult> {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();

  return createLocalAccount(trimmedName, trimmedEmail, password);
}

export async function authenticateUser(email: string, password: string): Promise<AuthResult> {
  const trimmedEmail = email.trim().toLowerCase();

  return authenticateLocalUser(trimmedEmail, password);
}