import { createClient } from 'npm:@supabase/supabase-js@2.119.1';
import { handleNotification } from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve((req: Request) => handleNotification(req, {
  userClient: (authorization: string) => createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  admin,
  send: (batch: unknown[]) => fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
    signal: AbortSignal.timeout(10000),
  }),
}));
