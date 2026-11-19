# TechTask — Ordens de serviço

Aplicação de suporte técnico com clientes web/PWA e React Native, API Express e persistência em nuvem. Permite abertura e atendimento de ordens, autenticação com recurso nativo, autorização por perfil, operação offline e interação entre usuários.

## Endereços

| Recurso | Endereço |
|---|---|
| Aplicação | https://projeto-p1-nu.vercel.app/ |
| API — ordens | https://projeto-p1-nu.vercel.app/api/tasks |
| API — saúde | https://projeto-p1-nu.vercel.app/api/health |
| Repositório | https://github.com/mateusdasia7/projeto-p1 |

## Arquitetura

| Componente | Tecnologia e responsabilidade |
|---|---|
| `frontend/` | React 18/Vite; interface responsiva, passkeys, instalação PWA e notificações locais |
| `backend/` | Node.js 24/Express; validação, verificação de identidade/concessão e encaminhamento do JWT |
| `src/` e `App.js` | React Native/Expo SDK 58; cliente móvel e confirmação local pelo sistema operacional |
| `shared/` | Protocolo de sessão, fila offline, transporte da API e processamento de eventos |
| `supabase/` | Esquema PostgreSQL, RLS, RPCs transacionais e preparação das contas de teste |
| `tests/` | Testes do domínio, persistência local, segurança e sincronização |

Frontend e API estão hospedados na Vercel; banco e autenticação no Supabase. `render.yaml` oferece configuração alternativa para o mesmo backend. A exportação Android foi validada; o pacote não inclui APK. O vídeo de demonstração corresponde ao cliente web no celular e no computador.

## Funcionalidades e regras

- Login por e-mail/senha ou chave de acesso no site. No cliente Expo, a confirmação nativa pode ser habilitada após autenticação. Cancelamento, indisponibilidade e falha são tratados.
- Sessão em RAM e concessão remota de dois minutos vinculada ao login. Atividade renova a concessão; logout, inatividade e saída do primeiro plano encerram a área privada. A fila local é preservada.
- RLS em todas as nove tabelas públicas. Somente o nome do próprio perfil é editável; papel não é concedido por metadados do usuário.
- Solicitante edita texto/exclui apenas suas ordens. Técnico consulta a fila e conclui/reabre ordens. Mensagens exigem participação na sala e autoria autenticada.
- Gravações de ordens passam por RPC autorizada. UUID de operação e recibo transacional evitam duplicação. Versão esperada permite detectar conflitos e escolher qual alteração manter.
- IndexedDB/AES-GCM no site e SecureStore no Expo preservam pendências por conta. O service worker guarda somente a interface pública, sem respostas privadas de API/Auth.
- Eventos reais são persistidos por destinatário. Com permissão do SO e aplicativo aberto, o cliente emite aviso local e evita repetição pelo ID do evento.
- Tema claro/escuro, ajuste de fonte, rótulos, foco e estados de carregamento, vazio e erro.

## Perfis de teste

| Conta fictícia | Papel | Permissões |
|---|---|---|
| A — `alunoa@lab.edu` | Solicitante | Ordens próprias e sala A/B |
| B — `alunob@lab.edu` | Técnico | Consultar fila, concluir/reabrir ordens e participar da sala A/B |
| C — `alunoc@lab.edu` | Solicitante | Ordens próprias; sem acesso às ordens de A ou à sala A/B |

Todos podem criar ordens próprias. Apenas o proprietário altera texto ou exclui uma ordem; apenas técnico altera o estado de atendimento. Senhas das contas fictícias são disponibilizadas separadamente para avaliação.

## Ambiente e execução

Requisitos: Node.js 24, npm e navegador com HTTPS/WebAuthn para chaves de acesso. Para o cliente Android, Expo Go compatível com SDK 58 e computador/celular na mesma rede.

```bash
npm ci
npm ci --prefix backend
npm ci --prefix frontend
```

Configuração: usar os modelos `.env.example`, `backend/.env.example`, `frontend/.env.example` e `.env.lab.example`. Arquivos preenchidos não são versionados.

| Ambiente | Variáveis |
|---|---|
| API | `PORT`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CORS_ORIGINS` |
| Web | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` |
| Expo | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_P1_API_URL` |
| Testes remotos | `LAB_SUPABASE_URL`, `LAB_SUPABASE_ANON_KEY`, `LAB_API_URL`, `LAB_ROOM_ID`, `LAB_A_EMAIL/PASSWORD`, `LAB_B_EMAIL/PASSWORD`, `LAB_C_EMAIL/PASSWORD` |

A URL Supabase e a chave pública devem corresponder ao mesmo projeto. A API usa a identidade do chamador, sem chave administrativa. O RP ID das passkeys da instalação hospedada é `projeto-p1-nu.vercel.app`.

API e web, em terminais separados:

```bash
npm start --prefix backend
npm run dev --prefix frontend
```

Cliente Android:

```bash
npm run android:go
```

O comando Android prepara o `.env` somente quando ausente, a partir de `mobile.config.public.json`, e inicia o Expo Go na rede local. Face ID em iPhone exige build compatível. A confirmação nativa continua subordinada à autenticação e à autorização remotas.

### Banco e implantação

Em projeto Supabase novo, aplicar `supabase/schema.sql`, criar/confirmar A/B/C em Authentication e aplicar `supabase/seed-lab.sql` como preparação administrativa. O seed define B técnico. Os testes de RLS usam cliente autenticado com chave pública.

No projeto hospedado, a migração `20261119144705_p2_perfis_sincronizacao_eventos.sql` já está aplicada e preservou os registros anteriores. O esquema completo é destinado à instalação inicial.

Vercel: raiz `frontend`; instalação `npm ci --prefix ../backend && npm ci`; build `npm run build`; saída `dist`; Node 24 e acesso a arquivos fora da raiz. A API é exposta por `frontend/api/index.js`. As mesmas variáveis públicas são configuradas no ambiente de hospedagem.

## Testes

```bash
npm test
npm test --prefix backend
npm test --prefix frontend
npm run build --prefix frontend
npx expo export --platform android --output-dir dist-android
```

Testes remotos, com `.env.lab` preenchido com contas fictícias e chave pública:

```bash
npm run test:lab
```

O executor gera relatório sanitizado em `reports/`. Os 63 testes locais e os 12 casos remotos da rodada registrada estão documentados em `RELATORIO_TESTES.md`, juntamente com a demonstração física e os limites de comprovação.

## Cenários de validação

| Cenário | Procedimento | Resultado esperado |
|---|---|---|
| A — fluxo completo | A autentica, cria e consulta uma ordem; B consulta e atende; A consulta novamente | Persistência e efeito da ação entre contas autorizadas |
| B — segurança | Consultar recurso protegido sem sessão e executar alteração incompatível com o papel | Bloqueio no servidor; estado final preservado |
| C — recurso nativo | Confirmar entrada; repetir cancelando ou em condição de falha/indisponibilidade | Acesso somente após confirmação válida; falha explicada sem liberar área privada |
| D — rede | Após login e preparação da interface, desconectar, registrar ordem, reconectar e consultar | Fila durável, status visível, sincronização e ausência de duplicação |
| E — resiliência | Enviar entrada inválida ou provocar sessão encerrada/falha de serviço | Mensagem compreensível, aplicação recuperável e pendência preservada |

Para validar eventos, uma conta autorizada permanece aberta com notificações permitidas enquanto outra altera uma ordem. O aviso local e o evento correspondente devem ser verificáveis. A edição offline concorrente deve apresentar conflito e permitir uma escolha explícita.

## Limites operacionais

O primeiro login exige rede. Um novo processo não recupera JWT do disco: exige autenticação, após a qual a mesma conta recupera sua fila. A concessão pode expirar durante a desconexão; o reenvio exige nova autenticação válida. Limpar o armazenamento do aplicativo remove pendências ainda não sincronizadas.

Notificações locais dependem de permissão e suporte do SO/navegador, com aplicativo aberto. O chat recupera as 100 mensagens mais recentes. A função Expo push `notificar` permanece como módulo adicional protegido; não é dependência do mecanismo de avisos locais utilizado nas ordens.
