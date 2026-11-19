// O mesmo protocolo de fila é usado pelo site e pelo aplicativo Expo.
// Nunca recebe senha/JWT; o transporte autenticado é injetado pelo provedor de sessão.
export function createWorkspace({ owner, store, request, online = () => true,
  uuid = () => globalThis.crypto.randomUUID(), now = Date.now, onChange = () => {}, onEvents = async () => {} }) {
  let snapshot = { profile:null, tasks:[], rooms:[], events:[] };
  let operations = [];
  let state = { ready:false, loading:false, syncing:false, online:online(), notice:'', ...snapshot, operations:[] };
  let alive = true, syncing = false, refreshing = false;
  let serial = Promise.resolve();
  const exclusive = action => { const result = serial.then(action); serial = result.catch(() => {}); return result; };
  function publish(patch = {}) {
    if (!alive) return;
    const rows = new Map(snapshot.tasks.map(item => [item._id,{...item}]));
    for (const op of operations) {
      const previous = rows.get(op.taskId) || { _id:op.taskId, ownerId:owner,
        ownerName:snapshot.profile?.name || 'Você', title:'Ordem removida na nuvem', description:'',
        completed:false, version:op.version || 1, createdAt:new Date(op.at).toISOString() };
      rows.set(op.taskId,{...previous,...op.payload,pending:op.status,pendingDelete:op.action==='delete'});
    }
    state = {...state,...snapshot,...patch,online:online(),tasks:[...rows.values()].sort((a,b) => b.createdAt.localeCompare(a.createdAt)),operations:[...operations]};
    onChange(state);
  }
  async function readOperations() {
    operations = (await store.list(owner,'op:')).map(row => row.value)
      .sort((a,b) => a.at-b.at || a.id.localeCompare(b.id));
    // Um processo encerrado durante o envio deixa a mesma operação pronta para reenvio.
    operations = operations.map(op => op.status === 'sending' ? {...op,status:'queued'} : op);
  }
  async function setOperation(op) {
    await store.put(owner,'op:'+op.id,op);
    operations = operations.filter(row => row.id !== op.id).concat(op).sort((a,b) => a.at-b.at || a.id.localeCompare(b.id));
    publish();
  }
  async function refresh() {
    if (!alive || !online() || refreshing) { publish(); return; }
    refreshing = true; publish({loading:true});
    try {
      const data = await request('/api/workspace');
      if (!data?.profile || data.profile.id !== owner || !Array.isArray(data.tasks) || !Array.isArray(data.events)) throw new Error('Resposta inválida do servidor.');
      if (!alive) return;
      await store.put(owner,'snapshot',data);
      snapshot = data;
      await readOperations();
      publish({notice:''});
      await onEvents(data.events);
    } catch(error) { publish({notice:error.message || 'Nuvem indisponível. Seus dados locais foram preservados.'}); }
    finally { refreshing = false; publish({loading:false}); }
  }
  async function sync() {
    if (!alive || syncing || !online() || !state.ready) { publish(); return; }
    syncing = true; publish({syncing:true});
    try {
      await serial;
      await readOperations();
      for (let op of [...operations]) {
        if (!alive || !online()) break;
        if (op.status !== 'queued') continue;
        op = {...op,status:'sending',error:''};
        await setOperation(op);
        try {
          const body = { operation_id:op.id,...op.payload };
          if (op.action === 'create') body.id = op.taskId;
          else body.expected_version = op.version;
          const response = await request('/api/tasks'+(op.action==='create'?'':'/'+op.taskId),{
            method:op.action==='create'?'POST':op.action==='update'?'PUT':'DELETE',body:JSON.stringify(body),
          });
          if (!alive) return;
          if (!response?.task?._id) throw new Error('Resposta de sincronização inválida.');
          const tasks = snapshot.tasks.filter(row => row._id !== op.taskId);
          if (!response.deleted) tasks.push(response.task);
          const updated = {...snapshot,tasks};
          // Persistir o resultado antes de retirar a fila. Se falhar, o mesmo recibo será consultado novamente.
          await store.put(owner,'snapshot',updated);
          await store.remove(owner,'op:'+op.id);
          snapshot = updated;
          operations = operations.filter(row => row.id !== op.id);
          publish({notice:'Alterações confirmadas na nuvem.'});
        } catch(error) {
          if (!alive) return;
          if (error.status === 409 && error.code === 'VERSION_CONFLICT') {
            await setOperation({...op,status:'conflict',current:error.current,error:error.message});
          } else if (error.status >= 400 && error.status < 500 && error.status !== 401) {
            await setOperation({...op,status:'error',error:error.message});
          } else {
            await setOperation({...op,status:'queued',error:error.message || 'Aguardando conexão.'});
            publish({notice:error.status===401 ? 'Entre novamente para sincronizar. A fila está preservada.' : 'Envio pendente. Tente sincronizar quando a conexão voltar.'});
            break;
          }
        }
      }
    } catch(error) { publish({notice:'Não foi possível acessar a fila local. '+error.message}); }
    finally { syncing = false; publish({syncing:false}); }
    if (alive && online()) await refresh();
  }
  async function enqueue(action, task, payload = {}) {
    const id = await exclusive(async() => {
      if (!state.ready) throw new Error('Aguarde a abertura do armazenamento local.');
      await readOperations();
      const taskId = action==='create' ? uuid() : task._id;
      if (operations.some(op => op.taskId===taskId)) throw new Error('Sincronize ou resolva a alteração pendente desta ordem primeiro.');
      if (action !== 'delete' && ('title' in payload) && (!payload.title.trim() || [...payload.title.trim()].length>150)) throw new Error('Informe um título de até 150 caracteres.');
      if ('description' in payload && [...payload.description].length>5000) throw new Error('Descrição excede 5000 caracteres.');
      if (action === 'create' && !payload.title?.trim()) throw new Error('Informe o título.');
      const op = {id:uuid(),taskId,action,payload,version:action==='create'?null:task.version,at:now(),status:'queued'};
      await setOperation(op); // A interface só limpa o formulário depois desta escrita durável.
      publish({notice:'Salvo neste aparelho. '+(online()?'Enviando para a nuvem…':'Aguardando conexão para sincronizar.')});
      return op.id;
    });
    void sync();
    return id;
  }
  async function resolve(id, choice) {
    await exclusive(async() => {
      if (syncing) throw new Error('Aguarde o término da sincronização.');
      const op = operations.find(item => item.id===id);
      if (!op) return;
      if (choice==='retry') {
        if (op.status==='conflict') {
          if (!op.current) throw new Error('Atualize a ordem antes de reenviar.');
          // Uma nova intenção usa outro UUID e a versão que o usuário acabou de revisar.
          const replacement = {...op,id:uuid(),version:op.current.version,status:'queued',error:'',current:undefined,at:now()};
          // Substituição atômica do registro evita perder a proposta durante queda do app.
          await store.replace(owner,'op:'+op.id,'op:'+replacement.id,replacement);
          operations = operations.filter(row => row.id!==id).concat(replacement);
        } else await setOperation({...op,status:'queued',error:''});
      } else {
        if (op.current) {
          const updated = {...snapshot,tasks:snapshot.tasks.filter(row => row._id!==op.taskId).concat(op.current)};
          await store.put(owner,'snapshot',updated); snapshot = updated;
        }
        await store.remove(owner,'op:'+op.id);
        operations = operations.filter(row => row.id!==id);
      }
      publish({notice:choice==='retry'?'Alteração preparada para reenvio.':'Alteração local descartada. A versão da nuvem foi mantida.'});
    });
    if (choice==='retry') await sync(); else await refresh();
  }
  return {
    async start() {
      try { snapshot = await store.get(owner,'snapshot') || snapshot; await readOperations(); publish({ready:true}); }
      catch(error) { publish({notice:'Armazenamento protegido indisponível. Nenhum formulário será apagado. '+error.message}); return; }
      await refresh(); await sync();
    },
    refresh, sync, enqueue, resolve,
    connectivity() { publish(); if (online()) void sync(); },
    getState:() => state,
    dispose() { alive=false; },
  };
}
