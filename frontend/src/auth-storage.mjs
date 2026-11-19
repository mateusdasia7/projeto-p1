// Um compartimento por documento; nenhum dado de autenticação vai para disco.
export function createWebAuthStorage() {
  const memory=new Map();
  return {
    storageKey:'techtask-auth-'+globalThis.crypto.randomUUID(),
    storage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},
  };
}
