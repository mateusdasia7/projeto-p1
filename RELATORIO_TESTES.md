# Relatório de testes — TechTask P2

## Ambiente e identificação

- Data de validação: 19/11/2026.
- Aplicação: https://projeto-p1-nu.vercel.app/.
- API: https://projeto-p1-nu.vercel.app/api/tasks.
- Persistência e identidade: Supabase PostgreSQL/Auth, região São Paulo.
- Código funcional publicado: `2ddf80a`; deploy `dpl_FuUYUcWraazWpadpoD1NaCWYF6zE`.
- Rodada remota: 19/11/2026, 12:14:59 (Brasília), API `b5bad9f`. Backend, SQL e protocolo de sincronização idênticos aos da publicação `2ddf80a`; a revisão posterior ajusta a confirmação visual de ativação dos avisos.
- Contas fictícias: A e C solicitantes; B técnico. A/B pertencem à sala de suporte; C não participa.

## 1. Testes automatizados locais

| Conjunto | Resultado | Cobertura |
|---|---|---|
| Domínio compartilhado, banco, sessão e service worker | 39 aprovados | RLS, papéis, recibos, conflitos, fila durável, cofres, eventos, revogação e isolamento do cache |
| API Express | 10 aprovados | Autenticação, validação de campos, autorização, conflito HTTP 409, falhas e CORS |
| Interface web | 14 aprovados | Login/passkey, cancelamento, fila pendente, falha local, papéis, notificações e sessão em RAM |
| Total | 63 aprovados | Sem testes reprovados na rodada registrada |

Comandos: `npm test`, `npm test --prefix backend` e `npm test --prefix frontend`.

O banco local de teste usa PGlite com papéis de acesso restritos. Os testes de interface usam respostas controladas e não representam confirmação física de biometria ou recebimento pelo sistema operacional.

Build web concluído. Exportação Android/Hermes concluída com 764 módulos. A exportação é um bundle, não um APK nem prova de execução do cliente Expo em aparelho físico.

## 2. Testes remotos de integração e autorização

Execução: `scripts/lab-p2.mjs`, Node 24.22.3/Linux, clientes autenticados com chave pública. As consultas de comprovação de RLS não usam SQL administrativo.

Pré-condições: três contas distintas confirmadas, papéis preparados, sala A/B, concessões vigentes e API publicada. A prova automatizada de desconexão desliga o transporte do motor e usa IndexedDB emulado; API e banco são reais.

| ID | Conta | Passos | Esperado | Obtido | Status |
|---|---|---|---|---|---|
| A-PERSISTENCIA | A/B/C | A abre ordem; nova autenticação consulta; B consulta; C tenta consultar. | Uma ordem persistida; B autorizado; C com zero linhas. | A criou=201; nova autenticação leu=1; técnico B leu=1; C leu=0. | Aprovado |
| B-SEM-SESSAO | Anônimo | Consultar, inserir, atualizar e excluir sem JWT. | Quatro respostas HTTP 401. | GET, POST, PUT e DELETE=401. | Aprovado |
| B-PERFIS | A/B | A tenta concluir; B tenta editar texto/excluir de A; B conclui. | Negativas 403; técnico conclui e solicitante vê resultado. | Dois perfis distintos; três negativas=403; B concluiu=200; A confirmou completed=true. | Aprovado |
| A6-01-03 | A/B | Ler próprio perfil, tentar ler B e elevar o próprio papel. | Próprio=1; B=0; alteração role=42501. | Próprio=1; perfil B=0; role=42501; papel final solicitante. | Aprovado |
| A6-04-05 | A/B/C | A envia mensagem própria; autoria B forjada; C lê/envia na sala A/B. | B lê a interação; autoria falsa e C são bloqueados. | Mensagem própria visível a B=1; forjada=42501; leitura C=0; envio C=42501. | Aprovado |
| D-OFFLINE | A | Desligar transporte, gravar no IndexedDB, reiniciar motor e reconectar à API real. | Fila durável e uma ordem na nuvem, sem duplicação. | Escrita durável offline=1; após reinício fila=1; após reconexão fila=0 e banco=1; segundo envio banco=1. Runtime Node, IndexedDB emulado; API e banco reais. | Aprovado |
| D-RESPOSTA-PERDIDA | A | Aceitar escrita no servidor, simular perda da resposta e reenviar o mesmo UUID. | Um registro e recibo replayed=true. | Primeiro aceite=201; reenvio=201/replayed=true; linhas finais=1; UUID reutilizado com payload diferente=409. | Aprovado |
| D-CONFLITO | A/B | A prepara edição na versão 1; B conclui; A envia versão antiga e depois resolve usando versão atual. | 409 preserva versão da nuvem; reenvio consciente mantém conclusão. | Versão antiga=409; nuvem continuou concluída/versão 2; resolução explícita=200/versão 3 e completed=true. | Aprovado |
| NOTIFICACAO-EVENTO | A/B/C | Criar ordem real e consultar evento pela conta destinatária B; C tenta consultar; cliente tenta fabricar evento. | Evento persistido com identidade de A, visível a B e oculto de C. | Evento real=1; autoria A conferida; leitura C=0; escrita direta=42501. Exibição pelo SO requer demonstração no aparelho. | Aprovado |
| E-ENTRADA-INVALIDA | A | Tentar título vazio, autoria forjada e atualização sem versão. | HTTP 400; nenhuma alteração indevida. | Título vazio=400; autoria forjada=400; versão ausente=400. | Aprovado |
| RLS-ESCRITA-DIRETA | A/B | Tentar alterar tasks sem a transação autorizada e ler o diário privado. | Permissão 42501 para todas as tentativas. | INSERT direto=42501; UPDATE direto=42501; diário privado=42501. | Aprovado |
| E-REVOGACAO | A | Revogar concessão e repetir consultas conservando JWT em RAM; tentar reabrir concessão. | JWT ainda autenticado, dados privados negados e API 401. | JWT idêntico e usuário válido; concessão=false; seis tabelas=0; API=401; reabertura recusada. | Aprovado |

As ordens da rodada foram removidas pela própria conta de teste. A ordem anterior permaneceu no banco. Eventos, recibos e mensagem fictícia de integração permanecem como registros de validação.

## 3. Demonstração em dispositivo e computador

Arquivo anexado ao pacote: `evidencias/demonstracao.mp4`. Duração aproximada: 2 minutos. Ambiente visível: navegador no celular Android e navegador no computador. Modelo do aparelho e versões dos sistemas/navegadores não são identificados na gravação. Os intervalos abaixo são aproximados.

| Caso | Trecho | Resultado observado | Evidência |
|---|---|---|---|
| Recurso nativo — sucesso | 00:08–00:16 | O sistema solicita confirmação de identidade; após a confirmação, a área privada abre | Comprovado no vídeo |
| Criação e interação A/B | 00:16–00:46 | Uma ordem é criada no celular, exibida no computador, concluída e atualizada no celular | Comprovado no vídeo |
| Reabertura e recuperação do estado | 00:54–01:06 | O estado da mesma ordem é alterado no computador e aparece atualizado no celular | Comprovado no vídeo |
| Operação significativa offline | 01:08–01:30 | A rede é desligada; uma nova ordem é registrada; o aplicativo mostra uma pendência salva no aparelho | Comprovado no vídeo |
| Reconexão e sincronização | 01:30–02:00 | A conexão retorna, a pendência desaparece e a ordem fica disponível para atendimento no computador; o estado volta ao celular | Comprovado no vídeo; não se observa duplicação da ordem criada |
| Recurso nativo — cancelamento | Início do vídeo | Há mensagem de confirmação cancelada/não concluída; o ato de cancelar o diálogo não é mostrado | Evidência parcial |
| Notificação do sistema operacional | Não exibida | O vídeo não mostra solicitação de permissão nem o aviso local recebido | Exibição física não comprovada nesta gravação |
| Negativas de acesso e exceções | Não exibidas | Os resultados de servidor constam na seção 2; não há demonstração visual dessas tentativas no vídeo | Comprovado por cliente HTTP; demonstração visual não incluída |

A demonstração corresponde ao cliente web em dispositivo físico. A execução física do cliente Expo, a indisponibilidade do autenticador e o recebimento de notificações pelo SO não são atestados por essa gravação.

## 4. Critérios e limites da evidência

A geração de eventos autorizados no banco e a lógica dos avisos locais foram testadas. Isso é distinto da exibição de uma notificação pelo SO. Os avisos dependem de permissão e de aplicativo aberto em ambiente compatível.

SELECT negado por RLS pode retornar lista vazia; contagens e estado final fazem parte das verificações. A ausência de erro isoladamente não é considerada autorização concedida. As operações com sessão revogada foram repetidas com JWT ainda válido, antes do encerramento local da autenticação.

Nenhum resultado de hardware não observado foi classificado como aprovado. O vídeo é distribuído com o pacote de evidências; as credenciais de laboratório são fornecidas separadamente.

## Integridade do vídeo

- Arquivo de origem: `1000232145.mp4`.
- Arquivo no pacote: `evidencias/demonstracao.mp4`.
- Conteúdo preservado sem edição.
- SHA-256: `9cf9fb9b55213d5a927704854f48b196b4ad3a2709006b66020bfbfb6cb5469f`.
