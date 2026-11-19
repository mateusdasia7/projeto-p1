const description={create:'Uma ordem de serviço foi aberta.',update:'Uma ordem de serviço foi atualizada.',delete:'Uma ordem de serviço foi excluída.'};
export function eventText(event) { return (event.actor_name || 'Uma pessoa')+': '+(description[event.kind] || 'Nova atividade.'); }
export function createEventNotifier({ owner,store,deliver,onStatus=()=>{} }) {
  let meta,tail=Promise.resolve(),alive=true;
  const serial=action=>{const result=tail.then(action);tail=result.catch(()=>{});return result;};
  async function load() { if (!meta) meta=await store.get(owner,'notifications') || {enabled:false,seen:[],primed:false}; }
  async function save() { await store.put(owner,'notifications',meta); }
  return {
    receive:events=>serial(async()=>{
      if (!alive) return;
      await load();
      if (!meta.primed) {
        meta={...meta,primed:true,seen:events.map(e=>e.id).slice(-200)}; await save(); onStatus({ready:true,enabled:meta.enabled}); return;
      }
      for(const event of events) {
        if (!alive || meta.seen.includes(event.id)) continue;
        // Marcar antes da chamada ao SO evita alertas duplicados após reiniciar o processo.
        meta={...meta,seen:[...meta.seen,event.id].slice(-200)}; await save();
        if (!meta.enabled) continue;
        try { await deliver(event); if(alive) onStatus({ready:true,enabled:true,message:'Notificação de atividade enviada ao sistema.'}); }
        catch(error) { if(alive) onStatus({ready:true,enabled:true,message:error.message || 'O sistema não exibiu a notificação. Consulte a atividade abaixo.'}); }
      }
      if(alive) onStatus({ready:true,enabled:meta.enabled});
    }),
    enable:value=>serial(async()=>{ await load(); if(!meta.primed) throw new Error('Atualize as ordens antes de ativar notificações.'); meta={...meta,enabled:value};await save();onStatus({ready:true,enabled:value}); }),
    dispose() {alive=false;},
  };
}
