import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { createSecureVault } from '../shared/secure-vault.mjs';
const options={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
export const vault=createSecureVault({
  metadata:AsyncStorage,uuid:Crypto.randomUUID,
  secure:{get:key=>SecureStore.getItemAsync(key,options),set:(key,value)=>SecureStore.setItemAsync(key,value,options),remove:key=>SecureStore.deleteItemAsync(key,options)},
});
