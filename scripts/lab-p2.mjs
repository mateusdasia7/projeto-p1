import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {randomUUID,webcrypto} from 'node:crypto';
import {indexedDB} from 'fake-indexeddb';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createWorkspace} from '../shared/workspace.mjs';
import {createWebVault} from '../frontend/src/vault.mjs';
const env=process.env;
const required=['LAB_SUPABASE_URL','LAB_SUPABASE_ANON_KEY','LAB_API_URL','LAB_ROOM_ID',...['A','B','C'].flatMap(a=>['LAB_'+a+'_EMAIL','LAB_'+a+'_PASSWORD'])];
if(required.some(k=>!env[k])) {console.error('Configure .env.lab com as contas fictícias e a chave pública. Nenhum teste executado.');process.exit(2);}
let keyRole;try{keyRole=JSON.parse(Buffer.from(env.LAB_SUPABASE_ANON_KEY.split('.')[1],'base64url')).role;}catch{}
if(keyRole==='service_role'||env.LAB_SUPABASE_ANON_KEY.startsWith('sb_secret_'))throw new Error('Use somente a chave pública para provar RLS.');
const base=env.LAB_API_URL.replace(/\/+$/,''),accounts={},rows=[],created=new Set(),marker='LAB-P2-'+Date.now();
let commit='desconhecido';try{commit=execFileSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8'}).trim();}catch{}
function must(result){assert.equal(Boolean(result.error),false);return result.data;}
async function login(alias){
  const client=createClient(env.LAB_SUPABASE_URL,env.LAB_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(i,o)=>fetch(i,{...o,signal:AbortSignal.timeout(18000)})}});
  const result=await client.auth.signInWithPassword({email:env['LAB_'+alias+'_EMAIL'],password:env['LAB_'+alias+'_PASSWORD']});
  const data=must(result);assert.ok(data.user?.id);
  const lease=must(await client.rpc('begin_session'));assert.ok(lease);
  return{client,id:data.user.id,lease};
}
async function api(alias,path='/api/tasks',options={}){
  const headers={'Content-Type':'application/json'};
  if(alias){const s=must(await accounts[alias].client.auth.getSession()).session;headers.Authorization='Bearer '+s.access_token;}
  const response=await fetch(base+path,{...options,headers,signal:AbortSignal.timeout(22000)});
  const data=await response.json().catch(()=>null);return{status:response.status,data};
}
const transport=alias=>async(path,options)=>{const r=await api(alias,path,options);if(r.status>=400)throw Object.assign(new Error(r.data?.error||'Falha'),{status:r.status,code:r.data?.code,current:r.data?.current});return r.data;};
async function create(alias='A',suffix='',id=randomUUID(),op=randomUUID()){
  const r=await api(alias,'/api/tasks',{method:'POST',body:JSON.stringify({id,operation_id:op,title:marker+suffix,description:'Ordem fictícia de validação P2'})});
  assert.equal(r.status,201);created.add(id);return{...r.data,id,op};
}
async function update(alias,task,payload,operation_id=randomUUID()){
  return api(alias,'/api/tasks/'+task._id,{method:'PUT',body:JSON.stringify({operation_id,expected_version:task.version,...payload})});
}
async function record(id,account,steps,expected,action){
  try{
    for(const a of Object.values(accounts))assert.equal(must(await a.client.rpc('touch_session',{p_id:a.lease,p_activity:new Date().toISOString()})),true);
    const obtained=await action();rows.push({id,account,steps,expected,obtained,status:'Aprovado'});
  }catch(error){
    const detail=error?.code==='ERR_ASSERTION'&&['number','boolean'].includes(typeof error.actual)?' Obtido='+error.actual+'; esperado='+error.expected+'.':'';
    rows.push({id,account,steps,expected,obtained:'Divergência ou indisponibilidade do serviço.'+detail,status:'Reprovado'});
  }
  console.log(id+': '+rows.at(-1).status);
}
try{
  for(const alias of ['A','B','C'])accounts[alias]=await login(alias);
  assert.equal(new Set(Object.values(accounts).map(a=>a.id)).size,3);
  let order;
  await record('A-PERSISTENCIA','A/B/C','A abre ordem; nova autenticação consulta; B consulta; C tenta consultar.','Uma ordem persistida; B autorizado; C com zero linhas.',async()=>{
    order=(await create('A','-fluxo')).task;
    const fresh=await login('A');
    try{assert.equal(must(await fresh.client.from('tasks').select('id').eq('id',order._id)).length,1);}finally{await fresh.client.rpc('end_session',{p_id:fresh.lease});await fresh.client.auth.signOut({scope:'local'});}
    assert.equal(must(await accounts.B.client.from('tasks').select('id').eq('id',order._id)).length,1);
    assert.equal(must(await accounts.C.client.from('tasks').select('id').eq('id',order._id)).length,0);
    return'A criou=201; nova autenticação leu=1; técnico B leu=1; C leu=0.';
  });
  await record('B-SEM-SESSAO','Anônimo','Consultar, inserir, atualizar e excluir sem JWT.','Quatro respostas HTTP 401.',async()=>{
    for(const [method,path,body]of[['GET','/api/tasks'],['POST','/api/tasks',{title:'Negada'}],['PUT','/api/tasks/'+order._id,{completed:true}],['DELETE','/api/tasks/'+order._id]]){
      assert.equal((await api(null,path,{method,...(body?{body:JSON.stringify(body)}:{})})).status,401);
    }return'GET, POST, PUT e DELETE=401.';
  });
  await record('B-PERFIS','A/B','A tenta concluir; B tenta editar texto/excluir de A; B conclui.','Negativas 403; técnico conclui e solicitante vê resultado.',async()=>{
    const pa=must(await accounts.A.client.from('profiles').select('role').single());const pb=must(await accounts.B.client.from('profiles').select('role').single());
    assert.equal(pa.role,'solicitante');assert.equal(pb.role,'tecnico');
    assert.equal((await update('A',order,{completed:true})).status,403);
    assert.equal((await update('B',order,{title:'Indevido'})).status,403);
    assert.equal((await api('B','/api/tasks/'+order._id,{method:'DELETE',body:JSON.stringify({operation_id:randomUUID(),expected_version:order.version})})).status,403);
    const closed=await update('B',order,{completed:true});assert.equal(closed.status,200);order=closed.data.task;
    assert.equal((await api('A')).data.find(t=>t._id===order._id).completed,true);
    return'Dois perfis distintos; três negativas=403; B concluiu=200; A confirmou completed=true.';
  });
  await record('A6-01-03','A/B','Ler próprio perfil, tentar ler B e elevar o próprio papel.','Próprio=1; B=0; alteração role=42501.',async()=>{
    assert.equal(must(await accounts.A.client.from('profiles').select('id')).length,1);
    assert.equal(must(await accounts.A.client.from('profiles').select('id').eq('id',accounts.B.id)).length,0);
    assert.equal((await accounts.A.client.from('profiles').update({role:'tecnico'}).eq('id',accounts.A.id)).error?.code,'42501');
    assert.equal(must(await accounts.A.client.from('profiles').select('role').single()).role,'solicitante');
    return'Próprio=1; perfil B=0; role=42501; papel final solicitante.';
  });
  await record('A6-04-05','A/B/C','A envia mensagem própria; autoria B forjada; C lê/envia na sala A/B.','B lê a interação; autoria falsa e C são bloqueados.',async()=>{
    const m=must(await accounts.A.client.from('messages').insert({room_id:env.LAB_ROOM_ID,author_id:accounts.A.id,body:marker+' — interação autorizada'}).select('id').single());
    assert.equal(must(await accounts.B.client.from('messages').select('id').eq('id',m.id)).length,1);
    assert.equal((await accounts.A.client.from('messages').insert({room_id:env.LAB_ROOM_ID,author_id:accounts.B.id,body:'Tentativa controlada'})).error?.code,'42501');
    assert.equal(must(await accounts.C.client.from('messages').select('id').eq('id',m.id)).length,0);
    assert.equal((await accounts.C.client.from('messages').insert({room_id:env.LAB_ROOM_ID,author_id:accounts.C.id,body:'Tentativa controlada'})).error?.code,'42501');
    return'Mensagem própria visível a B=1; forjada=42501; leitura C=0; envio C=42501.';
  });
  await record('D-OFFLINE','A','Desligar transporte, gravar no IndexedDB, reiniciar motor e reconectar à API real.','Fila durável e uma ordem na nuvem, sem duplicação.',async()=>{
    const name='p2-lab-'+randomUUID(),store=createWebVault({indexedDB,crypto:webcrypto,name});let online=false;
    const config={owner:accounts.A.id,store,online:()=>online,uuid:randomUUID,request:transport('A')};
    const first=createWorkspace(config);await first.start();await first.enqueue('create',null,{title:marker+'-offline',description:'Criada com transporte desconectado'});
    const id=first.getState().operations[0].taskId;created.add(id);first.dispose();
    const restored=createWorkspace(config);await restored.start();assert.equal(restored.getState().operations.length,1);online=true;await restored.sync();
    assert.equal(restored.getState().operations.length,0);assert.equal(must(await accounts.A.client.from('tasks').select('id').eq('id',id)).length,1);
    await restored.sync();assert.equal(must(await accounts.A.client.from('tasks').select('id').eq('id',id)).length,1);restored.dispose();await store.close();
    return'Escrita durável offline=1; após reinício fila=1; após reconexão fila=0 e banco=1; segundo envio banco=1. Runtime Node, IndexedDB emulado; API e banco reais.';
  });
  await record('D-RESPOSTA-PERDIDA','A','Aceitar escrita no servidor, simular perda da resposta e reenviar o mesmo UUID.','Um registro e recibo replayed=true.',async()=>{
    const id=randomUUID(),op=randomUUID(),payload={id,operation_id:op,title:marker+'-reenvio'};created.add(id);
    const accepted=await api('A','/api/tasks',{method:'POST',body:JSON.stringify(payload)});assert.equal(accepted.status,201);
    const retried=await api('A','/api/tasks',{method:'POST',body:JSON.stringify(payload)});assert.equal(retried.status,201);assert.equal(retried.data.replayed,true);
    assert.equal(must(await accounts.A.client.from('tasks').select('id').eq('id',id)).length,1);
    const changed=await api('A','/api/tasks',{method:'POST',body:JSON.stringify({...payload,title:'Outra intenção'})});assert.equal(changed.status,409);
    return'Primeiro aceite=201; reenvio=201/replayed=true; linhas finais=1; UUID reutilizado com payload diferente=409.';
  });
  await record('D-CONFLITO','A/B','A prepara edição na versão 1; B conclui; A envia versão antiga e depois resolve usando versão atual.','409 preserva versão da nuvem; reenvio consciente mantém conclusão.',async()=>{
    const t=(await create('A','-conflito')).task;
    const b=await update('B',t,{completed:true});assert.equal(b.status,200);
    const conflict=await update('A',t,{title:marker+'-proposta'});assert.equal(conflict.status,409);assert.equal(conflict.data.code,'VERSION_CONFLICT');
    assert.equal(conflict.data.current.completed,true);assert.equal(conflict.data.current.version,2);
    const resolved=await update('A',conflict.data.current,{title:marker+'-proposta'});assert.equal(resolved.status,200);assert.equal(resolved.data.task.completed,true);assert.equal(resolved.data.task.version,3);
    return'Versão antiga=409; nuvem continuou concluída/versão 2; resolução explícita=200/versão 3 e completed=true.';
  });
  await record('NOTIFICACAO-EVENTO','A/B/C','Criar ordem real e consultar evento pela conta destinatária B; C tenta consultar; cliente tenta fabricar evento.','Evento persistido com identidade de A, visível a B e oculto de C.',async()=>{
    const t=await create('A','-evento');
    const e=must(await accounts.B.client.from('task_events').select('id,actor_id,kind').eq('task_id',t.id));assert.equal(e.length,1);assert.equal(e[0].actor_id,accounts.A.id);assert.equal(e[0].kind,'create');
    assert.equal(must(await accounts.C.client.from('task_events').select('id').eq('task_id',t.id)).length,0);
    assert.equal((await accounts.A.client.from('task_events').delete().eq('task_id',t.id)).error?.code,'42501');
    return'Evento real=1; autoria A conferida; leitura C=0; escrita direta=42501. Exibição pelo SO requer demonstração no aparelho.';
  });
  await record('E-ENTRADA-INVALIDA','A','Tentar título vazio, autoria forjada e atualização sem versão.','HTTP 400; nenhuma alteração indevida.',async()=>{
    for(const body of [{id:randomUUID(),operation_id:randomUUID(),title:''},{id:randomUUID(),operation_id:randomUUID(),title:'Teste',user_id:accounts.B.id}])assert.equal((await api('A','/api/tasks',{method:'POST',body:JSON.stringify(body)})).status,400);
    assert.equal((await api('A','/api/tasks/'+order._id,{method:'PUT',body:JSON.stringify({operation_id:randomUUID(),title:'Sem versão'})})).status,400);
    return'Título vazio=400; autoria forjada=400; versão ausente=400.';
  });
  await record('RLS-ESCRITA-DIRETA','A/B','Tentar alterar tasks sem a transação autorizada e ler o diário privado.','Permissão 42501 para todas as tentativas.',async()=>{
    assert.equal((await accounts.A.client.from('tasks').insert({title:'Direto'})).error?.code,'42501');
    assert.equal((await accounts.B.client.from('tasks').update({completed:true}).eq('id',order._id)).error?.code,'42501');
    assert.equal((await accounts.A.client.from('task_operations').select('*')).error?.code,'42501');
    return'INSERT direto=42501; UPDATE direto=42501; diário privado=42501.';
  });
  await record('E-REVOGACAO','A','Revogar concessão e repetir consultas conservando JWT em RAM; tentar reabrir concessão.','JWT ainda autenticado, dados privados negados e API 401.',async()=>{
    const a=accounts.A,before=must(await a.client.auth.getSession()).session.access_token;
    must(await a.client.rpc('end_session',{p_id:a.lease}));assert.equal(must(await a.client.auth.getSession()).session.access_token,before);
    assert.equal(must(await a.client.auth.getUser(before)).user.id,a.id);assert.equal(must(await a.client.rpc('has_app_session')),false);
    for(const table of ['profiles','tasks','rooms','messages','push_tokens','task_events'])assert.equal(must(await a.client.from(table).select('*')).length,0);
    assert.equal((await api('A')).status,401);assert.ok((await a.client.rpc('begin_session')).error);
    return'JWT idêntico e usuário válido; concessão=false; seis tabelas=0; API=401; reabertura recusada.';
  });
}catch{
  rows.push({id:'PREPARACAO',account:'A/B/C',steps:'Entrar com três contas fictícias.',expected:'Contas e serviços disponíveis.',obtained:'Não foi possível preparar o laboratório. Não foram registrados dados de autenticação.',status:'Reprovado'});
}finally{
  try{
    const fresh=await login('A');accounts.A=fresh;
    const all=await api('A');
    for(const task of all.data||[])if(created.has(task._id))await api('A','/api/tasks/'+task._id,{method:'DELETE',body:JSON.stringify({operation_id:randomUUID(),expected_version:task.version})});
  }catch{console.log('Limpeza de ordens de teste pendente. Não remover dados do usuário.');}
  for(const a of Object.values(accounts))try{await a.client.rpc('end_session',{p_id:a.lease});await a.client.auth.signOut({scope:'local'});}catch{}
}
await mkdir('reports',{recursive:true});
const file='reports/p2-'+new Date().toISOString().replace(/[:.]/g,'-')+'.md';
const clean=s=>String(s??'').replaceAll('|','/').replaceAll('\n',' ');
const text=['# Evidências remotas — P2','', 'Data: '+new Date().toISOString(),'Commit de código: '+commit,
  'Dispositivo/runtime: Node '+process.version+' / Linux; cliente Supabase autenticado com chave pública. API: '+base,
  'Pré-condição: A/C solicitantes, B técnico, sala A/B e concessões vigentes. SQL administrativo não valida RLS.',
  'A desconexão automatizada usa transporte desligado e IndexedDB emulado. Não substitui a gravação da demonstração física.',
  'Ordens criadas por este script são removidas pela conta A. Eventos, recibos e mensagem fictícia de teste permanecem como evidência.', '',
  '| ID | Conta | Passos | Esperado | Obtido | Status |','|---|---|---|---|---|---|',
  ...rows.map(r=>'| '+[r.id,r.account,r.steps,r.expected,r.obtained,r.status].map(clean).join(' | ')+' |'),'','Correção: nenhuma quando aprovado; em reprovação, inspecionar o cenário e repetir sem registrar credenciais.',
  'A demonstração física e seus limites de comprovação são registrados separadamente em RELATORIO_TESTES.md.',''].join('\n');
await writeFile(file,text);console.log('Relatório sanitizado: '+file);process.exitCode=rows.some(r=>r.status!=='Aprovado')?1:0;
