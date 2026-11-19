import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,randomUUID} from 'node:crypto';
import {indexedDB} from 'fake-indexeddb';
import {createWebVault} from '../frontend/src/vault.mjs';
import {createWorkspace} from '../shared/workspace.mjs';
import {createSecureVault} from '../shared/secure-vault.mjs';
import {createEventNotifier} from '../shared/events.mjs';
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const makeStore=()=>createWebVault({indexedDB,crypto:webcrypto,name:'test-'+randomUUID()});
const workspace=tasks=>({profile:{id:owner,name:'Conta A',role:'solicitante'},tasks,events:[],rooms:[]});
const idle=async w=>{for(let i=0;i<1000&&w.getState().syncing;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(w.getState().syncing,false);};
function api() {
  const tasks=new Map(),receipts=new Map();let calls=0,lose=false;
  return {tasks,receipts,get calls(){return calls;},loseNext(){lose=true;},async request(path,options){
    if(!options) return workspace([...tasks.values()]);
    calls++;const b=JSON.parse(options.body);
    if(receipts.has(b.operation_id)) return receipts.get(b.operation_id);
    const id=b.id||path.split('/').at(-1),old=tasks.get(id);
    if(old&&old.version!==b.expected_version) throw Object.assign(new Error('Conflito'),{status:409,code:'VERSION_CONFLICT',current:old});
    const task={_id:id,ownerId:owner,ownerName:'Conta A',description:'',completed:false,createdAt:new Date().toISOString(),...old,
      ...Object.fromEntries(Object.entries(b).filter(([k])=>['title','description','completed'].includes(k))),version:(old?.version||0)+1};
    const result={task,deleted:options.method==='DELETE'};
    if(result.deleted) tasks.delete(id);else tasks.set(id,task);receipts.set(b.operation_id,result);
    if(lose){lose=false;throw new Error('Resposta perdida');}return result;
  }};
}
test('IndexedDB cifra conteúdos, isola contas e usa chave não exportável',async()=>{
  const name='raw-'+randomUUID(),store=createWebVault({indexedDB,crypto:webcrypto,name});
  await store.put(owner,'op:abc',{title:'CONTEUDO PRIVADO',description:'Minha ordem'});
  assert.equal(await store.get(other,'op:abc'),null);
  assert.equal((await store.get(owner,'op:abc')).title,'CONTEUDO PRIVADO');
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const read=(s,k)=>new Promise(resolve=>{const r=db.transaction(s).objectStore(s).get(k);r.onsuccess=()=>resolve(r.result);});
  const row=await read('records',owner+':op:abc'),key=await read('keys',owner);
  assert.equal(key.extractable,false);assert.equal('value' in row,false);assert.ok(row.cipher instanceof ArrayBuffer);
  assert.doesNotMatch(new TextDecoder().decode(row.cipher),/CONTEUDO PRIVADO|Minha ordem/);
  await assert.rejects(()=>webcrypto.subtle.exportKey('raw',key));db.close();await store.close();
});
test('queda e reinício preservam a fila; mesma conta sincroniza uma vez, outra conta não lê',async()=>{
  const store=makeStore(),server=api();let online=false;
  const config={owner,store,online:()=>online,request:server.request,uuid:randomUUID};
  const first=createWorkspace(config);await first.start();
  await first.enqueue('create',null,{title:'Aberta sem internet'});assert.equal(server.calls,0);
  assert.equal(first.getState().operations.length,1);first.dispose();
  assert.equal((await store.list(other,'op:')).length,0);
  const restored=createWorkspace(config);await restored.start();assert.equal(restored.getState().tasks[0].title,'Aberta sem internet');
  online=true;await restored.sync();assert.equal(server.tasks.size,1);assert.equal(restored.getState().operations.length,0);
  await restored.sync();assert.equal(server.calls,1);restored.dispose();await store.close();
});
test('resposta perdida após aceite é reenviada com o mesmo identificador; não duplica ordem',async()=>{
  const store=makeStore(),server=api();let online=false;
  const w=createWorkspace({owner,store,online:()=>online,request:server.request,uuid:randomUUID});await w.start();
  const id=await w.enqueue('create',null,{title:'Reenvio'});server.loseNext();online=true;await w.sync();
  assert.equal(server.tasks.size,1);assert.equal(w.getState().operations[0].id,id);assert.equal(w.getState().operations[0].status,'queued');
  await w.sync();assert.equal(server.tasks.size,1);assert.equal(w.getState().operations.length,0);assert.equal(server.calls,2);
  w.dispose();await store.close();
});
test('conflito preserva proposta, não sobrescreve e exige nova intenção para reaplicar',async()=>{
  const store=makeStore(),server=api(),id=randomUUID();let online=true;
  server.tasks.set(id,{_id:id,ownerId:owner,title:'Original',description:'',completed:false,version:1,createdAt:new Date().toISOString()});
  const w=createWorkspace({owner,store,online:()=>online,request:server.request,uuid:randomUUID});await w.start();
  online=false;const old=await w.enqueue('update',w.getState().tasks[0],{title:'Minha proposta'});
  server.tasks.set(id,{...server.tasks.get(id),version:2,completed:true});online=true;await w.sync();
  assert.equal(w.getState().operations[0].status,'conflict');assert.equal(server.tasks.get(id).title,'Original');
  assert.equal(w.getState().operations[0].payload.title,'Minha proposta');
  await w.resolve(old,'retry');assert.equal(server.tasks.get(id).title,'Minha proposta');assert.equal(server.tasks.get(id).completed,true);
  assert.equal(server.tasks.get(id).version,3);assert.equal(w.getState().operations.length,0);w.dispose();await store.close();
});
test('sessão expirada mantém operação pendente; negação de perfil vira erro que pode ser descartado',async()=>{
  const store=makeStore();let status=401;
  const w=createWorkspace({owner,store,online:()=>false,uuid:randomUUID,request:async()=>{throw Object.assign(new Error('Negado'),{status});}});
  await w.start();await w.enqueue('create',null,{title:'Pendente'});w.dispose();
  let online=true;const w2=createWorkspace({owner,store,online:()=>online,uuid:randomUUID,request:async(path,options)=>{
    if(!options)return workspace([]);throw Object.assign(new Error('Negado'),{status});
  }});await w2.start();assert.equal(w2.getState().operations[0].status,'queued');
  status=403;await w2.sync();assert.equal(w2.getState().operations[0].status,'error');
  await w2.resolve(w2.getState().operations[0].id,'discard');assert.equal((await store.list(owner,'op:')).length,0);w2.dispose();await store.close();
});
test('falha de armazenamento rejeita criação: a interface não recebe confirmação para limpar formulário',async()=>{
  const store=makeStore();const wrapped={...store,put:async()=>{throw new Error('Disco cheio');}};
  const w=createWorkspace({owner,store:wrapped,online:()=>false,uuid:randomUUID,request:async()=>{}});await w.start();
  await assert.rejects(()=>w.enqueue('create',null,{title:'Não perder'}),/Disco cheio/);assert.equal(w.getState().tasks.length,0);w.dispose();await store.close();
});
test('cofre nativo divide UTF-8, protege conteúdo e conserva ponteiro antigo se escrita falhar',async()=>{
  const disk=new Map(),secrets=new Map();let fail=false;
  const metadata={getItem:async k=>disk.get(k)||null,setItem:async(k,v)=>{if(fail)throw new Error('Sem espaço');disk.set(k,v);}};
  const secure={get:async k=>secrets.get(k)??null,set:async(k,v)=>{assert.ok(Buffer.byteLength(v)<=1024);secrets.set(k,v);},remove:async k=>secrets.delete(k)};
  const vault=createSecureVault({metadata,secure,uuid:randomUUID}),value={title:'Texto sigiloso',body:'🔒'.repeat(4000)};
  await vault.put(owner,'snapshot',value);assert.deepEqual(await vault.get(owner,'snapshot'),value);
  assert.doesNotMatch(JSON.stringify([...disk]),/Texto sigiloso|🔒/);assert.equal(await vault.get(other,'snapshot'),null);
  fail=true;await assert.rejects(()=>vault.put(owner,'snapshot',{title:'Substituto'}));fail=false;
  assert.deepEqual(await vault.get(owner,'snapshot'),value);
  await vault.replace(owner,'snapshot','novo',{title:'Substituto'});assert.equal(await vault.get(owner,'snapshot'),null);assert.equal((await vault.get(owner,'novo')).title,'Substituto');
});
test('notificação só acompanha evento novo real, não repete histórico nem após reiniciar',async()=>{
  const store=makeStore(),sent=[],statuses=[];
  const config={owner,store,deliver:async event=>sent.push(event.id),onStatus:s=>statuses.push(s)};
  const n=createEventNotifier(config);await n.receive([{id:'old'}]);await n.enable(true);
  await n.receive([{id:'old'},{id:'new',kind:'create'}]);await n.receive([{id:'new'}]);assert.deepEqual(sent,['new']);n.dispose();
  const next=createEventNotifier(config);await next.receive([{id:'new'},{id:'latest'}]);assert.deepEqual(sent,['new','latest']);
  await next.enable(false);await next.receive([{id:'muted'}]);assert.deepEqual(sent,['new','latest']);next.dispose();await store.close();
});
test('falha ao exibir notificação tem feedback e não causa spam; evento continua no banco',async()=>{
  const store=makeStore();let attempts=0;const statuses=[];
  const n=createEventNotifier({owner,store,onStatus:s=>statuses.push(s),deliver:async()=>{attempts++;throw new Error('Permissão negada');}});
  await assert.rejects(()=>n.enable(true),/Atualize/);await n.receive([]);await n.enable(true);await n.receive([{id:'real'}]);await n.receive([{id:'real'}]);
  assert.equal(attempts,1);assert.ok(statuses.some(s=>s.message==='Permissão negada'));n.dispose();await store.close();
});
