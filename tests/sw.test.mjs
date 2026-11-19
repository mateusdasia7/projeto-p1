import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
async function worker(){
  const listeners={},calls=[],publicCache=new Map([['/index.html',new Response('interface pública')]]);
  const context={URL,Response,self:{location:{origin:'https://app.test'},addEventListener:(name,fn)=>{listeners[name]=fn;},clients:{claim:async()=>{}}},
    caches:{open:async()=>({addAll:async urls=>calls.push(['cache',urls]),match:async path=>publicCache.get(path)}),keys:async()=>[],delete:async()=>{}},
    fetch:async request=>{calls.push(['fetch',request.url]);throw new Error('offline');}};
  const source=(await readFile(new URL('../frontend/public/sw.js',import.meta.url),'utf8')).replace('/*__ASSETS__*/[]','["/index.html","/assets/a.js"]');
  vm.runInNewContext(source,context);return{listeners,calls};
}
function event(url,{method='GET',mode='cors',authorization=false}={}){
  let response;return{request:{url,method,mode,headers:{has:key=>key==='Authorization'&&authorization}},respondWith:p=>{response=p;},get response(){return response;}};
}
test('service worker não intercepta API, Auth, POST nem requisições autenticadas',async()=>{
  const {listeners,calls}=await worker();
  for(const input of [event('https://app.test/api/tasks'),event('https://project.supabase.co/auth/v1/token'),event('https://app.test/assets/a.js',{authorization:true}),event('https://app.test/api/tasks',{method:'POST'})]){
    listeners.fetch(input);assert.equal(input.response,undefined);
  }assert.equal(calls.length,0);
});
test('navegação desconectada devolve interface pública e instalação só armazena a lista estática',async()=>{
  const {listeners,calls}=await worker();let installed;listeners.install({waitUntil:p=>{installed=p;}});await installed;
  assert.deepEqual([...calls[0][1]],['/index.html','/assets/a.js']);
  const input=event('https://app.test/',{mode:'navigate'});listeners.fetch(input);
  assert.equal(await(await input.response).text(),'interface pública');
});
