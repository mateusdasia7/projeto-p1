import React from 'react';
import { View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AText, useA11y } from './Acessibilidade';

function VideoLibras({ uri }) {
  const player = useVideoPlayer(uri);
  return (
    <View style={{ gap: 8 }}>
      <AText accessibilityRole="header" style={{ fontWeight: 'bold' }}>
        Orientações em Libras (Vídeo Nativo)
      </AText>
      <VideoView player={player} nativeControls style={{ width: '100%', height: 220 }} />
      <AText>
        Transcrição do vídeo: Para utilizar o sistema TechTask P2, autentique-se com e-mail e senha, ative a biometria nativa no perfil para proteger sua conta neste aparelho e registre as ordens de serviço de manutenção de TI na tela principal.
      </AText>
    </View>
  );
}

export default function Libras() {
  const { cores } = useA11y();
  const uri = process.env.EXPO_PUBLIC_LIBRAS_VIDEO_URL;
  return (
    <View style={{ padding: 12, borderWidth: 1, borderColor: cores.borda, borderRadius: 8, gap: 8 }}>
      {uri ? (
        <VideoLibras uri={uri} />
      ) : (
        <>
          <AText accessibilityRole="header" style={{ fontWeight: 'bold' }}>
            Ajuda e Transcrição Acessível (Libras)
          </AText>
          <AText>
            Fluxo do aplicativo: 1) Login remoto no Supabase; 2) Ativação opcional de biometria por conta e aparelho; 3) Registro e controle de Ordens de Serviço de TI (P1). Configure EXPO_PUBLIC_LIBRAS_VIDEO_URL no .env para exibir o vídeo em Libras.
          </AText>
        </>
      )}
    </View>
  );
}
