import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {createSessionManager} from '../../shared/session.mjs';
import {supabase} from './supabase';
import {passkeyError,supportsPasskeys} from './web-auth.mjs';
const Context=createContext(null);
export const useSession=()=>useContext(Context);
export function SessionProvider({children}) {
  const [state,setState]=useState({user:null,busy:false,reason:''});
  const manager=useMemo(()=>createSessionManager(supabase,{
    onChange:setState,isForeground:()=>document.visibilityState!=='hidden',isOnline:()=>navigator.onLine,
  }),[]);
  useEffect(()=>{
    const activity=()=>manager.touch();
    const visibility=()=>{if(document.visibilityState==='hidden') void manager.logout('Sessão encerrada ao sair do aplicativo. Sua fila local continua guardada.');};
    const auth=supabase?.auth.onAuthStateChange(event=>{
      if(event==='SIGNED_OUT'&&manager.getState().user) queueMicrotask(()=>void manager.logout('Autenticação encerrada.'));
    });
    const timer=setInterval(()=>void manager.tick(),10000);
    for(const name of ['pointerdown','keydown','input','scroll']) document.addEventListener(name,activity,{passive:true});
    document.addEventListener('visibilitychange',visibility);
    return ()=>{
      clearInterval(timer);for(const name of ['pointerdown','keydown','input','scroll']) document.removeEventListener(name,activity);
      document.removeEventListener('visibilitychange',visibility);auth?.data.subscription.unsubscribe();
    };
  },[manager]);
  const login=(email,password)=>manager.signIn(async()=>{
    if(!supabase) throw new Error('Configure a conexão com o Supabase.');
    const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error) throw new Error('E-mail ou senha inválidos, ou serviço indisponível.');
    return data.user;
  });
  const loginWithPasskey=()=>manager.signIn(async()=>{
    if(!supabase||!supportsPasskeys()) throw new Error('Este navegador não oferece chave de acesso. Use e-mail e senha.');
    const {data,error}=await supabase.auth.signInWithPasskey();
    if(error||!data?.user) throw new Error(passkeyError(error));
    return data.user;
  });
  return <Context.Provider value={{...state,login,loginWithPasskey,logout:manager.logout,touch:manager.touch,accessToken:manager.accessToken}}>{children}</Context.Provider>;
}
