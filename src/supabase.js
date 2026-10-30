import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://exemplo.supabase.co',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'chave-anon-exemplo',
  { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } }
);
// Sessão somente em memória: encerrar o processo exige nova entrada.
