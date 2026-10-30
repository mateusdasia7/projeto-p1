import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AText, useA11y } from './Acessibilidade';

export default function Libras() {
  const [falha, setFalha] = useState(false);
  const { cores } = useA11y();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('p2-vlibras-script')) return;
    const s = document.createElement('script');
    s.id = 'p2-vlibras-script';
    s.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
    s.onload = () => {
      if (window.VLibras) new window.VLibras.Widget('https://vlibras.gov.br/app');
      else setFalha(true);
    };
    s.onerror = () => setFalha(true);
    document.body.appendChild(s);
  }, []);

  return (
    <View style={{ padding: 12, borderWidth: 1, borderColor: cores.borda, borderRadius: 8, gap: 8 }}>
      <AText accessibilityRole="header" style={{ fontWeight: 'bold' }}>
        Guia em Libras — Fluxo Principal (Ordens de Serviço e Entrada Nativa)
      </AText>
      <AText>
        1. Faça login com seu e-mail e senha institucional. 2. No Perfil, toque em Ativar entrada nativa para habilitar a confirmação por biometria neste aparelho. 3. Na aba Ordens de Serviço (P1), cadastre o título da manutenção e a descrição técnica.
      </AText>
      {typeof document !== 'undefined' && React.createElement('div', { vw: 'true', className: 'enabled' },
        React.createElement('div', { 'vw-access-button': 'true', className: 'active' }),
        React.createElement('div', { 'vw-plugin-wrapper': 'true' },
          React.createElement('div', { className: 'vw-plugin-top-wrapper' })))}
      {falha && <AText accessibilityRole="alert">Tradução em Libras indisponível. Tente novamente com conexão.</AText>}
    </View>
  );
}
