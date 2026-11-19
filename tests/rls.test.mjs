import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// PostgreSQL local descartável. Não representa evidência de execução no Supabase remoto.
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const room = '44444444-4444-4444-8444-444444444444';
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(auth.jwt()->>'sub', '')::uuid
    $$;
    grant usage on schema auth to authenticated, anon;
  `);
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users(id,raw_user_meta_data) values ($1,$4),($2,$4),($3,$4)', [A, B, C, { role: 'professor' }]);
  await db.query("update public.profiles set role='tecnico' where id=$1",[B]);
  await db.query('insert into public.rooms(id,name) values ($1,$2)', [room, 'Sala A/B']);
  await db.query('insert into public.room_members(room_id,user_id) values ($1,$2),($1,$3)', [room, A, B]);
});
after(async () => { await db?.close(); });

async function client(userId) {
  const claims = { sub: userId, role: 'authenticated', session_id: randomUUID() };
  const query = (sql, params = []) => db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    return tx.query(sql, params);
  });
  const lease = (await query('select public.begin_session() as id')).rows[0].id;
  return { query, lease };
}
const denied = action => assert.rejects(action, error => error.code === '42501');

test('A6-01: perfil próprio e atualização de nome têm uma linha; metadata não concede papel', async () => {
  const a = await client(A);
  const profile = await a.query('select * from public.profiles where id = $1', [A]);
  assert.equal(profile.rows.length, 1);
  assert.equal(profile.rows[0].role, 'solicitante');
  const updated = await a.query('update public.profiles set name = $1 where id = $2 returning name', ['Aluno A', A]);
  assert.deepEqual(updated.rows, [{ name: 'Aluno A' }]);
});
test('A6-02: ler/editar perfil de B retorna zero linhas e não muda B', async () => {
  const a = await client(A), b = await client(B);
  const before = (await b.query('select name from public.profiles where id=$1', [B])).rows[0].name;
  assert.equal((await a.query('select * from public.profiles where id=$1', [B])).rows.length, 0);
  assert.equal((await a.query("update public.profiles set name='Ataque' where id=$1 returning id", [B])).rows.length, 0);
  assert.equal((await b.query('select name from public.profiles where id=$1', [B])).rows[0].name, before);
});
test('A6-03: alterar role é negado por privilégio de coluna; papel final permanece solicitante', async () => {
  const a = await client(A);
  await denied(() => a.query("update public.profiles set role='professor' where id=$1", [A]));
  assert.equal((await a.query('select role from public.profiles where id=$1', [A])).rows[0].role, 'solicitante');
});
test('A6-04: A pode enviar como A; atribuir autoria a B é negado', async () => {
  const a = await client(A), b = await client(B);
  const body = 'Mensagem permitida ' + randomUUID();
  const inserted = await a.query('insert into public.messages(room_id,author_id,body) values ($1,$2,$3) returning id', [room, A, body]);
  assert.equal(inserted.rows.length, 1);
  assert.equal((await b.query('select id from public.messages where id=$1', [inserted.rows[0].id])).rows.length, 1);
  const forged = 'Negada ' + randomUUID();
  await denied(() => a.query('insert into public.messages(room_id,author_id,body) values ($1,$2,$3)', [room, B, forged]));
  assert.equal((await b.query('select id from public.messages where body=$1', [forged])).rows.length, 0);
});
test('A6-05: C não lê a sala A/B nem insere mensagens nela', async () => {
  const c = await client(C);
  assert.equal((await c.query('select id from public.rooms where id=$1', [room])).rows.length, 0);
  assert.equal((await c.query('select id from public.messages where room_id=$1', [room])).rows.length, 0);
  await denied(() => c.query('insert into public.messages(room_id,author_id,body) values ($1,$2,$3)', [room, C, 'Negada']));
});
test('A6-06: revogar a concessão bloqueia tabelas com a mesma identidade autenticada', async () => {
  const a = await client(A);
  await a.query('select public.end_session($1)', [a.lease]);
  assert.equal((await a.query('select public.has_app_session() as allowed')).rows[0].allowed, false);
  for (const table of ['profiles', 'rooms', 'room_members', 'messages', 'push_tokens', 'tasks']) {
    assert.equal((await a.query('select * from public.' + table)).rows.length, 0, table);
  }
  assert.equal((await a.query("update public.profiles set name='Negado' where id=$1 returning id", [A])).rows.length, 0);
  await denied(() => a.query("insert into public.tasks(title) values ('Negada')"));
  await assert.rejects(() => a.query('select public.begin_session()'), error => error.code === '28000');
});
async function mutate(who,action,id,payload={},version=null,operation=randomUUID()) {
  return (await who.query('select public.mutate_task($1,$2,$3,$4,$5) as result',[operation,action,id,version,payload])).rows[0].result;
}
test('P2: A abre, B técnico lê e conclui; C não lê; A não altera estado',async()=>{
  const a=await client(A),b=await client(B),c=await client(C),id=randomUUID();
  const created=await mutate(a,'create',id,{title:'Manutenção A'});
  assert.equal(created.status,201);assert.equal(created.task.user_id,A);
  assert.equal((await b.query('select * from public.tasks where id=$1',[id])).rows.length,1);
  assert.equal((await c.query('select * from public.tasks where id=$1',[id])).rows.length,0);
  assert.equal((await mutate(a,'update',id,{completed:true},1)).status,403);
  assert.equal((await mutate(b,'update',id,{title:'Texto indevido'},1)).status,403);
  assert.equal((await mutate(b,'delete',id,{},1)).status,403);
  const closed=await mutate(b,'update',id,{completed:true},1);
  assert.equal(closed.status,200);assert.equal(closed.task.completed,true);assert.equal(closed.task.version,2);
  await denied(()=>a.query("update public.tasks set completed=true where id=$1",[id]));
  await denied(()=>a.query("insert into public.tasks(title) values('Sem recibo')"));
  assert.equal((await mutate(a,'delete',id,{},2)).status,200);
});
test('P2: recibo evita duplicação e reserva UUID mesmo após excluir; payload alterado é recusado',async()=>{
  const a=await client(A),id=randomUUID(),op=randomUUID();
  const first=await mutate(a,'create',id,{title:'Fila offline'},null,op);
  const again=await mutate(a,'create',id,{title:'Fila offline'},null,op);
  assert.equal(first.status,201);assert.equal(again.replayed,true);
  assert.equal((await a.query('select * from public.tasks where id=$1',[id])).rows.length,1);
  assert.equal((await mutate(a,'create',id,{title:'Outra intenção'},null,op)).code,'OPERATION_ID_REUSED');
  assert.equal((await mutate(a,'create',id,{title:'Outro UUID operação'})).code,'TASK_ID_REUSED');
  await mutate(a,'delete',id,{},1);
  assert.equal((await mutate(a,'create',id,{title:'Fila offline'},null,op)).replayed,true);
  assert.equal((await a.query('select * from public.tasks where id=$1',[id])).rows.length,0);
  assert.equal((await mutate(a,'create',id,{title:'Recriar'})).code,'TASK_ID_REUSED');
  await denied(()=>a.query('select * from public.task_operations'));
});
test('P2: versão antiga não sobrepõe mudança do técnico; proposta pode ser reenviada conscientemente',async()=>{
  const a=await client(A),b=await client(B),id=randomUUID();
  await mutate(a,'create',id,{title:'Original'});
  await mutate(b,'update',id,{completed:true},1);
  const conflict=await mutate(a,'update',id,{title:'Proposta offline'},1);
  assert.equal(conflict.status,409);assert.equal(conflict.current.version,2);
  assert.equal(conflict.current.title,'Original');assert.equal(conflict.current.completed,true);
  const final=await mutate(a,'update',id,{title:'Proposta offline'},2);
  assert.equal(final.task.version,3);assert.equal(final.task.title,'Proposta offline');assert.equal(final.task.completed,true);
});
test('P2: evento tem autor, destinatário autorizado e uma ocorrência por operação',async()=>{
  const a=await client(A),b=await client(B),c=await client(C),id=randomUUID(),op=randomUUID();
  await mutate(a,'create',id,{title:'Evento'},null,op);await mutate(a,'create',id,{title:'Evento'},null,op);
  const event=(await b.query('select * from public.task_events where task_id=$1',[id])).rows;
  assert.equal(event.length,1);assert.equal(event[0].actor_id,A);assert.equal(event[0].user_id,B);
  assert.equal((await c.query('select * from public.task_events where task_id=$1',[id])).rows.length,0);
  await denied(()=>a.query('delete from public.task_events'));
});
test('P2: inválido, concessão expirada e troca de papel são verificados antes de repetir recibo',async()=>{
  const a=await client(A),b=await client(B),id=randomUUID(),op=randomUUID();
  assert.equal((await mutate(a,'create',id,{title:''})).status,400);
  assert.equal((await mutate(a,'create',id,{title:'Inválida',user_id:B})).status,400);
  await mutate(a,'create',id,{title:'Válida'});
  await mutate(b,'update',id,{completed:true},1,op);
  await db.query("update public.profiles set role='solicitante' where id=$1",[B]);
  assert.equal((await mutate(b,'update',id,{completed:true},1,op)).status,403);
  await db.query("update public.profiles set role='tecnico' where id=$1",[B]);
  await db.query("update public.app_sessions set expires_at=now()-interval '1 second' where id=$1",[a.lease]);
  assert.equal((await mutate(a,'update',id,{title:'Negada'},2)).code,'SESSION_EXPIRED');
  assert.equal((await a.query('select * from public.task_events')).rows.length,0);
});
test('Tokens: só o próprio dono pode registrar, ler e remover', async () => {
  const a = await client(A), b = await client(B);
  const token = 'ExpoPushToken[lab-' + randomUUID() + ']';
  await a.query('insert into public.push_tokens(token,user_id) values ($1,$2)', [token, A]);
  assert.equal((await b.query('select token from public.push_tokens where token=$1', [token])).rows.length, 0);
  await denied(() => b.query('insert into public.push_tokens(token,user_id) values ($1,$2)', [token + 'x', A]));
  assert.equal((await a.query('delete from public.push_tokens where token=$1 returning token', [token])).rows.length, 1);
});
test('Concessão de outra conta não pode ser revogada; atividade futura é recusada', async () => {
  const a = await client(A), b = await client(B);
  await a.query('select public.end_session($1)', [b.lease]);
  assert.equal((await b.query('select public.has_app_session() as allowed')).rows[0].allowed, true);
  assert.equal((await a.query("select public.touch_session($1,now()+interval '1 day') as allowed", [a.lease])).rows[0].allowed, false);
  await denied(() => a.query('select * from public.app_sessions'));
});
test('Anônimo não executa funções nem lê tabelas protegidas', async () => {
  await denied(() => db.transaction(async tx => { await tx.exec('set local role anon'); return tx.query('select public.begin_session()'); }));
  await denied(() => db.transaction(async tx => { await tx.exec('set local role anon'); return tx.query('select * from public.tasks'); }));
});
