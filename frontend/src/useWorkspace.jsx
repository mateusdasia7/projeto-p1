import {useEffect,useRef,useState} from 'react';
import {createWorkspace} from '../../shared/workspace.mjs';
import {createApi} from '../../shared/api.mjs';
import {createEventNotifier} from '../../shared/events.mjs';
import {createWebVault} from './vault.mjs';
import {deliverNotification,requestNotifications} from './notifications.mjs';
import {useSession} from './SessionProvider';
import {supabase} from './supabase';
const store=createWebVault();
const base=(import.meta.env.VITE_API_URL||(import.meta.env.DEV?'http://localhost:5000':''));
export function useWorkspace() {
  const {user,accessToken,logout}=useSession();
  const engine=useRef(null),notifier=useRef(null);
  const [state,setState]=useState({ready:false,loading:true,syncing:false,online:navigator.onLine,profile:null,tasks:[],rooms:[],events:[],operations:[],notice:''});
  const [notifications,setNotifications]=useState({ready:false,enabled:false,message:''});
  useEffect(()=>{
    const n=createEventNotifier({owner:user.id,store,deliver:deliverNotification,onStatus:patch=>setNotifications(old=>({...old,...patch}))});
    const w=createWorkspace({owner:user.id,store,request:createApi({base,accessToken,onExpired:reason=>void logout(reason)}),
      online:()=>navigator.onLine,onChange:setState,onEvents:n.receive});
    engine.current=w;notifier.current=n;
    void w.start();
    const connectivity=()=>w.connectivity();
    window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity);
    const timer=setInterval(()=>{void w.sync();},15000);
    const channel=supabase.channel('task-events-'+user.id).on('postgres_changes',{
      event:'INSERT',schema:'public',table:'task_events',filter:'user_id=eq.'+user.id,
    },()=>void w.refresh()).subscribe();
    return ()=>{
      w.dispose();n.dispose();clearInterval(timer);window.removeEventListener('online',connectivity);window.removeEventListener('offline',connectivity);void supabase.removeChannel(channel);
    };
  },[user.id,accessToken,logout]);
  async function toggleNotifications() {
    const next = !notifications.enabled;
    try {
      if(next) await requestNotifications();
      await notifier.current.enable(next);
      setNotifications(old=>({...old,message:next?'Avisos ativados. Uma nova atividade real gerará uma notificação.':'Avisos desativados.'}));
    } catch(error) {setNotifications(old=>({...old,message:error.message}));}
  }
  return {state,engine,notifications,toggleNotifications};
}
