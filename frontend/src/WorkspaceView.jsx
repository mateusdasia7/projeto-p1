import React,{useState} from 'react';
import {eventText} from '../../shared/events.mjs';
export function WorkspaceView({state,engine,user,setNotice}) {
  const [saving,setSaving]=useState(false);
  const [editing,setEditing]=useState(null);
  async function act(action) {
    setSaving(true);setNotice('');
    try {await action();} catch(error) {setNotice(error.message);} finally {setSaving(false);}
  }
  return <>
    <div className="section-heading"><div><span className="eyebrow">{state.profile?.role==='tecnico'?'FILA DE ATENDIMENTO':'SUAS MANUTENÇÕES'}</span><h2>Ordens de serviço</h2></div>
      <button className="secondary" disabled={!state.online||state.syncing} onClick={()=>void engine.current.sync()}>{state.syncing?'Sincronizando…':'Sincronizar agora'}</button></div>
    <div className="notice connectivity" role="status">
      <strong>{state.online?'Conectado':'Sem internet'}</strong><span>{state.operations.length?`${state.operations.length} alteração(ões) pendente(s).`:'Nenhuma alteração pendente.'}</span>
      {!state.online&&<span>Você pode registrar ordens. Elas serão enviadas quando a conexão voltar.</span>}
    </div>
    <TaskForm saving={saving||!state.ready} onSave={(values,reset)=>act(async()=>{await engine.current.enqueue('create',null,values);reset();})}/>
    {state.operations.length>0&&<section className="card queue" aria-label="Fila de sincronização"><h3>Alterações neste aparelho</h3>
      <p className="muted">A confirmação na nuvem aparece quando o envio termina. Sair da conta preserva a fila para o próximo login da mesma conta.</p>
      {state.operations.map(op=><div className="queue-item" key={op.id}>
        <strong>{op.payload.title||state.tasks.find(t=>t._id===op.taskId)?.title||'Ordem de serviço'}</strong>
        <p>{op.status==='sending'?'Enviando…':op.status==='conflict'?'Conflito: há uma versão mais recente na nuvem.':op.status==='error'?'Envio recusado.':'Salvo no aparelho; aguardando envio.'}</p>
        {op.error&&<p className="muted">{op.error}</p>}
        {op.status==='conflict'&&<div className="conflict"><p><strong>Na nuvem:</strong> {op.current?.title} · versão {op.current?.version} · {op.current?.completed?'Concluída':'Em andamento'}</p>
          <p><strong>Sua proposta:</strong> {op.action==='delete'?'Excluir a ordem':JSON.stringify(op.payload)}</p></div>}
        <div className="actions">
          {op.status==='conflict'&&<button disabled={state.syncing||saving} onClick={()=>void act(()=>engine.current.resolve(op.id,'retry'))}>Reenviar minha alteração</button>}
          {op.status==='error'&&<button className="secondary" disabled={state.syncing||saving} onClick={()=>void act(()=>engine.current.resolve(op.id,'retry'))}>Tentar novamente</button>}
          <button className="secondary" disabled={state.syncing||saving} onClick={()=>void act(()=>engine.current.resolve(op.id,'discard'))}>{op.status==='conflict'?'Usar versão da nuvem':'Descartar alteração local'}</button>
        </div>
      </div>)}
    </section>}
    <section className="card" aria-label="Ordens registradas" aria-busy={state.loading}>
      {state.loading&&<p role="status">Consultando a nuvem…</p>}
      {!state.tasks.length&&!state.loading&&<div className="empty"><h3>Nenhuma ordem por aqui.</h3><p>Registre uma ordem no formulário acima.</p></div>}
      <ul className="task-list">{state.tasks.map(task=><li className="task" key={task._id}>
        <div className="task-body"><span className={'badge '+(task.completed?'done':'')}>{task.completed?'Concluída':'Em andamento'}</span>
          {task.pending&&<span className="badge">{task.pendingDelete?'Exclusão pendente':'Alteração local pendente'}</span>}
          <h3>{task.title}</h3><p>{task.description}</p><p className="small">Solicitante: {task.ownerName} · versão {task.version}</p>
          <time dateTime={task.createdAt}>{new Date(task.createdAt).toLocaleString('pt-BR')}</time>
          {editing===task._id&&<TaskForm key={task._id} task={task} saving={saving} onCancel={()=>setEditing(null)}
            onSave={(values)=>act(async()=>{await engine.current.enqueue('update',task,values);setEditing(null);})}/>}
        </div>
        <div className="actions">
          {state.profile?.role==='tecnico'&&<button className="secondary" disabled={saving||!!task.pending} onClick={()=>void act(()=>engine.current.enqueue('update',task,{completed:!task.completed}))}>{task.completed?'Reabrir':'Concluir'}</button>}
          {task.ownerId===user.id&&<>
            <button className="secondary" disabled={saving||!!task.pending} onClick={()=>setEditing(task._id)}>Editar</button>
            <button className="danger" disabled={saving||!!task.pending} aria-label={'Excluir ordem '+task.title} onClick={()=>{
              if(window.confirm('Excluir esta ordem? A exclusão será enviada quando houver conexão.')) void act(()=>engine.current.enqueue('delete',task));
            }}>Excluir</button>
          </>}
        </div>
      </li>)}</ul>
    </section>
  </>;
}
function TaskForm({saving,onSave,task,onCancel}) {
  const [title,setTitle]=useState(task?.title||''),[description,setDescription]=useState(task?.description||'');
  const suffix=task?'-'+task._id:'';
  return <section className={task?'edit-form':'card'}><h3>{task?'Editar ordem':'Nova ordem de serviço'}</h3>
    <form onSubmit={event=>{event.preventDefault();if(title.trim()) void onSave({title:title.trim(),description:description.trim()},()=>{setTitle('');setDescription('');});}}>
      <label htmlFor={'title'+suffix}>Título do procedimento</label><input id={'title'+suffix} value={title} onChange={e=>setTitle(e.target.value)} maxLength={150} required disabled={saving}/>
      <label htmlFor={'description'+suffix}>Descrição técnica (opcional)</label><textarea id={'description'+suffix} value={description} onChange={e=>setDescription(e.target.value)} maxLength={5000} rows={3} disabled={saving}/>
      <div className="actions"><button disabled={saving}>{saving?'Salvando no aparelho…':task?'Salvar alteração':'Registrar ordem'}</button>{task&&<button type="button" className="secondary" onClick={onCancel}>Cancelar edição</button>}</div>
    </form>
  </section>;
}
export function NotificationsView({events,notifications,toggleNotifications}) {
  return <section className="card"><h2>Atividade e notificações</h2>
    <p className="muted">Receba um aviso do sistema quando uma ordem permitida mudar, enquanto o aplicativo estiver aberto. O histórico fica salvo no banco.</p>
    <button className="secondary" disabled={!notifications.ready} onClick={()=>void toggleNotifications()}>{notifications.enabled?'Desativar notificações':'Ativar notificações'}</button>
    {notifications.message&&<p role="status" className="notice">{notifications.message}</p>}
    {!events.length&&<p className="muted">Nenhuma atividade registrada.</p>}
    <ol className="activity">{events.slice(-10).reverse().map(event=><li key={event.id}><p>{eventText(event)}</p><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString('pt-BR')}</time></li>)}</ol>
  </section>;
}
