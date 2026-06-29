'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { humanizeError } from '@/lib/errors';

export async function login(_prevState: { error: string } | null, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Most failures here are bad credentials, but a network blip or rate-limit
    // deserves its own message rather than wrongly blaming the password.
    return { error: humanizeError(error, "That email or password doesn't match our records.") };
  }

  const redirectTo = formData.get('redirect') as string;
  redirect(redirectTo || '/');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
