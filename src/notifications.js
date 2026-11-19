import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
Notifications.setNotificationHandler({handleNotification:async()=>({
  shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false,
})});
export async function requestNotifications() {
  if (Platform.OS==='android') await Notifications.setNotificationChannelAsync('eventos',{
    name:'Ordens de serviço',importance:Notifications.AndroidImportance.HIGH,sound:'default',
  });
  let permission=await Notifications.getPermissionsAsync();
  if(!permission.granted) permission=await Notifications.requestPermissionsAsync();
  if(!permission.granted) throw new Error('Permissão de notificação não concedida. Use a atividade no aplicativo.');
}
export async function deliverNotification(event) {
  const permission=await Notifications.getPermissionsAsync();
  if(!permission.granted) throw new Error('O sistema não permitiu a notificação. Confira a atividade no aplicativo.');
  await Notifications.scheduleNotificationAsync({content:{
    title:'Atividade no TechTask',body:'Uma ordem de serviço mudou. Entre para consultar.',
    sound:'default',data:{eventId:event.id},
  },trigger:Platform.OS==='android'?{channelId:'eventos'}:null});
}
