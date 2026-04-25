import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'pf-erp-auth',
    storage: localStorage,
    detectSessionInUrl: false,
  },
});

export const getSessionWithRetry = async (): Promise<Session | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    console.log('Session:', session);
    console.log('User:', session?.user);
    if (session) return session;

    await new Promise(r => setTimeout(r, 300));
    const { data: { session: retrySession } } = await supabase.auth.getSession();
    console.log('Session:', retrySession);
    console.log('User:', retrySession?.user);
    return retrySession || null;
  } catch {
    return null;
  }
};

const isAuthRelatedError = (error: unknown): boolean => {
  const message = String((error as { message?: string })?.message || error || '').toLowerCase();
  return (
    message.includes('jwt') ||
    message.includes('auth') ||
    message.includes('permission') ||
    message.includes('not authenticated') ||
    message.includes('token')
  );
};

export const runQueryWithGlobalRecovery = async <T>(
  query: () => Promise<{ data: T | null; error: unknown }>,
  options?: { allowEmpty?: boolean; label?: string; reloadOnFail?: boolean }
): Promise<{ data: T | null; error: unknown }> => {
  const reloadOnFail = options?.reloadOnFail ?? true;
  const label = options?.label || 'supabase-query';

  const shouldRetry = (error: unknown) => {
    if (error && isAuthRelatedError(error)) return true;
    return false;
  };

  let result = await query();
  if (!shouldRetry(result.error)) return result;

  console.warn(`[${label}] query needs recovery`, { error: result.error, data: result.data });
  const session = await getSessionWithRetry();
  if (!session) {
    if (reloadOnFail) window.location.reload();
    return result;
  }

  result = await query();
  if (!shouldRetry(result.error)) return result;

  console.error(`[${label}] retry failed`, { error: result.error, data: result.data });
  if (reloadOnFail) window.location.reload();
  return result;
};

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export const uploadProductImage = async (file: File, productId: string): Promise<string | null> => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    console.error('Invalid file type. Only JPEG, PNG, and WebP are allowed.');
    return null;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    console.error('File too large. Maximum size is 5MB.');
    return null;
  }
  const ext = file.type.split('/')[1];
  const path = `products/${productId}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true });
  if (error) {
    console.error('Upload error:', error);
    return null;
  }
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
};
