import React, { useEffect, useState } from 'react';
import { AppState, Button, ScrollView, TextInput, View } from 'react-native';
import { AText, useA11y } from './a11y/Acessibilidade';
import { supabase } from './supabase';
import { useSession } from './SessionProvider';

export default function Chat({ roomId, onSent }) {
  const { user, touch } = useSession();
  const { cores, p } = useA11y();
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
      setMessages(previous => previous.some(row => row.id === data.id) ? previous : [...previous, data]);
      setStatus('Mensagem enviada e salva na nuvem.');
    } catch (error) { setStatus(error.message); }
    finally { setSending(false); }
  }
  return <View style={{ flex: 1 }}>
    <AText accessibilityLiveRegion="polite">{status}</AText>
    <ScrollView onScrollBeginDrag={touch}>
      {messages.map(item => <AText key={item.id}>{item.author_id === user.id ? 'Você' : 'Participante'}: {item.body}</AText>)}
    </ScrollView>
    <TextInput accessibilityLabel="Mensagem" value={body} onChangeText={value => { touch(); setBody(value); }}
      maxLength={1000} style={{ borderWidth: 1, borderColor: cores.borda,
        color: cores.texto, fontSize: 16 * p.escala, padding: 12 }} />
    <Button title="Enviar" onPress={send} disabled={sending} />
  </View>;
}
