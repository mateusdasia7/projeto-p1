import React, { useEffect, useState } from 'react';
import { AppState, Button, ScrollView, Text, TextInput, View } from 'react-native';
import { supabase } from './supabase';
import { useSession } from './SessionProvider';

export default function Chat({ roomId, onSent }) {
  const { user, touch } = useSession();
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('Conectando');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const merge = rows => setMessages(previous => {
      const map = new Map(previous.map(row => [row.id, row]));
      rows.forEach(row => map.set(row.id, row));
      return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
    async function recover() {
      const current = ++revision;
      const { data, error } = await supabase.from('messages').select('*')
        .eq('room_id', roomId).order('created_at', { ascending: false }).limit(100);
      if (!alive || current !== revision) return;
      if (error) setStatus('Falha: ' + error.message);
      else merge(data);
    }
    setMessages([]);
    const channel = supabase.channel('room-' + roomId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages', filter: 'room_id=eq.' + roomId,
      }, payload => { if (alive) merge([payload.new]); })
      .subscribe(state => {
        if (!alive) return;
        setStatus(state);
        if (state === 'SUBSCRIBED') void recover();
      });
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') void recover();
    });
    return () => { alive = false; app.remove(); void supabase.removeChannel(channel); };
  }, [roomId, user.id]);
  async function send() {
    touch();
    if (sending || !body.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.from('messages')
        .insert({ room_id: roomId, author_id: user.id, body: body.trim() }).select().single();
      if (error) throw error;
      setBody('');
      onSent?.();
      const { error: pushError } = await supabase.functions.invoke('notificar', {
        body: { messageId: data.id },
      });
      setStatus(pushError ? 'Mensagem salva; push não enviado' : 'Mensagem salva; envio solicitado');
    } catch (error) { setStatus(error.message); }
    finally { setSending(false); }
  }
  return <View style={{ flex: 1 }}>
    <Text accessibilityLiveRegion="polite">{status}</Text>
    <ScrollView onScrollBeginDrag={touch}>
      {messages.map(item => <Text key={item.id}>{item.author_id === user.id ? 'Você' : 'Participante'}: {item.body}</Text>)}
    </ScrollView>
    <TextInput accessibilityLabel="Mensagem" value={body} onChangeText={value => { touch(); setBody(value); }}
      maxLength={1000} style={{ borderWidth: 1, padding: 12 }} />
    <Button title="Enviar" onPress={send} disabled={sending} />
  </View>;
}
