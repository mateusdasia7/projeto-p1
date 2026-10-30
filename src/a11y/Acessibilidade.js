import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const padrao = { tema: 'claro', escala: 1 };
const chave = 'p2.acessibilidade';
const Ctx = createContext(null);

export function AcessibilidadeProvider({ children }) {
  const [p, setP] = useState(padrao);
  const [pronto, setPronto] = useState(false);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vivo = true;
    AsyncStorage.getItem(chave)
      .then(raw => {
        if (raw && vivo) {
          const x = JSON.parse(raw);
          setP({
            tema: x.tema === 'escuro' ? 'escuro' : 'claro',
            escala: [1, 1.25, 1.5].includes(x.escala) ? x.escala : 1,
          });
        }
      })
      .catch(() => { if (vivo) setAviso('Não foi possível recuperar as preferências'); })
      .finally(() => { if (vivo) setPronto(true); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (pronto) {
      AsyncStorage.setItem(chave, JSON.stringify(p))
        .catch(() => setAviso('Não foi possível salvar as preferências'));
    }
  }, [p, pronto]);

  const cores = p.tema === 'escuro'
    ? { fundo: '#121212', card: '#1E1E1E', texto: '#FAFAFA', borda: '#CCCCCC', destaque: '#60A5FA' }
    : { fundo: '#FFFFFF', card: '#F8FAFC', texto: '#171717', borda: '#555555', destaque: '#2563EB' };

  return (
    <Ctx.Provider value={{ p, mudar: x => setP(v => ({ ...v, ...x })), cores, aviso }}>
      {pronto ? children : <Text>Carregando preferências…</Text>}
    </Ctx.Provider>
  );
}

export function useA11y() {
  const c = useContext(Ctx);
  if (!c) throw new Error('Adicione AcessibilidadeProvider');
  return c;
}

export function AText({ style, ...props }) {
  const { p, cores } = useA11y();
  return (
    <Text
      {...props}
      allowFontScaling
      style={[{ color: cores.texto, fontSize: 16 * p.escala, lineHeight: 24 * p.escala }, style]}
    />
  );
}

export function Ajustes() {
  const { p, mudar, cores, aviso } = useA11y();
  return (
    <View style={{ backgroundColor: cores.card, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: cores.borda, gap: 12 }}>
      <AText accessibilityRole="header" style={{ fontWeight: 'bold' }}>
        Acessibilidade (Aula 1 Preservada)
      </AText>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Tema escuro"
        accessibilityState={{ checked: p.tema === 'escuro' }}
        onPress={() => mudar({ tema: p.tema === 'claro' ? 'escuro' : 'claro' })}
        style={{ minHeight: 48, padding: 12, borderWidth: 1, borderColor: cores.borda, borderRadius: 6, justifyContent: 'center' }}
      >
        <AText>Tema atual: {p.tema === 'escuro' ? 'Escuro 🌙' : 'Claro ☀️'} (Toque para alternar)</AText>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[1, 1.25, 1.5].map(escala => (
          <Pressable
            key={escala}
            accessibilityRole="button"
            accessibilityLabel={`Fonte ${escala * 100} por cento`}
            accessibilityState={{ selected: p.escala === escala }}
            onPress={() => mudar({ escala })}
            style={{
              minHeight: 48,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderWidth: p.escala === escala ? 2 : 1,
              borderColor: p.escala === escala ? cores.destaque : cores.borda,
              borderRadius: 6,
              justifyContent: 'center',
            }}
          >
            <AText style={{ fontWeight: p.escala === escala ? 'bold' : 'normal' }}>
              Fonte {escala * 100}%
            </AText>
          </Pressable>
        ))}
      </View>
      <AText>
        Texto de teste: confira se a leitura e a navegação das Ordens de Serviço e Biometria continuam claras com a maior fonte.
      </AText>
      {!!aviso && <AText accessibilityRole="alert">{aviso}</AText>}
    </View>
  );
}
