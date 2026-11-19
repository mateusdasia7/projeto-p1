// Os catálogos no AsyncStorage só contêm identificadores. Os conteúdos ficam no cofre do SO.
export function createSecureVault({ metadata, secure, uuid }) {
  let tail = Promise.resolve();
  const serial = action => { const result=tail.then(action); tail=result.catch(()=>{}); return result; };
  const catalogKey = owner => 'techtask.vault.'+owner;
  const catalog = async owner => JSON.parse(await metadata.getItem(catalogKey(owner)) || '{}');
  const partKey = (owner,entry,index) => 'tt.'+owner+'.'+entry.nonce+'.'+index;
  async function cleanup(owner,entry) {
    if (!entry) return;
    await Promise.all(Array.from({length:entry.chunks},(_,i)=>secure.remove(partKey(owner,entry,i)).catch(()=>{})));
  }
  async function read(owner,entry) {
    if (!entry) return null;
    const chunks=await Promise.all(Array.from({length:entry.chunks},(_,i)=>secure.get(partKey(owner,entry,i))));
    if (chunks.some(value=>value===null)) throw new Error('Registro local incompleto. Preserve a fila e tente novamente.');
    return JSON.parse(chunks.join(''));
  }
  async function write(owner,id,value,oldId=id) {
    const points=Array.from(JSON.stringify(value)), entry={nonce:uuid(),chunks:Math.ceil(points.length/256)};
    try {
      for(let i=0;i<entry.chunks;i++) await secure.set(partKey(owner,entry,i),points.slice(i*256,(i+1)*256).join(''));
      const index=await catalog(owner), old=index[oldId];
      delete index[oldId]; index[id]=entry;
      await metadata.setItem(catalogKey(owner),JSON.stringify(index)); // troca atômica do ponteiro
      await cleanup(owner,old);
    } catch(error) { await cleanup(owner,entry); throw error; }
  }
  return {
    get:(owner,id)=>serial(async()=>read(owner,(await catalog(owner))[id])),
    put:(owner,id,value)=>serial(()=>write(owner,id,value)),
    replace:(owner,oldId,newId,value)=>serial(()=>write(owner,newId,value,oldId)),
    remove:(owner,id)=>serial(async()=>{
      const index=await catalog(owner), old=index[id]; delete index[id];
      await metadata.setItem(catalogKey(owner),JSON.stringify(index)); await cleanup(owner,old);
    }),
    list:(owner,prefix='')=>serial(async()=>{
      const index=await catalog(owner);
      return Promise.all(Object.keys(index).filter(key=>key.startsWith(prefix)).map(async key=>({key,value:await read(owner,index[key])})));
    }),
  };
}
