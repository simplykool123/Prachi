import { createClient } from '@supabase/supabase-js';

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
