import React, { useEffect, useState } from 'react';
import { Button, ScrollView, TextInput, View } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { SessionProvider, useSession } from './src/SessionProvider';
import { supabase } from './src/supabase';
import { registerPush } from './src/notifications';
import Chat from './src/Chat';
import { AcessibilidadeProvider, AText, Ajustes, useA11y } from './src/a11y/Acessibilidade';
import Libras from './src/a11y/Libras';
import DominioP1 from './src/DominioP1';

function Login() {
  const { login, loginWithGoogle, busy, reason } = useSession();
  const { cores, p } = useA11y();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [googleEmail, setGoogleEmail] = useState('mateus2018pc@gmail.com');
  const [mostrarAcessibilidade, setMostrarAcessibilidade] = useState(false);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: cores.fundo }}
      contentContainerStyle={{ padding: 24, gap: 16 }}
    >
      <AText accessibilityRole="header" style={{ fontWeight: 'bold', fontSize: 22 * p.escala }}>
        TechTask Mobile (P1 + P2) — Ordens de Serviço & Biometria
      </AText>
      <AText accessibilityLiveRegion="polite">{reason}</AText>

      <TextInput
        accessibilityLabel="E-mail"
        placeholder="E-mail institucional ou pessoal"
        placeholderTextColor={cores.borda}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{
          borderWidth: 1,
          borderColor: cores.borda,
          borderRadius: 6,
          padding: 12,
          color: cores.texto,
          fontSize: 16 * p.escala,
        }}
      />
      <TextInput
        accessibilityLabel="Senha"
        placeholder="Senha"
        placeholderTextColor={cores.borda}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{
          borderWidth: 1,
          borderColor: cores.borda,
          borderRadius: 6,
          padding: 12,
          color: cores.texto,
          fontSize: 16 * p.escala,
        }}
      />
      <Button
        title={busy ? 'Entrando...' : 'Entrar com E-mail e Senha'}
        disabled={busy}
        onPress={() => login(email, password)}
      />

      <View style={{ padding: 14, borderWidth: 1, borderColor: cores.borda, borderRadius: 8, gap: 10 }}>
        <AText style={{ fontWeight: 'bold' }}>Entrar com Conta do Google (OAuth + Biometria):</AText>
        <TextInput
          accessibilityLabel="Conta Google"
          placeholder="Seu e-mail do Google (ex: usuario@gmail.com)"
          placeholderTextColor={cores.borda}
          autoCapitalize="none"
          keyboardType="email-address"
          value={googleEmail}
          onChangeText={setGoogleEmail}
          style={{
            borderWidth: 1,
            borderColor: cores.borda,
            borderRadius: 6,
            padding: 10,
            color: cores.texto,
            fontSize: 16 * p.escala,
          }}
        />
        <Button
          title="Continuar com o Google"
          disabled={busy}
          onPress={() => loginWithGoogle(googleEmail)}
        />
      </View>

      <Button
        title={mostrarAcessibilidade ? 'Ocultar Acessibilidade e Libras' : 'Acessibilidade e Ajuda em Libras'}
        onPress={() => setMostrarAcessibilidade(!mostrarAcessibilidade)}
      />
      {mostrarAcessibilidade && (
        <>
          <Ajustes />
          <Libras />
        </>
      )}
    </ScrollView>
  );
}

function PrivateArea() {
  const { user, logout, enableNative } = useSession();
  const { cores, p } = useA11y();
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [muted, setMuted] = useState(false);
  const audio = useAudioPlayer(require('./assets/evento.wav'));

  useEffect(() => {
    let alive = true;
    async function load() {
      const [pRes, rRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('rooms').select('*'),
      ]);
      if (!alive) return;
      if (pRes.error || rRes.error) {
        setFeedback(pRes.error?.message ?? rRes.error.message);
        return;
      }
      setProfile(pRes.data);
      setName(pRes.data.name);
      setRooms(rRes.data);
    }
    void load();
    return () => { alive = false; };
  }, [user.id]);

  async function execute(action) {
    try {
      await action();
      setFeedback('Operação concluída');
    } catch (error) {
      setFeedback(error.message);
    }
  }

  async function save() {
    const { error } = await supabase.from('profiles').update({ name: name.trim() }).eq('id', user.id);
    if (error) throw error;
    setProfile(previous => ({ ...previous, name: name.trim() }));
  }

  function sound() {
    setFeedback('Mensagem enviada');
    if (!muted) {
      audio.seekTo(0);
      audio.play();
    }
  }

  if (roomId) {
    return (
      <View style={{ flex: 1, padding: 20, backgroundColor: cores.fundo }}>
        <Button title="Voltar ao perfil" onPress={() => setRoomId(null)} />
        <Chat roomId={roomId} onSent={sound} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: cores.fundo }}
      contentContainerStyle={{ padding: 24, gap: 14 }}
    >
      <AText accessibilityRole="header" style={{ fontWeight: 'bold' }}>
        Conta: {user.email}
      </AText>
      <AText>Perfil: {profile?.name || user.email} | Papel: {profile?.role || 'aluno'}</AText>
      <TextInput
        accessibilityLabel="Nome do perfil"
        value={name}
        onChangeText={setName}
        style={{
          borderWidth: 1,
          borderColor: cores.borda,
          borderRadius: 6,
          padding: 12,
          color: cores.texto,
          fontSize: 16 * p.escala,
        }}
      />
      <Button title="Salvar nome" onPress={() => execute(save)} />
      <Button title="Ativar entrada nativa" onPress={() => execute(() => enableNative(true))} />
      <Button title="Desativar entrada nativa" onPress={() => execute(() => enableNative(false))} />
      <Button title={muted ? 'Ativar som' : 'Silenciar som'} onPress={() => setMuted(!muted)} />
      <Button
        title="Registrar push"
        onPress={() => execute(async () => {
          const granted = await registerPush(user.id);
          if (!granted) throw new Error('Permissão negada; aplicativo continua disponível');
        })}
      />
      {rooms.map(room => (
        <Button key={room.id} title={'Abrir ' + room.name} onPress={() => setRoomId(room.id)} />
      ))}
      <AText accessibilityLiveRegion="polite" style={{ fontWeight: 'bold' }}>
        {feedback}
      </AText>

      <DominioP1 />
      <Ajustes />
      <Libras />

      <Button title="Sair" onPress={() => logout()} />
    </ScrollView>
  );
}

function Gate() {
  const { user } = useSession();
  const { cores } = useA11y();
  return (
    <View style={{ flex: 1, paddingTop: 48, backgroundColor: cores.fundo }}>
      {user ? <PrivateArea key={user.id} /> : <Login />}
    </View>
  );
}

export default function App() {
  return (
    <AcessibilidadeProvider>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </AcessibilidadeProvider>
  );
}
