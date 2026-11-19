import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleNotification } from '../supabase/functions/notificar/handler.mjs';

const id = '11111111-1111-4111-8111-111111111111';
function fixture(options = {}) {
  const calls = [];
  const message = { id, room_id: 'room-ab', author_id: 'A', created_at: new Date(1000000).toISOString() };
  const deps = {
    now: () => 1001000,
    userClient: () => ({ auth: { getUser: async () => ({ data: { user: options.unauthenticated ? null : { id: 'A' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: options.denied ? null : { ...message, ...options.message } }) }) }) }),
    }),
    admin: { from: table => {
      calls.push(['admin', table]);
      if (table === 'room_members') return { select: () => ({ eq: () => ({ neq: () => ({ data: [{ user_id: 'B' }] }) }) }) };
      return { select: () => ({ in: () => ({ data: [{ token: 'ExpoPushToken[lab_B]' }] }) }) };
    } },
    send: async batch => { calls.push(['send', batch]); return new Response(JSON.stringify({ data: [
      { status: 'ok', id: 'receipt', message: 'ExpoPushToken[lab_B]' },
    ] })); },
  };
  return { calls, deps };
}
function request(body = { messageId: id }, authenticated = true) {
  return new Request('https://example.invalid/notificar', { method: 'POST',
    headers: authenticated ? { Authorization: 'Bearer lab-token' } : {}, body: JSON.stringify(body) });
}
test('sem JWT e com usuário inválido, push retorna 401 antes do acesso administrativo', async () => {
  const f = fixture({ unauthenticated: true });
  assert.equal((await handleNotification(request({}, false), f.deps)).status, 401);
  assert.equal((await handleNotification(request(), f.deps)).status, 401);
  assert.equal(f.calls.length, 0);
});
test('sem concessão ou participação, RLS nega mensagem antes de consultar tokens', async () => {
  const f = fixture({ denied: true });
  assert.equal((await handleNotification(request(), f.deps)).status, 403);
  assert.equal(f.calls.length, 0);
});
test('usuário não pode pedir push de mensagem de outra pessoa', async () => {
  const f = fixture({ message: { author_id: 'B' } });
  assert.equal((await handleNotification(request(), f.deps)).status, 403);
  assert.equal(f.calls.length, 0);
});
test('evento antigo ou identificador inválido não chega ao provedor', async () => {
  const f = fixture({ message: { created_at: new Date(0).toISOString() } });
  assert.equal((await handleNotification(request(), f.deps)).status, 400);
  assert.equal((await handleNotification(request({ messageId: 'not-a-uuid' }), f.deps)).status, 400);
  assert.equal(f.calls.length, 0);
});
test('evento próprio autorizado manda conteúdo genérico e nunca devolve tokens', async () => {
  const f = fixture();
  const response = await handleNotification(request(), f.deps);
  assert.equal(response.status, 200);
  const batch = f.calls.find(([name]) => name === 'send')[1];
  assert.equal(batch[0].to, 'ExpoPushToken[lab_B]');
  assert.equal('room_id' in batch[0].data, false);
  assert.deepEqual(batch[0].data, { type: 'message' });
  assert.doesNotMatch(await response.text(), /ExpoPushToken|lab_B|lab-token/);
});
