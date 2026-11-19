export async function requestNotifications({ Notification = globalThis.Notification } = {}) {
  if (!Notification || !('serviceWorker' in navigator)) throw new Error('Este navegador não oferece notificações. Use a lista de atividades no aplicativo.');
  if (Notification.permission==='denied') throw new Error('Permissão negada. Altere a permissão do site nas configurações do navegador.');
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(permission!=='granted') throw new Error('Permissão não concedida. Nenhuma notificação foi ativada.');
}
export async function deliverNotification(event) {
  if (!globalThis.Notification || Notification.permission!=='granted') throw new Error('Permissão de notificação indisponível. Confira a atividade no aplicativo.');
  const registration=await navigator.serviceWorker.ready;
  await registration.showNotification('Atividade no TechTask',{
    body:'Uma ordem de serviço mudou. Entre no aplicativo para consultar.',
    tag:'techtask-'+event.id,icon:'/icon.svg',data:{eventId:event.id},
  });
}
