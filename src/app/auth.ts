export interface AuthUser {
  name: string;
  email: string;
  password: string;
}

import { hasSupabaseConfig, supabase } from './lib/supabaseClient';

const USERS_STORAGE_KEY = 'aws-learning-lab-users';

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

export async function registerUser(name: string, email: string, password: string): Promise<AuthResult> {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();

  if (hasSupabaseConfig && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          full_name: trimmedName,
          name: trimmedName,
        },
      },
    });

    if (error) {
      return { success: false, message: error.message };
    }

    if (!data.session) {
      return {
        success: true,
        message: 'Account created. Check your email to confirm it before signing in.',
      };
    }

    return {
      success: true,
      message: 'Account created. You can now sign in.',
    };
  }

  const existingUsers = readStoredUsers();

  if (existingUsers.some((user) => user.email.toLowerCase() === trimmedEmail)) {
    return {
      success: false,
      message: 'An account with this email already exists. Please sign in instead.',
    };
  }

  const nextUsers = [...existingUsers, { name: trimmedName, email: trimmedEmail, password }];
  writeStoredUsers(nextUsers);

  return {
    success: true,
    message: 'Account created. You can now sign in.',
  };
}

export async function authenticateUser(email: string, password: string): Promise<AuthResult> {
  const trimmedEmail = email.trim().toLowerCase();

  if (hasSupabaseConfig && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error || !data.user) {
      return {
        success: false,
        message: error?.message ?? 'Unable to sign in.',
      };
    }

    return {
      success: true,
      message: 'Signed in successfully.',
      user: {
        name:
          (data.user.user_metadata?.full_name as string | undefined) ||
          (data.user.user_metadata?.name as string | undefined) ||
          data.user.email ||
          'User',
        email: data.user.email ?? trimmedEmail,
      },
    };
  }

  const matchingUser = readStoredUsers().find((user) => user.email.toLowerCase() === trimmedEmail);

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