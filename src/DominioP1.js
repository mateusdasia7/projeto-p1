import React,{useEffect,useRef,useState} from 'react';
import {View,TextInput,Button,Alert} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import {AText,useA11y} from './a11y/Acessibilidade';
import {useSession} from './SessionProvider';
import {supabase} from './supabase';
import {vault} from './vault';
import {createWorkspace} from '../shared/workspace.mjs';
import {createApi} from '../shared/api.mjs';
import {createEventNotifier,eventText} from '../shared/events.mjs';
import {deliverNotification,requestNotifications} from './notifications';
export default function DominioP1() {
  const {user,accessToken,logout,touch}=useSession();
  const {cores,p}=useA11y();
  const engine=useRef(null),notifier=useRef(null),connected=useRef(true);
  const [state,setState]=useState({ready:false,online:true,syncing:false,loading:true,profile:null,tasks:[],events:[],operations:[],notice:''});
  const [notices,setNotices]=useState({ready:false,enabled:false,message:''});
  const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[editing,setEditing]=useState(null);
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
  const field={borderWidth:1,borderColor:cores.borda,borderRadius:8,padding:12,color:cores.texto,fontSize:16*p.escala};
  useEffect(()=>{
    const n=createEventNotifier({owner:user.id,store:vault,deliver:deliverNotification,onStatus:patch=>setNotices(old=>({...old,...patch}))});
    const w=createWorkspace({owner:user.id,store:vault,uuid:Crypto.randomUUID,online:()=>connected.current,onChange:setState,onEvents:n.receive,
      request:createApi({base:process.env.EXPO_PUBLIC_P1_API_URL,accessToken,onExpired:reason=>void logout(reason)})});
    engine.current=w;notifier.current=n;void w.start();
    const network=NetInfo.addEventListener(value=>{connected.current=value.isConnected!==false&&value.isInternetReachable!==false;w.connectivity();});
    const timer=setInterval(()=>void w.sync(),15000);
    const channel=supabase.channel('native-events-'+user.id).on('postgres_changes',{
      event:'INSERT',schema:'public',table:'task_events',filter:'user_id=eq.'+user.id,
    },()=>void w.refresh()).subscribe();
    return ()=>{w.dispose();n.dispose();network();clearInterval(timer);void supabase.removeChannel(channel);};
  },[user.id,accessToken,logout]);
  async function act(action) {touch();setBusy(true);setFeedback('');try {await action();}catch(error){setFeedback(error.message);}finally{setBusy(false);}}
  return <View style={{backgroundColor:cores.card,padding:16,borderRadius:8,borderWidth:1,borderColor:cores.borda,gap:12}}>
    <AText accessibilityRole="header" style={{fontWeight:'bold'}}>Ordens de serviço · {state.profile?.role==='tecnico'?'Técnico':'Solicitante'}</AText>
    <AText accessibilityLiveRegion="polite">{state.online?'Conectado':'Sem internet'} · {state.operations.length} alteração(ões) pendente(s). {state.notice} {feedback}</AText>
    <AText>{editing?'Editar ordem':'Nova ordem — também funciona sem conexão'}</AText>
    <TextInput accessibilityLabel="Título da ordem" placeholder="Título do procedimento" placeholderTextColor={cores.borda} value={title}
      onChangeText={value=>{touch();setTitle(value);}} maxLength={150} editable={!busy&&state.ready} style={field}/>
    <TextInput accessibilityLabel="Descrição técnica" placeholder="Descrição técnica (opcional)" placeholderTextColor={cores.borda} value={description}
      onChangeText={value=>{touch();setDescription(value);}} maxLength={5000} multiline editable={!busy&&state.ready} style={field}/>
    <Button title={busy?'Salvando…':editing?'Salvar alteração':'Registrar ordem'} disabled={busy||!state.ready||!title.trim()} onPress={()=>void act(async()=>{
      await engine.current.enqueue(editing?'update':'create',editing,{title:title.trim(),description:description.trim()});setTitle('');setDescription('');setEditing(null);
    })}/>
    {editing&&<Button title="Cancelar edição" onPress={()=>{setEditing(null);setTitle('');setDescription('');}}/>}
    <Button title={state.syncing?'Sincronizando…':'Sincronizar agora'} disabled={state.syncing||!state.online} onPress={()=>void act(()=>engine.current.sync())}/>
    {state.operations.map(op=><View key={op.id} style={{...field,gap:8}}>
      <AText style={{fontWeight:'bold'}}>Alteração local: {op.payload.title||state.tasks.find(t=>t._id===op.taskId)?.title}</AText>
      <AText>{op.status==='conflict'?'Conflito com a versão da nuvem.':op.status==='error'?'Envio recusado.':op.status==='sending'?'Enviando…':'Salvo no aparelho; aguardando envio.'} {op.error}</AText>
      {op.status==='conflict'&&<>
        <AText>Na nuvem: {op.current?.title} · versão {op.current?.version} · {op.current?.completed?'Concluída':'Em andamento'}</AText>
        <AText>Sua proposta: {op.action==='delete'?'Excluir':JSON.stringify(op.payload)}</AText>
        <Button title="Reenviar minha alteração" disabled={busy||state.syncing} onPress={()=>void act(()=>engine.current.resolve(op.id,'retry'))}/>
      </>}
      {op.status==='error'&&<Button title="Tentar novamente" disabled={busy||state.syncing} onPress={()=>void act(()=>engine.current.resolve(op.id,'retry'))}/>}
      <Button title={op.status==='conflict'?'Usar versão da nuvem':'Descartar alteração local'} disabled={busy||state.syncing} onPress={()=>void act(()=>engine.current.resolve(op.id,'discard'))}/>
    </View>)}
    {!state.tasks.length&&!state.loading&&<AText>Nenhuma ordem cadastrada.</AText>}
    {state.tasks.map(task=><View key={task._id} style={{...field,gap:8}}>
      <AText style={{fontWeight:'bold'}}>{task.title}</AText><AText>{task.completed?'Concluída':'Em andamento'}{task.pending?' · Alteração local pendente':''}</AText>
      <AText>{task.description}</AText><AText>Solicitante: {task.ownerName} · versão {task.version}</AText>
      {state.profile?.role==='tecnico'&&<Button title={task.completed?'Reabrir':'Concluir'} disabled={busy||!!task.pending} onPress={()=>void act(()=>engine.current.enqueue('update',task,{completed:!task.completed}))}/>}
      {task.ownerId===user.id&&<>
        <Button title="Editar" disabled={busy||!!task.pending} onPress={()=>{setEditing(task);setTitle(task.title);setDescription(task.description);touch();}}/>
        <Button title="Excluir" disabled={busy||!!task.pending} onPress={()=>Alert.alert('Excluir ordem?','A exclusão será sincronizada quando houver conexão.',[
          {text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>void act(()=>engine.current.enqueue('delete',task))},
        ])}/>
      </>}
    </View>)}
    <AText accessibilityRole="header" style={{fontWeight:'bold'}}>Notificações locais e atividade</AText>
    <AText>Os avisos acompanham mudanças reais enquanto o aplicativo está aberto.</AText>
    <Button title={notices.enabled?'Desativar notificações':'Ativar notificações'} disabled={!notices.ready||busy} onPress={()=>void act(async()=>{
      if(!notices.enabled) await requestNotifications();await notifier.current.enable(!notices.enabled);setFeedback('Preferência de notificação atualizada.');
    })}/>
    {!!notices.message&&<AText accessibilityLiveRegion="polite">{notices.message}</AText>}
    {state.events.slice(-5).reverse().map(event=><AText key={event.id}>{eventText(event)} {new Date(event.created_at).toLocaleString('pt-BR')}</AText>)}
  </View>;
}
