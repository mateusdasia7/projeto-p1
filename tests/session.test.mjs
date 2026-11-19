import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionManager } from '../shared/session.mjs';

function setup(overrides = {}) {
  let now = 1000000;
  const events = [];
  const calls = [];
  const client = {
    rpc: async (name, params) => { calls.push([name, params]); return { data: name === 'begin_session' ? 'private-lease' : true }; },
    auth: { signOut: async () => calls.push(['signOut']), getSession: async () => ({ data: { session: { access_token: 'private-jwt' } } }) },
    ...overrides,
  };
  const manager = createSessionManager(client, { onChange: value => events.push(value), now: () => now });
  return { manager, events, calls, advance: ms => { now += ms; } };
}
test('área privada só abre depois da credencial, confirmação e concessão', async () => {
  const { manager, calls } = setup();
  await manager.signIn(async () => ({ id: 'A' }), async () => {
    assert.equal(manager.getState().user, null);
    assert.equal(calls.length, 0);
  });
  assert.equal(calls[0][0], 'begin_session');
  assert.equal(manager.getState().user.id, 'A');
  assert.equal('lease' in manager.getState(), false);
});
test('confirmação cancelada não abre concessão nem expõe área privada', async () => {
  const { manager, calls } = setup();
  await manager.signIn(async () => ({ id: 'A' }), async () => { throw new Error('Cancelada'); });
  assert.equal(manager.getState().user, null);
  assert.equal(calls.some(([name]) => name === 'begin_session'), false);
});
test('logout desmonta conteúdo antes de revogar no servidor e não devolve JWT', async () => {
  const { manager, calls } = setup();
  await manager.signIn(async () => ({ id: 'A' }));
  const pending = manager.logout();
  assert.equal(manager.getState().user, null);
  await pending;
  assert.equal(calls[1][0], 'end_session');
  await assert.rejects(() => manager.accessToken(), /Sessão encerrada/);
});
test('renovação usa a última atividade; polling não inventa atividade', async () => {
  const { manager, calls, advance } = setup();
  await manager.signIn(async () => ({ id: 'A' }));
  advance(60000); await manager.tick();
  assert.equal(calls[1][1].p_activity, new Date(1000000).toISOString());
  advance(60001); await manager.tick();
  assert.equal(manager.getState().user, null);
});
test('concessão recusada pelo servidor encerra a área privada', async () => {
  const { manager } = setup({ rpc: async name => ({ data: name === 'begin_session' ? 'lease' : false }) });
  await manager.signIn(async () => ({ id: 'A' }));
  await manager.tick();
  assert.equal(manager.getState().user, null);
});
test('entrada interrompida durante a abertura da concessão nunca mostra a área privada', async () => {
  let finish;
  const { manager, events } = setup({ rpc: async name => name === 'begin_session'
    ? new Promise(resolve => { finish = resolve; }) : { data: true } });
  const login = manager.signIn(async () => ({ id: 'A' }));
  await new Promise(resolve => setImmediate(resolve));
  await manager.logout('Segundo plano');
  finish({ data: 'late-lease' });
  await login;
  assert.equal(events.some(state => state.user), false);
});
test('um clique após inatividade não reabre a sessão expirada', async () => {
  const { manager, advance } = setup();
  await manager.signIn(async () => ({ id: 'A' }));
  advance(120001); manager.touch();
  assert.equal(manager.getState().user, null);
});
test('logout durante autenticação não permite iniciar outra conta antes de terminar', async () => {
  let finish;
  const { manager } = setup();
  const pending = manager.signIn(() => new Promise(resolve => { finish = resolve; }));
  await manager.logout('Interrompida');
  let second = false;
  await manager.signIn(async () => { second = true; return { id: 'B' }; });
  assert.equal(second, false);
  finish({ id: 'A' }); await pending;
  assert.equal(manager.getState().user, null);
  await manager.signIn(async () => ({ id: 'B' }));
  assert.equal(manager.getState().user.id, 'B');
});
test('indisponibilidade de rede não apaga usuário ativo; inatividade continua encerrando sessão',async()=>{
  const {manager,advance}=setup({rpc:async name=>name==='begin_session'?{data:'lease'}:Promise.reject(new Error('offline'))});
  await manager.signIn(async()=>({id:'A'}));await manager.tick();assert.equal(manager.getState().user.id,'A');
  advance(120001);await manager.tick();assert.equal(manager.getState().user,null);
});
