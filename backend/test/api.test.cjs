const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../app');
const { createAuthorization } = require('../authorization');

async function server(t, client, configured = true) {
  const authorize = createAuthorization({ url: configured ? 'https://example.invalid' : '', key: 'public-key', clientFactory: () => client });
  const instance = createApp({ authorize, configured }).listen(0, '127.0.0.1');
  await new Promise(resolve => instance.once('listening', resolve));
  t.after(() => new Promise(resolve => instance.close(resolve)));
  return 'http://127.0.0.1:' + instance.address().port;
}
const client = (allowed = true) => ({
  auth: { getUser: async () => ({ data: { user: { id: 'A' } } }) },
  rpc: async () => ({ data: allowed }),
  from() { throw new Error('A consulta não deveria ocorrer'); },
});
const authHeaders = { Authorization: 'Bearer lab-signed-access-token', 'Content-Type': 'application/json' };

test('API nega chamada sem JWT mesmo sem banco configurado', async t => {
  const url = await server(t, client(), false);
  assert.equal((await fetch(url + '/api/tasks')).status, 401);
});
test('JWT inválido é recusado pelo servidor de autenticação', async t => {
  const c = client(); c.auth.getUser = async () => ({ data: { user: null }, error: { status: 401 } });
  const url = await server(t, c);
  assert.equal((await fetch(url + '/api/tasks', { headers: authHeaders })).status, 401);
});
test('JWT autenticado sem concessão vigente recebe 401 antes da consulta', async t => {
  const url = await server(t, client(false));
  assert.equal((await fetch(url + '/api/tasks', { headers: authHeaders })).status, 401);
});
test('indisponibilidade do servidor não libera acesso', async t => {
  const c = client(); c.rpc = async () => { throw new Error('offline'); };
  const url = await server(t, c);
  assert.equal((await fetch(url + '/api/tasks', { headers: authHeaders })).status, 503);
});
test('campos de autoria/papel, tipos inválidos e identificadores inválidos são rejeitados', async t => {
  const url = await server(t, client());
  for (const body of [{ title: 'OS', user_id: 'B' }, { title: 'OS', role: 'professor' }, { title: 12 }, { title: 'OS', description: {} }, []]) {
    assert.equal((await fetch(url + '/api/tasks', { method: 'POST', headers: authHeaders, body: JSON.stringify(body) })).status, 400);
  }
  assert.equal((await fetch(url + '/api/tasks/not-a-uuid', { method: 'DELETE', headers: authHeaders })).status, 400);
});
const id='11111111-1111-4111-8111-111111111111';
const operation='22222222-2222-4222-8222-222222222222';
const mutationClient=result=>({...client(),rpc:async name=>({data:name==='has_app_session'?true:result})});
test('UPDATE não visível retorna 404 sem anunciar sucesso',async t=>{
  const url=await server(t,mutationClient({status:404,code:'NOT_FOUND',error:'Não encontrada'}));
  const response=await fetch(url+'/api/tasks/'+id,{method:'PUT',headers:authHeaders,body:JSON.stringify({operation_id:operation,expected_version:1,completed:true})});
  assert.equal(response.status,404);
});
test('DELETE exige versão e recibo; servidor preserva negação de papel',async t=>{
  const url=await server(t,mutationClient({status:403,code:'FORBIDDEN',error:'Somente o dono'}));
  assert.equal((await fetch(url+'/api/tasks/'+id,{method:'DELETE',headers:authHeaders})).status,400);
  const response=await fetch(url+'/api/tasks/'+id,{method:'DELETE',headers:authHeaders,body:JSON.stringify({operation_id:operation,expected_version:1})});
  assert.equal(response.status,403);assert.equal((await response.json()).code,'FORBIDDEN');
});
test('conflito 409 devolve versão atual serializada para resolução, sem falso sucesso',async t=>{
  const url=await server(t,mutationClient({status:409,code:'VERSION_CONFLICT',error:'Conflito',current:{id,user_id:'A',title:'Nuvem',version:2,completed:true}}));
  const response=await fetch(url+'/api/tasks/'+id,{method:'PUT',headers:authHeaders,body:JSON.stringify({operation_id:operation,expected_version:1,title:'Local'})});
  assert.equal(response.status,409);assert.equal((await response.json()).current.version,2);
});
test('API encaminha identidade do chamador à RPC e devolve recibo de reenvio',async t=>{
  let params;
  const c={...client(),rpc:async(name,args)=>{if(name==='has_app_session')return{data:true};params=args;return{data:{status:201,replayed:true,deleted:false,task:{id,user_id:'A',title:'Ordem',version:1}}};}};
  const url=await server(t,c),response=await fetch(url+'/api/tasks',{method:'POST',headers:authHeaders,body:JSON.stringify({id,operation_id:operation,title:'Ordem'})});
  assert.equal(response.status,201);assert.equal((await response.json()).replayed,true);assert.equal(params.p_operation,operation);assert.equal('user_id' in params.p_payload,false);
});
test('origem não autorizada recebe 403 e erro interno não vaza detalhes', async t => {
  const url = await server(t, client());
  const denied = await fetch(url + '/api/tasks', { headers: { ...authHeaders, Origin: 'https://wrong.invalid' } });
  assert.equal(denied.status, 403);
  const failed = await fetch(url + '/api/tasks', { headers: authHeaders });
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /consulta não deveria|stack|token/i);
});
