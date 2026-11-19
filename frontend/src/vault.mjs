// IndexedDB contém apenas dados de domínio cifrados. JWTs permanecem no provedor em RAM.
export function createWebVault({ indexedDB = globalThis.indexedDB, crypto = globalThis.crypto, name = 'techtask-offline-v1' } = {}) {
  let opening;
  function open() {
    if (!indexedDB || !crypto?.subtle) return Promise.reject(new Error('Este navegador não oferece armazenamento protegido.'));
    if (!opening) opening = new Promise((resolve,reject) => {
      const req = indexedDB.open(name,1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('keys');
        req.result.createObjectStore('records',{keyPath:'id'}).createIndex('owner','owner');
      };
      req.onsuccess = () => resolve(req.result); req.onerror=() => reject(req.error);
      req.onblocked = () => reject(new Error('Feche outras versões do aplicativo e tente novamente.'));
    });
    return opening;
  }
  async function transaction(store,mode,action) {
    const db = await open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction(store,mode), result=action(tx.objectStore(store));
      tx.oncomplete = () => resolve(result?.result);
      tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Gravação local interrompida.'));
    });
  }
  async function key(owner) {
    const existing = await transaction('keys','readonly',s=>s.get(owner));
    if (existing) return existing;
    const candidate = await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    try { await transaction('keys','readwrite',s=>s.add(candidate,owner)); return candidate; }
    catch(error) { const winner = await transaction('keys','readonly',s=>s.get(owner)); if (winner) return winner; throw error; }
  }
  const recordId = (owner,id) => owner+':'+id;
  async function encrypted(owner,id,value) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aad = new TextEncoder().encode(recordId(owner,id));
    const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await key(owner),new TextEncoder().encode(JSON.stringify(value)));
    return {id:recordId(owner,id),owner,key:id,iv,cipher};
  }
  async function decode(owner,row) {
    if (!row || row.owner!==owner) return null;
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:new TextEncoder().encode(row.id)},await key(owner),row.cipher);
    return JSON.parse(new TextDecoder().decode(plain));
  }
  return {
    async get(owner,id) { return decode(owner,await transaction('records','readonly',s=>s.get(recordId(owner,id)))); },
    async put(owner,id,value) { const row=await encrypted(owner,id,value); await transaction('records','readwrite',s=>s.put(row)); },
    async remove(owner,id) { await transaction('records','readwrite',s=>s.delete(recordId(owner,id))); },
    async replace(owner,oldId,newId,value) {
      const row=await encrypted(owner,newId,value);
      await transaction('records','readwrite',s=>{s.put(row);return s.delete(recordId(owner,oldId));});
    },
    async list(owner,prefix='') {
      const rows=await transaction('records','readonly',s=>s.index('owner').getAll(owner));
      return Promise.all(rows.filter(row=>row.key.startsWith(prefix)).map(async row=>({key:row.key,value:await decode(owner,row)})));
    },
    async close() { (await open()).close(); opening=null; },
  };
}
