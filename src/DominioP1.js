import React, { useState, useEffect } from 'react';
import { View, TextInput, Button, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AText, useA11y } from './a11y/Acessibilidade';
import { useSession } from './SessionProvider';

const API_URL = process.env.EXPO_PUBLIC_P1_API_URL || 'https://projeto-p1.onrender.com';

export default function DominioP1() {
  const { user, touch } = useSession();
  const { cores, p } = useA11y();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [ordens, setOrdens] = useState([]);
  const [resposta, setResposta] = useState('');
  const [sincronizando, setSincronizando] = useState(false);

  const storageKey = `p1.ordens:${user?.id || 'anon'}`;

  useEffect(() => {
    carregarOrdens();
  }, [user?.id]);

  async function carregarOrdens() {
    touch();
    setSincronizando(true);
    try {
      // Tenta buscar da API na nuvem da P1 (Render/MongoDB) e mantém cópia local por conta
      const res = await fetch(`${API_URL}/api/tasks`);
      if (res.ok) {
        const data = await res.json();
        setOrdens(data);
        await AsyncStorage.setItem(storageKey, JSON.stringify(data));
        setResposta('Dados sincronizados com a nuvem da P1.');
        return;
      }
    } catch {
      // Fallback para armazenamento local da conta caso o servidor gratuito esteja acordando
    } finally {
      setSincronizando(false);
    }

    try {
      const local = await AsyncStorage.getItem(storageKey);
      if (local) setOrdens(JSON.parse(local));
    } catch {
      setResposta('Não foi possível carregar as ordens salvas.');
    }
  }

  async function cadastrarOrdem() {
    touch();
    if (!titulo.trim() || !descricao.trim()) {
      setResposta('Preencha o título do chamado e a descrição técnica!');
      return;
    }

    const nova = {
      _id: String(Date.now()),
      title: titulo.trim(),
      description: descricao.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };

    try {
      const res = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nova.title, description: nova.description }),
      });
      if (res.ok) {
        const criada = await res.json();
        const atualizadas = [criada, ...ordens];
        setOrdens(atualizadas);
        await AsyncStorage.setItem(storageKey, JSON.stringify(atualizadas));
        setTitulo('');
        setDescricao('');
        setResposta(`Ordem de serviço cadastrada na nuvem: "${criada.title}"!`);
        return;
      }
    } catch {
      // Continua para persistência local caso offline
    }

    const atualizadas = [nova, ...ordens];
    setOrdens(atualizadas);
    await AsyncStorage.setItem(storageKey, JSON.stringify(atualizadas));
    setTitulo('');
    setDescricao('');
    setResposta(`Ordem de serviço registrada: "${nova.title}"!`);
  }

  async function alternarStatus(item) {
    touch();
    const atualizado = { ...item, completed: !item.completed };
    const novaLista = ordens.map(o => (o._id === item._id ? atualizado : o));
    setOrdens(novaLista);
    await AsyncStorage.setItem(storageKey, JSON.stringify(novaLista));
    setResposta(atualizado.completed ? 'Ordem marcada como concluída!' : 'Ordem reaberta!');

    try {
      await fetch(`${API_URL}/api/tasks/${item._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(atualizado),
      });
    } catch {}
  }

  async function excluirOrdem(id) {
    touch();
    const novaLista = ordens.filter(o => o._id !== id);
    setOrdens(novaLista);
    await AsyncStorage.setItem(storageKey, JSON.stringify(novaLista));
    setResposta('Ordem de serviço excluída.');

    try {
      await fetch(`${API_URL}/api/tasks/${id}`, { method: 'DELETE' });
    } catch {}
  }

  return (
    <View style={{ backgroundColor: cores.card, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: cores.borda, gap: 12 }}>
      <AText accessibilityRole="header" style={{ fontWeight: 'bold' }}>
        Domínio P1 — Controle de Ordens de Serviço e Otimização de TI
      </AText>
      <AText>
        Registre manutenções, ajustes de latência e diagnósticos vinculados à sessão autenticada.
      </AText>

      <TextInput
        accessibilityLabel="Título da ordem de serviço"
        placeholder="Ex: Otimização de Latência e Limpeza de Cache"
        placeholderTextColor={cores.borda}
        value={titulo}
        onChangeText={t => { touch(); setTitulo(t); }}
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
        accessibilityLabel="Descrição técnica do procedimento"
        placeholder="Ex: Ajuste de serviços em segundo plano e verificação de SSD"
        placeholderTextColor={cores.borda}
        value={descricao}
        onChangeText={d => { touch(); setDescricao(d); }}
        style={{
          borderWidth: 1,
          borderColor: cores.borda,
          borderRadius: 6,
          padding: 12,
          color: cores.texto,
          fontSize: 16 * p.escala,
        }}
      />

      <Button title="Cadastrar Ordem de Serviço" onPress={cadastrarOrdem} />
      <Button title={sincronizando ? 'Sincronizando...' : 'Sincronizar com Nuvem P1'} onPress={carregarOrdens} disabled={sincronizando} />

      {!!resposta && (
        <AText accessibilityLiveRegion="polite" style={{ fontWeight: 'bold' }}>
          {resposta}
        </AText>
      )}

      {ordens.map(item => (
        <View
          key={item._id}
          style={{
            padding: 12,
            borderWidth: 1,
            borderColor: cores.borda,
            borderRadius: 6,
            gap: 6,
          }}
        >
          <AText style={{ fontWeight: 'bold', textDecorationLine: item.completed ? 'line-through' : 'none' }}>
            [{item.completed ? 'CONCLUÍDA' : 'PENDENTE'}] {item.title}
          </AText>
          {!!item.description && <AText>{item.description}</AText>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.completed ? `Reabrir ${item.title}` : `Concluir ${item.title}`}
              onPress={() => alternarStatus(item)}
              style={{ minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: cores.borda, borderRadius: 6, justifyContent: 'center' }}
            >
              <AText>{item.completed ? 'Reabrir' : '✓ Concluir'}</AText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Excluir ${item.title}`}
              onPress={() => excluirOrdem(item._id)}
              style={{ minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: cores.borda, borderRadius: 6, justifyContent: 'center' }}
            >
              <AText>✕ Excluir</AText>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
