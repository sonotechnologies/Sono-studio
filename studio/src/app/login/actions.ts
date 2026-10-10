'use server';

import { redirect } from 'next/navigation';
import { signIn, signOut } from '@/lib/auth';

export async function signInAction(_prev: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  if (!email || !password) return 'Enter your email and password.';
  const error = await signIn(email, password);
  if (error) return error;
  redirect('/');
}

export async function signOutAction() {
  await signOut();
  redirect('/login');
}
