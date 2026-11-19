import React from 'react';
import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {render,screen,cleanup,waitFor,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const {fake,disk,storageState}=vi.hoisted(()=>({disk:new Map(),storageState:{fail:false},fake:{
  auth:{signInWithPassword:vi.fn(),signInWithPasskey:vi.fn(),registerPasskey:vi.fn(),passkey:{list:vi.fn(),delete:vi.fn()},getSession:vi.fn(),signOut:vi.fn(),onAuthStateChange:vi.fn()},
  rpc:vi.fn(),from:vi.fn(),channel:vi.fn(),removeChannel:vi.fn(),
}}));
vi.mock('./supabase',()=>({supabase:fake,configurationError:''}));
vi.mock('./vault.mjs',()=>({createWebVault:()=>({
  get:async(o,k)=>disk.get(o+':'+k)||null,
  put:async(o,k,v)=>{if(storageState.fail)throw new Error('Disco cheio');disk.set(o+':'+k,structuredClone(v));},
  remove:async(o,k)=>disk.delete(o+':'+k),
  replace:async(o,old,k,v)=>{disk.set(o+':'+k,structuredClone(v));disk.delete(o+':'+old);},
  list:async(o,p)=>[...disk].filter(([k])=>k.startsWith(o+':'+p)).map(([k,value])=>({key:k.slice(o.length+1),value:structuredClone(value)})),
})}));
import App from './App';
const A='alunoa@lab.edu',B='alunob@lab.edu';
const task={_id:'11111111-1111-4111-8111-111111111111',ownerId:A,ownerName:'Conta A',title:'Ordem da conta A',description:'',completed:false,version:1,createdAt:new Date().toISOString()};
let tasks,events,failWrite,active;
beforeEach(()=>{
  localStorage.clear();sessionStorage.clear();disk.clear();vi.clearAllMocks();tasks=[];events=[];failWrite=false;active=A;storageState.fail=false;
  Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
  fake.auth.signInWithPassword.mockImplementation(async({email,password})=>{
    if(password!=='senha-laboratorio')return{data:{},error:{message:'Negado'}};active=email;return{data:{user:{id:email,email}}};
  });
  fake.auth.getSession.mockResolvedValue({data:{session:{access_token:'jwt-ficticio'}}});
  fake.auth.signOut.mockResolvedValue({error:null});
  fake.auth.signInWithPasskey.mockResolvedValue({data:null,error:{code:'passkey_disabled'}});
  fake.auth.registerPasskey.mockResolvedValue({data:null,error:{code:'ERROR_CEREMONY_ABORTED'}});
  fake.auth.passkey.list.mockResolvedValue({data:[]});fake.auth.passkey.delete.mockResolvedValue({data:null});
  fake.auth.onAuthStateChange.mockReturnValue({data:{subscription:{unsubscribe:vi.fn()}}});
  fake.rpc.mockImplementation(async name=>({data:name==='begin_session'?'concessao-ficticia':true}));
  const channel={on:()=>channel,subscribe:()=>channel};fake.channel.mockReturnValue(channel);
  fake.from.mockImplementation(()=>{const b={select:()=>b,eq:()=>b,single:async()=>({data:{id:active,name:'Conta A',role:'solicitante'}}),order:async()=>({data:[]})};return b;});
  vi.stubGlobal('fetch',vi.fn(async(url,init={})=>{
    if(init.method){
      if(failWrite)return new Response(JSON.stringify({error:'Falha controlada no servidor.'}),{status:503});
      const body=JSON.parse(init.body);const created={...task,_id:body.id,title:body.title,ownerId:active};tasks.push(created);
      return new Response(JSON.stringify({task:created,deleted:false,replayed:false}),{status:201});
    }
    return new Response(JSON.stringify({profile:{id:active,name:'Conta '+(active===B?'B':'A'),role:active===B?'tecnico':'solicitante'},tasks,events,rooms:[]}),{status:200});
  }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();delete navigator.credentials;delete navigator.serviceWorker;delete document.visibilityState;});
async function login(user,email=A){
  await user.type(screen.getByLabelText('E-mail'),email);await user.type(screen.getByLabelText('Senha'),'senha-laboratorio');
  await user.click(screen.getByRole('button',{name:'Entrar na minha conta'}));
  await screen.findByRole('heading',{name:'Ordens de serviço'});
  await waitFor(()=>expect(screen.getByRole('button',{name:'Registrar ordem'}).disabled).toBe(false));
  await waitFor(()=>expect(screen.queryByText('Consultando a nuvem…')).toBeNull());
}
function allowPasskeys(){vi.stubGlobal('PublicKeyCredential',class{});Object.defineProperty(navigator,'credentials',{configurable:true,value:{get:vi.fn(),create:vi.fn()}});}
test('Google foi removido e credencial recusada não abre área privada',async()=>{
  const user=userEvent.setup();render(<App/>);expect(screen.queryByText(/Google/)).toBeNull();
  await user.type(screen.getByLabelText('E-mail'),A);await user.type(screen.getByLabelText('Senha'),'errada');await user.click(screen.getByRole('button',{name:'Entrar na minha conta'}));
  await screen.findByText(/E-mail ou senha inválidos/);expect(fake.rpc).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
test('falha no cofre mantém formulário; após gravação durável pode limpar e mostrar ordem',async()=>{
  const user=userEvent.setup();render(<App/>);await login(user);await user.type(screen.getByLabelText('Título do procedimento'),'Diagnóstico');
  storageState.fail=true;await user.click(screen.getByRole('button',{name:'Registrar ordem'}));await screen.findByText('Disco cheio');
  expect(screen.getByLabelText('Título do procedimento').value).toBe('Diagnóstico');expect(tasks).toHaveLength(0);
  storageState.fail=false;await user.click(screen.getByRole('button',{name:'Registrar ordem'}));
  await screen.findByRole('heading',{name:'Diagnóstico'});await waitFor(()=>expect(tasks).toHaveLength(1));
  expect(screen.getByLabelText('Título do procedimento').value).toBe('');
});
test('servidor indisponível mantém fila durável e não anuncia confirmação na nuvem',async()=>{
  const user=userEvent.setup();render(<App/>);await login(user);failWrite=true;
  await user.type(screen.getByLabelText('Título do procedimento'),'Pendente');await user.click(screen.getByRole('button',{name:'Registrar ordem'}));
  await screen.findByRole('region',{name:'Fila de sincronização'});await screen.findByText('Falha controlada no servidor.');
  expect([...disk.keys()].filter(k=>k.includes(':op:'))).toHaveLength(1);expect(tasks).toHaveLength(0);
  expect(screen.queryByText('Alterações confirmadas na nuvem.')).toBeNull();
});
test('solicitante edita própria ordem, técnico pode concluir; ações incompatíveis ficam ocultas',async()=>{
  tasks=[task];const user=userEvent.setup();render(<App/>);await login(user);
  expect(screen.queryByRole('button',{name:'Concluir'})).toBeNull();expect(screen.getByRole('button',{name:'Editar'})).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Sair'}));await screen.findByRole('button',{name:'Entrar na minha conta'});await login(user,B);
  expect(screen.getByRole('button',{name:'Concluir'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Editar'})).toBeNull();
  expect(screen.queryByRole('button',{name:/Excluir ordem/})).toBeNull();
});
test('preferências persistem, logout esconde conteúdo e conta diferente não vê fila local',async()=>{
  const user=userEvent.setup();render(<App/>);await login(user);failWrite=true;
  await user.type(screen.getByLabelText('Título do procedimento'),'Só no aparelho de A');await user.click(screen.getByRole('button',{name:'Registrar ordem'}));
  await screen.findByText('Falha controlada no servidor.');await user.click(screen.getByRole('button',{name:'150%'}));await user.click(screen.getByRole('button',{name:'Tema escuro'}));
  await user.click(screen.getByRole('button',{name:'Sair'}));await screen.findByRole('button',{name:'Entrar na minha conta'});
  expect(screen.queryByRole('heading',{name:'Só no aparelho de A'})).toBeNull();tasks=[];await login(user,B);
  expect(screen.queryByRole('heading',{name:'Só no aparelho de A'})).toBeNull();expect(localStorage.getItem('p2.tema')).toBe('claro');
  expect(Object.keys(localStorage).sort()).toEqual(['p2.escala','p2.tema']);expect(sessionStorage.length).toBe(0);
});
test('chave cancelada não abre concessão nem mostra conteúdo privado',async()=>{
  allowPasskeys();fake.auth.signInWithPasskey.mockResolvedValue({data:null,error:{code:'ERROR_CEREMONY_ABORTED'}});
  const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole('button',{name:'Entrar com chave de acesso'}));
  await screen.findByText(/confirmação da chave foi cancelada/);expect(fake.rpc).not.toHaveBeenCalled();
});
test('chave validada abre concessão sem senha',async()=>{
  allowPasskeys();fake.auth.signInWithPasskey.mockResolvedValue({data:{user:{id:A,email:A}}});
  const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole('button',{name:'Entrar com chave de acesso'}));
  await screen.findByRole('heading',{name:'Ordens de serviço'});expect(fake.rpc).toHaveBeenCalledWith('begin_session');expect(fake.auth.signInWithPassword).not.toHaveBeenCalled();
});
test('cadastro de chave cancelado não anuncia sucesso',async()=>{
  allowPasskeys();const user=userEvent.setup();render(<App/>);await login(user);await user.click(screen.getByRole('button',{name:'Meu perfil'}));
  const button=await screen.findByRole('button',{name:'Cadastrar chave de acesso'});await waitFor(()=>expect(button.disabled).toBe(false));await user.click(button);
  await screen.findByText(/Chave não cadastrada/);expect(screen.queryByText(/Chave de acesso cadastrada\./)).toBeNull();
});
test('cadastro confirmado mostra chave devolvida pelo servidor',async()=>{
  allowPasskeys();fake.auth.registerPasskey.mockResolvedValue({data:{id:'ficticia',friendly_name:'Aparelho de laboratório'}});
  const user=userEvent.setup();render(<App/>);await login(user);await user.click(screen.getByRole('button',{name:'Meu perfil'}));
  const button=await screen.findByRole('button',{name:'Cadastrar chave de acesso'});await waitFor(()=>expect(button.disabled).toBe(false));await user.click(button);
  await screen.findByText('Aparelho de laboratório');await screen.findByText(/Chave de acesso cadastrada\./);
});

test('ativação confirma preferência correta e um novo evento provoca aviso local; desativação é explícita',async()=>{
  const showNotification=vi.fn(async()=>{});
  vi.stubGlobal('Notification',{permission:'granted',requestPermission:vi.fn()});
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{ready:Promise.resolve({showNotification})}});
  const user=userEvent.setup();render(<App/>);await login(user,B);
  await user.click(screen.getByRole('button',{name:'Atividade'}));
  const button=screen.getByRole('button',{name:'Ativar notificações'});await waitFor(()=>expect(button.disabled).toBe(false));await user.click(button);
  await screen.findByText(/Avisos ativados\./);expect(showNotification).not.toHaveBeenCalled();
  events=[{id:'evento-real-controlado',actor_name:'Conta A',kind:'create',created_at:new Date().toISOString()}];
  await user.click(screen.getByRole('button',{name:'Ordens de serviço'}));await user.click(screen.getByRole('button',{name:'Sincronizar agora'}));
  await waitFor(()=>expect(showNotification).toHaveBeenCalledTimes(1));
  expect(showNotification.mock.calls[0][1].data.eventId).toBe('evento-real-controlado');
  await user.click(screen.getByRole('button',{name:'Atividade'}));await user.click(screen.getByRole('button',{name:'Desativar notificações'}));
  await screen.findByText('Avisos desativados.');
});
