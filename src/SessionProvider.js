import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { supabase } from './supabase';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Context = createContext(null);
export const useSession = () => useContext(Context);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const lease = useRef(null);
  const activity = useRef(0);
  const active = useRef(false);
  const generation = useRef(0);
  const nativePrompt = useRef(false);
  const backgroundDuringPrompt = useRef(false);
  const renewing = useRef(false);
  const signingOut = useRef(false);
  const touch = () => { if (active.current) activity.current = Date.now(); };

  async function logout(message = 'Sessão encerrada') {
    if (signingOut.current) return;
    signingOut.current = true;
    generation.current += 1;
    active.current = false;
    setUser(null); // Desmonta telas privadas e assinaturas antes da rede.
    setReason(message);
    const previous = lease.current;
    lease.current = null;
    try {
      if (previous) await supabase.rpc('end_session', { p_id: previous });
    } catch {
      // Offline: a concessão já emitida expira pelo prazo do servidor.
    } finally {
      try { await supabase.auth.signOut({ scope: 'local' }); }
      finally { signingOut.current = false; }
    }
  }

  async function login(email, password) {
    if (busy || signingOut.current) return;
    setBusy(true); setReason('');
    const attempt = ++generation.current;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const enabled = await AsyncStorage.getItem('native:' + data.user.id);
      if (enabled === 'true') {
        if (!(await LocalAuthentication.hasHardwareAsync()) ||
            !(await LocalAuthentication.isEnrolledAsync())) {
          throw new Error('Recurso nativo indisponível. Use a recuperação orientada pelo professor.');
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
        if (!result.success || backgroundDuringPrompt.current) throw new Error('Entrada nativa não autorizada');
      }
      if (attempt !== generation.current || AppState.currentState !== 'active') {
        throw new Error('Aplicativo saiu do primeiro plano durante a entrada');
      }
      const { data: id, error: leaseError } = await supabase.rpc('begin_session');
      if (leaseError) throw leaseError;
      lease.current = id;
      if (attempt !== generation.current || AppState.currentState !== 'active') {
        await logout('Entrada interrompida'); return;
      }
      activity.current = Date.now();
      active.current = true;
      setUser(data.user);
    } catch (error) {
      await logout(error.message);
    } finally { setBusy(false); }
  }

  async function enableNative(enabled) {
    if (!user) return;
    if (enabled) {
      if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) {
        throw new Error('Cadastre biometria nas configurações do aparelho');
      }
      nativePrompt.current = true;
      backgroundDuringPrompt.current = false;
      let result;
      try {
        result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Ativar entrada nativa' });
      } finally { nativePrompt.current = false; }
      if (!result.success || backgroundDuringPrompt.current || !active.current) throw new Error('Ativação cancelada');
    }
    await AsyncStorage.setItem('native:' + user.id, String(enabled));
    touch();
  }

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (nativePrompt.current) {
        // iOS pode ficar inactive no diálogo; background real continua encerrando.
        if (state === 'background') {
          backgroundDuringPrompt.current = true;
          void logout('Aplicativo em segundo plano');
        }
        return;
      }
      if (state !== 'active') void logout('Aplicativo saiu do primeiro plano');
    });
    const timer = setInterval(async () => {
      if (!active.current || renewing.current) return;
      if (Date.now() - activity.current >= 120000) {
        void logout('Sessão expirada por inatividade'); return;
      }
      renewing.current = true;
      try {
        const { data, error } = await supabase.rpc('touch_session', {
          p_id: lease.current,
          p_activity: new Date(activity.current).toISOString(),
        });
        if (error || data !== true) await logout('Sessão inválida no servidor');
      } catch {
        await logout('Não foi possível validar a sessão');
      } finally { renewing.current = false; }
    }, 10000);
    return () => { listener.remove(); clearInterval(timer); };
  }, []);

  return <Context.Provider value={{ user, reason, busy, login, logout, touch, enableNative }}>
    <View style={{ flex: 1 }} onTouchStart={touch}>{children}</View>
  </Context.Provider>;
}
