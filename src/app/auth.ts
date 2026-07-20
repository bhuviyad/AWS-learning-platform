export interface AuthUser {
  id: string;
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
    id: string;
    name: string;
    email: string;
  };
}

function createUserId(email: string) {
  const sanitized = email.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `user-${crypto.randomUUID()}`;
  }
  return `user-${sanitized || 'unknown'}`;
}

function normalizeStoredUser(user: Partial<AuthUser> & { email?: string; name?: string; password?: string }): AuthUser {
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  const name = typeof user.name === 'string' ? user.name.trim() : 'Intern';
  return {
    id: typeof user.id === 'string' && user.id.trim() ? user.id : createUserId(email || name),
    name,
    email,
    password: typeof user.password === 'string' ? user.password : '',
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
    return Array.isArray(parsedUsers) ? parsedUsers.map((user) => normalizeStoredUser(user)) : [];
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

export function readCurrentUser(): { id: string; name: string; email: string } | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawUser = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    const parsedUser = JSON.parse(rawUser) as { id?: unknown; name?: unknown; email?: unknown };

    if (typeof parsedUser.name !== 'string' || typeof parsedUser.email !== 'string') {
      return null;
    }

    return {
      id: typeof parsedUser.id === 'string' && parsedUser.id.trim() ? parsedUser.id : createUserId(parsedUser.email),
      name: parsedUser.name,
      email: parsedUser.email,
    };
  } catch {
    return null;
  }
}

export function writeCurrentUser(user: { id: string; name: string; email: string }) {
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

  const newUser = {
    id: createUserId(email),
    name,
    email,
    password,
  };

  const nextUsers = [...existingUsers, newUser];
  writeStoredUsers(nextUsers);

  return {
    success: true,
    message: 'Account created locally. You can now sign in.',
    user: {
      id: newUser.id,
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
      id: matchingUser.id,
      name: matchingUser.name,
      email: matchingUser.email,
    },
  };
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
