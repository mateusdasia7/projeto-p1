# Relatório e Registro de Testes — Laboratório P2 (Aula 3 e Integração)

**Aluno:** Mateus Pereira Gomes  
**Disciplina:** Laboratório de Desenvolvimento de Aplicativos Híbridos  
**Professor:** Lucas Hermenegildo do Nascimento  
**Domínio do Projeto (P1 integrado à P2):** TechTask — Sistema de Controle de Ordens de Serviço e Otimização de TI  

---

## 1. Casos de Teste da Aula 3 — Entrada com Recurso Nativo (`A3-01` a `A3-06`)

| ID | Conta Fictícia | Dispositivo / Ambiente | Pré-condição | Passos Executados | Resultado Esperado | Resultado Obtido | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A3-01** | Conta A (`alunoA@lab.edu`) | Aparelho físico Android (Build dev EAS) | Biometria cadastrada no sistema operacional e `native:UUID_A = true` ativo | 1. Informar e-mail e senha da Conta A.<br>2. Tocar em `Entrar`.<br>3. Confirmar digital/biometria no diálogo do SO. | Tela privada liberada após login remoto e concessão `begin_session` aberta. | Após validar senha no Supabase e confirmar biometria no diálogo nativo, a `PrivateArea` foi montada com sucesso. | **Aprovado** |
| **A3-02** | Conta A (`alunoA@lab.edu`) | Aparelho físico Android (Build dev EAS) | `native:UUID_A = true` ativo no aparelho | 1. Informar e-mail e senha da Conta A.<br>2. Tocar em `Entrar`.<br>3. Tocar em `Cancelar` no diálogo biométrico. | Tela privada continua bloqueada; `logout()` é acionado e usuário retorna à tela de entrada. | O `SessionProvider` lançou `'Entrada nativa não autorizada'`, executou `logout()`, não chamou `begin_session` e manteve a tela `Login`. | **Aprovado** |
| **A3-03** | Conta A (`alunoA@lab.edu`) | Aparelho sem biometria cadastrada | `isEnrolledAsync()` retorna `false` nas configurações do sistema | 1. Entrar com e-mail e senha (com recurso nativo ainda desativado).<br>2. Na área privada, tocar em `Ativar entrada nativa`. | Ativação negada com mensagem informativa ao usuário; chave `native:UUID` não é gravada. | Exibida mensagem `'Cadastre biometria nas configurações do aparelho'` via `accessibilityLiveRegion="polite"`. | **Aprovado** |
| **A3-04** | Conta A (`alunoA@lab.edu`) | Aparelho físico Android (Build dev EAS) | `native:UUID_A = true` ativo no aparelho | 1. Informar e-mail e senha da Conta A.<br>2. Quando o diálogo biométrico abrir, minimizar/trocar de app (`AppState = background`). | Entrada cancelada; sessão não é concedida e `logout('Aplicativo em segundo plano')` é executado. | Flag `backgroundDuringPrompt.current = true` impediu a concessão da sessão e encerrou imediatamente. | **Aprovado** |
| **A3-05** | Conta B (`alunoB@lab.edu`) | Mesmo aparelho físico onde Conta A ativou biometria | `native:UUID_A = true`, porém Conta B nunca ativou (`native:UUID_B` ausente) | 1. Sair da Conta A.<br>2. Informar e-mail e senha da Conta B.<br>3. Tocar em `Entrar`. | Preferência da Conta A não se aplica à Conta B — isolamento correto por `native:UUID`. | Conta B entrou diretamente com senha remota sem solicitar biometria da Conta A. | **Aprovado** |
| **A3-06** | Conta A (`alunoA@lab.edu`) | Build iOS (Face ID) | Permissão `faceIDPermission` declarada em `app.json` | 1. Executar build nativa iOS.<br>2. Ativar entrada nativa e autenticar com Face ID. | Diálogo nativo efetivo sem derrubar sessão durante estado `inactive` do prompt iOS. | Estado `inactive` ignorado enquanto `nativePrompt.current === true`; pendente validação em hardware iOS físico caso testado apenas em Android. | **Pendente (caso sem iPhone físico) / Documentado** |

---

## 2. Casos de Teste de Integração e Acessibilidade (`A7-01` a `A7-06`)

| ID | Ação | Resultado Esperado | Comportamento Verificado no Projeto | Status |
| :--- | :--- | :--- | :--- | :--- |
| **A7-01** | Fonte ampliada (150%) e Tema Claro/Escuro | Sem texto cortado, contraste adequado e persistência em `AsyncStorage` (`p2.acessibilidade`) | Componentes usam `AText` sem altura fixa; tema escuro (`#121212`/`#FAFAFA`) e claro (`#FFFFFF`/`#171717`) persistem ao reiniciar. | **Aprovado** |
| **A7-02** | Libras e Leitor de Tela (TalkBack/VoiceOver) | Conteúdo em Libras referente ao fluxo e rótulos `accessibilityLabel` / `accessibilityLiveRegion` | VLibras na web e vídeo com transcrição no nativo; todos os `TextInput` e botões possuem `accessibilityLabel`. | **Aprovado** |
| **A7-03** | Fluxo completo A/B + Domínio P1 | Login + Biometria + Cadastro de Ordem de Serviço (P1) + Chat em tempo real | Usuário autentica, registra Ordem de Serviço sincronizada com a nuvem da P1 e envia mensagem na sala. | **Aprovado** |
| **A7-04** | Abrir push com sessão expirada | Exigir login antes de exibir qualquer conteúdo privado | Como `persistSession: false` e o `Gate` desmonta a `PrivateArea` quando `user === null`, exige login antes. | **Aprovado** |
| **A7-05** | Negativas de acesso (Conta C fora da sala) | Sem acesso a mensagens/salas de outra conta (RLS no Supabase) | Conta C não pertence a `room_members` e não visualiza nem insere mensagens na sala restrita. | **Aprovado** |
| **A7-06** | Reinstalar / Novo aparelho | Setup e permissões documentados em `app.config.example.json` e `00_PREPARACAO.md` | Documentado e reproduzível sem chaves secretas expostas no Git. | **Aprovado** |
