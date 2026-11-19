import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { supabase } from './supabase';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createSessionManager } from '../shared/session.mjs';

const Context = createContext(null);
export const useSession = () => useContext(Context);

export function SessionProvider({ children }) {
  const [state, setState] = useState({ user: null, reason: '', busy: false });
  const nativePrompt = useRef(false);
  const backgroundDuringPrompt = useRef(false);
  const connected = useRef(true);
  const manager = useMemo(() => createSessionManager(supabase, {
    onChange: setState, isOnline: () => connected.current, isForeground: () => AppState.currentState === 'active'
      || (nativePrompt.current && AppState.currentState === 'inactive'),
  }), []);

  async function confirmNative(user) {
    const enabled = await AsyncStorage.getItem('native:' + user.id);
    if (enabled !== 'true') return;
    if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) {
      throw new Error('Recurso nativo indisponível. Solicite a recuperação orientada da conta.');
    }
    nativePrompt.current = true;
    backgroundDuringPrompt.current = false;
    let result;
    try {
      result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirmar entrada', cancelLabel: 'Cancelar',
        disableDeviceFallback: false, biometricsSecurityLevel: 'strong',
      });
    } finally { nativePrompt.current = false; }
    if (!result.success || backgroundDuringPrompt.current) throw new Error('Entrada nativa não autorizada.');
  }

  const login = (email, password) => manager.signIn(async () => {
    if (!supabase) throw new Error('Configure a conexão com o Supabase.');
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error('E-mail ou senha inválidos, ou serviço indisponível.');
    return data.user;
  }, confirmNative);

  async function enableNative(enabled) {
    const current = manager.getState().user;
    if (!current) throw new Error('Entre novamente.');
    if (enabled) {
      if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) {
        throw new Error('Cadastre biometria nas configurações do aparelho.');
      }
      nativePrompt.current = true;
      backgroundDuringPrompt.current = false;
      let result;
      try { result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Ativar entrada nativa' }); }
      finally { nativePrompt.current = false; }
      if (!result.success || backgroundDuringPrompt.current || manager.getState().user?.id !== current.id) {
        throw new Error('Ativação cancelada.');
      }
    }
    await AsyncStorage.setItem('native:' + current.id, String(enabled));
    manager.touch();
  }

  useEffect(() => {
    const network = NetInfo.addEventListener(value => { connected.current = value.isConnected !== false && value.isInternetReachable !== false; });
    const listener = AppState.addEventListener('change', value => {
      if (nativePrompt.current) {
        if (value === 'background') {
          backgroundDuringPrompt.current = true;
          void manager.logout('Aplicativo em segundo plano.');
        }
        return; // O estado inactive do diálogo iOS não equivale a background.
      }
      if (value !== 'active') void manager.logout('Aplicativo saiu do primeiro plano.');
    });
    const timer = setInterval(() => void manager.tick(), 10000);
    const auth = supabase?.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' && manager.getState().user) {
        Promise.resolve().then(() => void manager.logout('Autenticação encerrada.'));
      }
    });
    return () => {
      listener.remove(); network(); clearInterval(timer);
      auth?.data.subscription.unsubscribe();
    };
  }, [manager]);

  return <Context.Provider value={{ ...state, login, logout: manager.logout,
    touch: manager.touch, accessToken: manager.accessToken, enableNative }}>
    <View style={{ flex: 1 }} onTouchStart={manager.touch}>{children}</View>
  </Context.Provider>;
}
