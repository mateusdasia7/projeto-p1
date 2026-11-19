import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { timedFetch } from '../shared/timed-fetch.mjs';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const configurationError = !url || !key || url.includes('SEU_PROJETO') || key.includes('SUA_CHAVE');
export const supabase = configurationError ? null : createClient(url, key, {
  global: { fetch: timedFetch },
  auth: {
    persistSession: false, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce',
  },
});
