import {beforeEach,test,expect} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {createWebAuthStorage} from './auth-storage.mjs';
beforeEach(()=>{sessionStorage.clear();localStorage.clear();});
test('tokens ficam em RAM e não reaparecem em outro documento ou aba',()=>{
  const a=createWebAuthStorage();a.storage.setItem(a.storageKey,'jwt-ficticio');
  const b=createWebAuthStorage();expect(b.storageKey).not.toBe(a.storageKey);expect(b.storage.getItem(a.storageKey)).toBeNull();
  expect(localStorage.length).toBe(0);expect(sessionStorage.length).toBe(0);a.storage.removeItem(a.storageKey);expect(a.storage.getItem(a.storageKey)).toBeNull();
});
test('SDK real usa armazenamento em memória; nova instância exige autenticação',async()=>{
  const state=createWebAuthStorage();const access='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:'A',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.ficticia';
  const transport=async()=>new Response(JSON.stringify({access_token:access,token_type:'bearer',refresh_token:'refresh-ficticio',expires_in:3600,user:{id:'A',aud:'authenticated'}}),{headers:{'Content-Type':'application/json'}});
  const client=s=>createClient('https://project.invalid','chave-publica-ficticia',{auth:{persistSession:true,storage:s.storage,storageKey:s.storageKey,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport}});
  const a=client(state),b=client(createWebAuthStorage());
  try {
    const result=await a.auth.signInWithPassword({email:'a@lab.edu',password:'ficticia'});expect(result.error).toBeNull();
    expect((await a.auth.getSession()).data.session.access_token).toBe(access);expect((await b.auth.getSession()).data.session).toBeNull();
    expect(localStorage.length).toBe(0);expect(sessionStorage.length).toBe(0);
  }finally{await a.auth.signOut({scope:'local'});await a.auth.dispose();await b.auth.dispose();}
});
