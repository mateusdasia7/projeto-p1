import { createClient } from '@supabase/supabase-js';
import { timedFetch } from '../../shared/timed-fetch.mjs';
import { createWebAuthStorage } from './auth-storage.mjs';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const authOrigin = (() => { try { return new URL(url).origin; } catch { return ''; } })();
export const webAuthStorage = createWebAuthStorage();
export const configurationError = !url || !key || !authOrigin || url.includes('SEU_PROJETO') || key.includes('SUA_CHAVE')
  ? 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para conectar o aplicativo.' : '';
export const supabase = configurationError ? null : createClient(url, key, {
  global: { fetch: timedFetch },
  auth: {
    // persistSession habilita o adaptador; esse adaptador guarda tokens só em RAM.
    persistSession: true, storage: webAuthStorage.storage, storageKey: webAuthStorage.storageKey,
    autoRefreshToken: true, detectSessionInUrl: false,
    experimental: { passkey: true },
  },
});
