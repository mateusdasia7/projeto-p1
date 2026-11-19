import React,{useEffect,useState} from 'react';
export default function InstallStatus() {
  const [ready,setReady]=useState(false),[install,setInstall]=useState(null),[update,setUpdate]=useState(null);
  useEffect(()=>{
    let alive=true;
    const prompt=event=>{event.preventDefault();setInstall(event);};
    window.addEventListener('beforeinstallprompt',prompt);
    if(import.meta.env.PROD&&'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(registration=>{
        if(!alive) return;
        if(registration.waiting) setUpdate(registration.waiting);
        registration.addEventListener('updatefound',()=>{
          const worker=registration.installing;
          worker?.addEventListener('statechange',()=>{if(alive&&worker.state==='installed'&&navigator.serviceWorker.controller) setUpdate(worker);});
        });
        return navigator.serviceWorker.ready.then(()=>{if(alive)setReady(true);});
      }).catch(()=>{if(alive)setReady(false);});
    }
    return ()=>{alive=false;window.removeEventListener('beforeinstallprompt',prompt);};
  },[]);
  return <aside className="install" aria-label="Instalação e uso offline">
    <p>{ready?'Interface preparada para uso offline.':'Abra com conexão para preparar o uso offline.'} Para instalar, use “Instalar aplicativo” ou “Adicionar à tela inicial” no menu do navegador.</p>
    {install&&<button className="secondary" onClick={async()=>{await install.prompt();await install.userChoice;setInstall(null);}}>Instalar TechTask</button>}
    {update&&<button className="secondary" onClick={()=>{
      navigator.serviceWorker.addEventListener('controllerchange',()=>window.location.reload(),{once:true});update.postMessage('ACTIVATE_UPDATE');
    }}>Aplicar atualização e entrar novamente</button>}
  </aside>;
}
