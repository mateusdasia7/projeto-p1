import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true,
    shouldPlaySound: true, shouldSetBadge: false,
  }),
});
export async function registerPush(userId) {
  if (!Device.isDevice) throw new Error('Teste push em aparelho físico');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('eventos', {
    name: 'Eventos', importance: Notifications.AndroidImportance.HIGH, sound: 'default',
  });
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return false;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Configure o projectId EAS');
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await supabase.from('push_tokens').upsert({
    token, user_id: userId,
  }, { onConflict: 'token' });
  if (error) throw error;
  return true;
}
