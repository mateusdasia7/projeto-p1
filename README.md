# TechTask P2 — Sistema de Ordens de Serviço de TI com Entrada Nativa e Acessibilidade

**Aluno:** Mateus Pereira Gomes  
**Disciplina:** Laboratório de Desenvolvimento de Aplicativos Híbridos  
**Professor:** Lucas Hermenegildo do Nascimento  

---

## 1. Identidade do Projeto e Conexão com a P1
- **Problema resolvido:** Técnicos de suporte e manutenção de TI precisam registrar ordens de serviço e rotinas de otimização de computadores com agilidade em campo, mantendo segurança no acesso ao aplicativo e acessibilidade visual/auditiva.
- **Conexão P1 + P2:**
  - **P1 (Web / Nuvem):** Frontend na Vercel (`https://projeto-p1.vercel.app`), API REST no Render (`https://projeto-p1.onrender.com`) e banco MongoDB Atlas (`https://github.com/mateusdasia7/projeto-p1`).
  - **P2 (Mobile React Native / Expo + Supabase):** Evolução do projeto integrando **Acessibilidade (Aula 1)**, **Sessão Remota e RLS no Supabase (Aula 2)**, **Entrada com Recurso Nativo / Biometria (Aula 3)**, **Notificações Push e Áudio (Aulas 4–5)** e **Chat em Tempo Real (Aula 6)** ao módulo de **Ordens de Serviço da P1 (`src/DominioP1.js`)**.

---

## 2. Arquitetura dos Arquivos (Aula 3 — Entrada com Recurso Nativo)

1. **`src/SessionProvider.js`**:
   - Gerencia o estado de sessão (`user`, `reason`, `busy`), concessão remota (`begin_session`, `touch_session`, `end_session`) e expiração por inatividade (2 minutos).
   - Lê e grava a preferência biométrica isolada por conta e aparelho no `AsyncStorage` usando a chave `native:<UUID>`. Nenhuma senha ou biometria bruta é armazenada pelo aplicativo.
   - Verifica `LocalAuthentication.hasHardwareAsync()` e `LocalAuthentication.isEnrolledAsync()` antes de abrir o diálogo do sistema operacional (`authenticateAsync`).
   - Monitora o `AppState`: durante o prompt nativo (`nativePrompt.current = true`), ignora o estado transitório `inactive` do iOS, mas executa `logout('Aplicativo em segundo plano')` se o app for para `background`.
2. **`App.js`**:
   - Envolve a aplicação em `<AcessibilidadeProvider>` e `<SessionProvider>`.
   - O componente `<Gate />` só monta `<PrivateArea key={user.id} />` após a confirmação da senha remota + biometria nativa + abertura da concessão `begin_session`.
   - Caso a biometria seja cancelada ou falhe, `logout()` é chamado imediatamente e a tela privada nunca é exibida.
3. **`app.config.example.json`**:
   - Declara os plugins `expo-local-authentication` (com `faceIDPermission`), `expo-notifications`, `expo-audio` e `expo-video`, sem expor chaves reais.
4. **`src/a11y/Acessibilidade.js` e `src/a11y/Libras.js` / `Libras.web.js`**:
   - Preserva integralmente a Aula 1 (tema claro/escuro, escala de fonte 100%, 125% e 150% persistida em `AsyncStorage`, suporte a leitores de tela e instruções em Libras).
5. **`src/DominioP1.js`**:
   - Integra o cadastro, conclusão e exclusão de Ordens de Serviço de TI da P1 dentro da área autenticada.

---

## 3. Como Executar o Projeto

```bash
# 1. Criar projeto base ou instalar dependências
npx expo install @supabase/supabase-js react-native-url-polyfill @react-native-async-storage/async-storage expo-local-authentication expo-notifications expo-device expo-constants expo-audio expo-video expo-dev-client

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Preencha EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no arquivo .env

# 3. Iniciar no ambiente de desenvolvimento
npx expo start
```

Para testar a biometria real e notificações push em dispositivo físico com build nativa:
```bash
npx eas-cli@latest build --profile development --platform android
npx expo start --dev-client
```

---

## 4. Limitações Documentadas (Conforme Guia da Disciplina)
- A confirmação biométrica é uma verificação local do sistema operacional vinculada ao aparelho (`native:UUID`), após a validação da senha remota no Supabase; não substitui a autenticação do servidor nem distingue múltiplas digitais cadastradas no mesmo sistema operacional.
- O logout offline encerra imediatamente a sessão local (`setUser(null)`), enquanto a concessão remota no banco expira pelo prazo máximo de 2 minutos no servidor.
- O histórico do chat recupera as 100 mensagens mais recentes da sala sem paginação antiga.
