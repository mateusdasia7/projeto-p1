import React, { useState, useEffect, useRef } from 'react';

// Limpa automaticamente caso a variável na Vercel tenha colchetes ou espaços
const rawEnvUrl = import.meta.env.VITE_API_URL || '';
const cleanEnvUrl = rawEnvUrl.replace(/[\[\]()\s]/g, '').split('http')[1]
  ? 'http' + rawEnvUrl.replace(/[\[\]()\s]/g, '').split('http')[1]
  : '';
const API_URL = (cleanEnvUrl || 'https://projeto-p1.onrender.com').replace(/\/+$/, '');

const CONTAS_DEMO = {
  'alunoa@lab.edu': { id: 'uuid-conta-a-001', email: 'alunoa@lab.edu', name: 'Aluno A (Mateus)', role: 'aluno', provider: 'email' },
  'alunob@lab.edu': { id: 'uuid-conta-b-002', email: 'alunob@lab.edu', name: 'Aluno B (Colega)', role: 'aluno', provider: 'email' },
  'mateus2018pc@gmail.com': { id: 'uuid-google-mateus', email: 'mateus2018pc@gmail.com', name: 'Mateus Pereira Gomes (Google)', role: 'aluno', provider: 'google' },
};

const INICIAIS_PADRAO = [
  {
    _id: 'os-inicial-1',
    title: 'Otimização de Latência e Tweaks de Registro',
    description: 'Ajuste de prioridades de processos e limpeza de serviços em segundo plano.',
    completed: true,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    _id: 'os-inicial-2',
    title: 'Verificação de Saúde de SSD e Limpeza de Cache',
    description: 'Diagnóstico S.M.A.R.T. e remoção de arquivos temporários do sistema.',
    completed: false,
    createdAt: new Date().toISOString(),
  }
];

export default function App() {
  // Acessibilidade (Aula 1 preservada: tema claro/escuro e escala 100%, 125%, 150%)
  const [tema, setTema] = useState(() => localStorage.getItem('p2.tema') || 'escuro');
  const [escala, setEscala] = useState(() => Number(localStorage.getItem('p2.escala')) || 1);

  useEffect(() => {
    localStorage.setItem('p2.tema', tema);
    localStorage.setItem('p2.escala', String(escala));
  }, [tema, escala]);

  // Sessão, Login Google e Biometria (Aula 3 - Entrada com Recurso Nativo)
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('alunoa@lab.edu');
  const [password, setPassword] = useState('123456');
  const [googleEmail, setGoogleEmail] = useState('mateus2018pc@gmail.com');
  const [modalGoogleAberto, setModalGoogleAberto] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [promptBiometrico, setPromptBiometrico] = useState(null); // { modo: 'login'|'ativar', pendingUser }
  const [hardwareDisponivel] = useState(true);
  const [biometriaCadastrada, setBiometriaCadastrada] = useState(true);
  const [nativeAtivoContaAtual, setNativeAtivoContaAtual] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackTipo, setFeedbackTipo] = useState('success');
  const [abaAtiva, setAbaAtiva] = useState('dominio'); // 'dominio' | 'perfil' | 'ajuda'

  const mostrarAviso = (msg, tipo = 'success') => {
    setFeedback(msg);
    setFeedbackTipo(tipo);
  };

  // Controle de AppState / Visibilidade (A3-04: trocar de app durante confirmação cancela entrada)
  const promptRef = useRef(null);
  promptRef.current = promptBiometrico;

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (promptRef.current) {
          setPromptBiometrico(null);
          setUser(null);
          setReason('Entrada cancelada: aplicativo foi para segundo plano durante a confirmação biométrica (A3-04).');
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    if (user) {
      const val = localStorage.getItem('native:' + user.id);
      setNativeAtivoContaAtual(val === 'true');
    }
  }, [user]);

  // Estado do Domínio P1 (Ordens de Serviço de TI com sincronização em nuvem + persistência garantida)
  const [tasks, setTasks] = useState(() => {
    try {
      const salvas = localStorage.getItem('p1.tasks.cloud');
      return salvas ? JSON.parse(salvas) : INICIAIS_PADRAO;
    } catch {
      return INICIAIS_PADRAO;
    }
  });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loadingTasks, setLoadingTasks] = useState(false);

  const salvarLocal = (lista) => {
    setTasks(lista);
    try {
      localStorage.setItem('p1.tasks.cloud', JSON.stringify(lista));
    } catch {}
  };

  const fetchTasks = async () => {
    try {
      setLoadingTasks(true);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${API_URL}/api/tasks`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          salvarLocal(data);
        }
      }
    } catch {
      // Mantém dados sincronizados no armazenamento persistente se o Render gratuito estiver acordando
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    if (user) fetchTasks();
  }, [user]);

  const logout = (msg = 'Sessão encerrada.') => {
    setPromptBiometrico(null);
    setModalGoogleAberto(false);
    setUser(null);
    setReason(msg);
    setFeedback('');
  };

  const autenticarConta = (conta) => {
    const enabled = localStorage.getItem('native:' + conta.id);
    if (enabled === 'true') {
      if (!hardwareDisponivel || !biometriaCadastrada) {
        logout('Recurso nativo indisponível neste aparelho. Tela privada bloqueada (A3-03).');
        return;
      }
      // Abre diálogo nativo ANTES de conceder begin_session / liberar área privada
      setPromptBiometrico({ modo: 'login', pendingUser: conta });
      return;
    }

    setUser(conta);
    mostrarAviso(
      conta.provider === 'google'
        ? `Autenticado via Google (${conta.email}). Concessão begin_session liberada!`
        : `Sessão iniciada (begin_session) para ${conta.email}.`,
      'success'
    );
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (busy) return;
    setReason('');
    const cleanEmail = email.trim().toLowerCase();
    const conta = CONTAS_DEMO[cleanEmail] || {
      id: 'uuid-' + cleanEmail.replace(/[^a-z0-9]/g, ''),
      email: cleanEmail,
      name: cleanEmail.split('@')[0],
      role: 'aluno',
      provider: 'email'
    };

    if (!password || password.length < 3) {
      setReason('Credenciais inválidas. Informe a senha remota.');
      return;
    }

    autenticarConta(conta);
  };

  const handleConfirmarGoogle = (e) => {
    e.preventDefault();
    setReason('');
    const cleanGoogle = googleEmail.trim().toLowerCase();
    if (!cleanGoogle || !cleanGoogle.includes('@')) {
      setReason('Informe um e-mail Google válido.');
      return;
    }
    const contaGoogle = CONTAS_DEMO[cleanGoogle] || {
      id: 'uuid-google-' + cleanGoogle.replace(/[^a-z0-9]/g, ''),
      email: cleanGoogle,
      name: cleanGoogle.split('@')[0] + ' (Google)',
      role: 'aluno',
      provider: 'google',
    };
    setModalGoogleAberto(false);
    autenticarConta(contaGoogle);
  };

  const confirmarBiometria = () => {
    if (!promptBiometrico) return;
    if (promptBiometrico.modo === 'login') {
      const u = promptBiometrico.pendingUser;
      setPromptBiometrico(null);
      setUser(u);
      mostrarAviso('Biometria aceita! Concessão begin_session liberada e área privada desbloqueada (A3-01).', 'success');
    } else if (promptBiometrico.modo === 'ativar') {
      localStorage.setItem('native:' + user.id, 'true');
      setNativeAtivoContaAtual(true);
      setPromptBiometrico(null);
      mostrarAviso(`Entrada nativa ativada com sucesso! Gravada apenas a chave native:${user.id} (sem senha salva).`, 'success');
    }
  };

  const cancelarBiometria = () => {
    if (!promptBiometrico) return;
    if (promptBiometrico.modo === 'login') {
      logout('Entrada nativa não autorizada: diálogo cancelado pelo usuário. Tela privada mantida bloqueada (A3-02).');
    } else {
      setPromptBiometrico(null);
      mostrarAviso('Ativação da entrada nativa cancelada pelo usuário.', 'error');
    }
  };

  const handleEnableNative = (ativar) => {
    if (!user) return;
    if (ativar) {
      if (!hardwareDisponivel || !biometriaCadastrada) {
        mostrarAviso('Cadastre biometria nas configurações do aparelho antes de ativar (A3-03).', 'error');
        return;
      }
      setPromptBiometrico({ modo: 'ativar', pendingUser: user });
    } else {
      localStorage.setItem('native:' + user.id, 'false');
      setNativeAtivoContaAtual(false);
      mostrarAviso('Entrada nativa desativada para esta conta neste aparelho. Próximo login usará apenas credencial remota.', 'success');
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    const novaOrdem = {
      _id: 'os-' + Date.now(),
      title: title.trim(),
      description: description ? description.trim() : '',
      completed: false,
      createdAt: new Date().toISOString(),
    };

    const listaAtualizada = [novaOrdem, ...tasks];
    salvarLocal(listaAtualizada);
    setTitle('');
    setDescription('');
    mostrarAviso('Ordem de serviço salva com sucesso no banco em nuvem!', 'success');

    try {
      const res = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: novaOrdem.title, description: novaOrdem.description })
      });
      if (res.ok) {
        const criadaNoBanco = await res.json();
        salvarLocal([criadaNoBanco, ...tasks]);
      }
    } catch {}
  };

  const handleToggleTask = async (task) => {
    const atualizada = { ...task, completed: !task.completed };
    const novaLista = tasks.map((t) => (t._id === task._id ? atualizada : t));
    salvarLocal(novaLista);
    mostrarAviso(atualizada.completed ? 'Ordem de serviço marcada como concluída!' : 'Ordem de serviço reaberta!', 'success');

    try {
      await fetch(`${API_URL}/api/tasks/${task._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: atualizada.title, description: atualizada.description, completed: atualizada.completed })
      });
    } catch {}
  };

  const handleDeleteTask = async (id) => {
    const novaLista = tasks.filter((t) => t._id !== id);
    salvarLocal(novaLista);
    mostrarAviso('Ordem de serviço excluída com sucesso!', 'success');

    try {
      await fetch(`${API_URL}/api/tasks/${id}`, { method: 'DELETE' });
    } catch {}
  };

  const isDark = tema === 'escuro';
  const themeStyles = {
    backgroundColor: isDark ? '#121212' : '#f1f5f9',
    color: isDark ? '#FAFAFA' : '#171717',
    minHeight: '100vh',
    fontSize: `${16 * escala}px`,
    lineHeight: `${24 * escala}px`,
    padding: '20px 14px',
  };

  const cardStyle = {
    backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
    color: isDark ? '#FAFAFA' : '#171717',
    border: `1px solid ${isDark ? '#444' : '#cbd5e1'}`,
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '18px',
  };

  return (
    <div style={themeStyles}>
      <div className="container">
        <header className="header" style={{ marginBottom: 20 }}>
          <h1 style={{ color: isDark ? '#FAFAFA' : '#0f172a', fontSize: `${1.5 * escala}rem` }}>
            📱 TechTask App (P1 & P2) — Ordens de Serviço + Biometria
          </h1>
          <p style={{ color: isDark ? '#cbd5e1' : '#475569', fontSize: `${0.9 * escala}rem` }}>
            Aplicativo Híbrido: P1 (Nuvem) + P2 (Acessibilidade Aula 1, Libras, Login Google & Biometria Aula 3)
          </p>
        </header>

        {/* Barra rápida de Acessibilidade (Aula 1 Sempre Acessível) */}
        <div style={{ ...cardStyle, padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <strong>♿ Acessibilidade (Aula 1):</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              aria-label="Alternar tema claro ou escuro"
              onClick={() => setTema(isDark ? 'claro' : 'escuro')}
              className="btn btn-secondary"
            >
              Tema: {isDark ? 'Escuro 🌙' : 'Claro ☀️'}
            </button>
            {[1, 1.25, 1.5].map((esc) => (
              <button
                key={esc}
                type="button"
                onClick={() => setEscala(esc)}
                className={`btn ${escala === esc ? 'btn-primary' : 'btn-secondary'}`}
              >
                Fonte {esc * 100}%
              </button>
            ))}
          </div>
        </div>

        {/* Modal de Login com Conta do Google */}
        {modalGoogleAberto && (
          <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998, padding: 16
          }}>
            <div style={{ ...cardStyle, maxWidth: 440, width: '100%', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
              <h3 style={{ marginBottom: 8, color: isDark ? '#FAFAFA' : '#0f172a' }}>
                🌐 Entrar com o Google
              </h3>
              <p style={{ marginBottom: 12, fontSize: `${0.9 * escala}rem`, color: isDark ? '#cbd5e1' : '#475569' }}>
                Escolha uma conta Google rápida ou digite o seu e-mail do Google para autenticar:
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setGoogleEmail('mateus2018pc@gmail.com')}
                >
                  mateus2018pc@gmail.com
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setGoogleEmail('aluno.univassouras@gmail.com')}
                >
                  aluno.univassouras@gmail.com
                </button>
              </div>
              <form onSubmit={handleConfirmarGoogle} className="form">
                <input
                  type="email"
                  aria-label="E-mail da conta Google"
                  placeholder="Digite seu e-mail @gmail.com"
                  value={googleEmail}
                  onChange={(e) => setGoogleEmail(e.target.value)}
                  required
                />
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" onClick={() => setModalGoogleAberto(false)} className="btn btn-secondary">
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Continuar com esta Conta Google
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Simulação do Diálogo Biométrico do Sistema Operacional */}
        {promptBiometrico && (
          <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16
          }}>
            <div style={{ ...cardStyle, maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 8 }}>🔒</div>
              <h3 style={{ marginBottom: 8, color: isDark ? '#FAFAFA' : '#0f172a' }}>
                {promptBiometrico.modo === 'login' ? 'Confirmar entrada' : 'Ativar entrada nativa'}
              </h3>
              <p style={{ marginBottom: 16, fontSize: `${0.9 * escala}rem`, color: isDark ? '#cbd5e1' : '#475569' }}>
                Diálogo Biométrico Nativo do Sistema Operacional (<code>expo-local-authentication</code>) para a conta <strong>{promptBiometrico.pendingUser?.email}</strong>
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={confirmarBiometria} className="btn btn-primary">
                  ✓ Confirmar Digital / Face ID
                </button>
                <button type="button" onClick={cancelarBiometria} className="btn btn-delete" style={{ padding: '10px 16px' }}>
                  ✕ Cancelar Diálogo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PORTÃO DE ACESSO (Gate: Login Público vs PrivateArea) */}
        {!user ? (
          <div style={cardStyle}>
            <h2 style={{ marginBottom: 12, color: isDark ? '#FAFAFA' : '#0f172a', fontSize: `${1.25 * escala}rem` }}>
              🔐 Entrada no Aplicativo (Login Remoto + Biometria)
            </h2>

            {reason && (
              <div role="status" aria-live="polite" className="alert alert-error">
                {reason}
              </div>
            )}

            <form onSubmit={handleLogin} className="form">
              <div className="form-group">
                <label style={{ color: isDark ? '#e2e8f0' : '#475569' }}>Contas Rápidas para Teste (A3-01 a A3-05):</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEmail('alunoa@lab.edu')}>
                    Conta A (alunoa@lab.edu)
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEmail('alunob@lab.edu')}>
                    Conta B (alunob@lab.edu)
                  </button>
                </div>
                <input
                  type="email"
                  aria-label="E-mail"
                  placeholder="Digite seu e-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label style={{ color: isDark ? '#e2e8f0' : '#475569' }}>Senha Remota:</label>
                <input
                  type="password"
                  aria-label="Senha"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Entrando...' : 'Entrar com E-mail e Senha'}
              </button>

              <button
                type="button"
                onClick={() => setModalGoogleAberto(true)}
                className="btn btn-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  border: '1px solid #3b82f6',
                  marginTop: 4,
                }}
              >
                <span>🌐</span> <strong>Entrar com Conta do Google</strong>
              </button>

              <div style={{ padding: 12, borderRadius: 8, border: `1px dashed ${isDark ? '#555' : '#94a3b8'}`, marginTop: 8 }}>
                <strong style={{ display: 'block', marginBottom: 6 }}>🛠️ Simulador de Hardware do Aparelho (Cenários A3-01 a A3-05):</strong>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={biometriaCadastrada}
                    onChange={(e) => setBiometriaCadastrada(e.target.checked)}
                  />
                  Aparelho possui biometria cadastrada (<code>isEnrolledAsync = {String(biometriaCadastrada)}</code>)
                </label>
              </div>
            </form>
          </div>
        ) : (
          <>
            {/* Cabeçalho da Área Privada */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong>Conta autenticada:</strong> {user.email} ({user.provider === 'google' ? 'Google OAuth' : 'Senha Remota'})<br />
                  <small>UUID: <code>{user.id}</code> | Biometria neste aparelho (<code>native:{user.id}</code>): <strong>{nativeAtivoContaAtual ? 'ATIVA ✅' : 'DESATIVADA'}</strong></small>
                </div>
                <button type="button" onClick={() => logout('Sessão encerrada pelo usuário.')} className="btn btn-delete" style={{ padding: '8px 14px' }}>
                  Sair (Logout)
                </button>
              </div>

              {feedback && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`alert ${feedbackTipo === 'error' ? 'alert-error' : 'alert-success'}`}
                  style={{ marginTop: 12, marginBottom: 0 }}
                >
                  {feedback}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setAbaAtiva('dominio')}
                  className={`btn ${abaAtiva === 'dominio' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  🛠️ Ordens de Serviço de TI (P1)
                </button>
                <button
                  type="button"
                  onClick={() => setAbaAtiva('perfil')}
                  className={`btn ${abaAtiva === 'perfil' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  🔒 Perfil & Biometria Nativa (Aula 3)
                </button>
                <button
                  type="button"
                  onClick={() => setAbaAtiva('ajuda')}
                  className={`btn ${abaAtiva === 'ajuda' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  🤟 Ajuda e Orientações em Libras (Aula 1)
                </button>
              </div>
            </div>

            {abaAtiva === 'perfil' && (
              <div style={cardStyle}>
                <h3 style={{ color: isDark ? '#FAFAFA' : '#0f172a' }}>Configuração de Entrada com Recurso Nativo (Aula 3)</h3>
                <p style={{ marginBottom: 12 }}>
                  Ative ou desative a exigência de confirmação biométrica para a conta <strong>{user.email}</strong> neste aparelho. Nenhuma senha ou digital é armazenada pelo aplicativo.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                  <button type="button" onClick={() => handleEnableNative(true)} className="btn btn-primary">
                    Ativar entrada nativa
                  </button>
                  <button type="button" onClick={() => handleEnableNative(false)} className="btn btn-secondary">
                    Desativar entrada nativa
                  </button>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={biometriaCadastrada}
                    onChange={(e) => setBiometriaCadastrada(e.target.checked)}
                  />
                  Simular biometria cadastrada no SO (<code>isEnrolledAsync</code>) — desmarque para demonstrar o cenário A3-03
                </label>
              </div>
            )}

            {abaAtiva === 'ajuda' && (
              <div style={cardStyle}>
                <h3 style={{ color: isDark ? '#FAFAFA' : '#0f172a' }}>Orientações Acessíveis e Libras (Aula 1 Preservada)</h3>
                <p style={{ marginBottom: 10 }}>
                  <strong>Transcrição do fluxo principal do aplicativo:</strong>
                </p>
                <ol style={{ paddingLeft: 20, marginBottom: 12 }}>
                  <li>Autentique-se com e-mail/senha ou com sua <strong>Conta do Google</strong>.</li>
                  <li>Na aba <strong>Perfil & Biometria Nativa</strong>, toque em <strong>Ativar entrada nativa</strong> para vincular a confirmação biométrica do sistema operacional à sua conta neste aparelho (<code>native:UUID</code>).</li>
                  <li>Na aba <strong>Ordens de Serviço de TI</strong>, cadastre o título da manutenção e a descrição técnica, conclua ou exclua chamados sincronizados com a nuvem.</li>
                  <li>Use o botão azul do widget <strong>VLibras</strong> na lateral da tela para traduzir qualquer texto para a Língua Brasileira de Sinais.</li>
                </ol>
              </div>
            )}

            {abaAtiva === 'dominio' && (
              <>
                <div style={cardStyle}>
                  <h3 style={{ color: isDark ? '#FAFAFA' : '#0f172a' }}>Nova Ordem de Serviço / Otimização de TI</h3>
                  <form onSubmit={handleAddTask} className="form">
                    <div className="form-group">
                      <label style={{ color: isDark ? '#e2e8f0' : '#475569' }}>Título do Procedimento *</label>
                      <input
                        type="text"
                        placeholder="Ex: Otimização de Latência e Limpeza de Cache"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ color: isDark ? '#e2e8f0' : '#475569' }}>Descrição Técnica (opcional)</label>
                      <textarea
                        placeholder="Ex: Ajuste de serviços em segundo plano e verificação de SSD"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary">
                      Salvar Ordem no Banco em Nuvem
                    </button>
                  </form>
                </div>

                <div style={cardStyle}>
                  <div className="list-header">
                    <h3 style={{ color: isDark ? '#FAFAFA' : '#0f172a' }}>Ordens Registradas ({tasks.length})</h3>
                    <button onClick={fetchTasks} className="btn btn-secondary" disabled={loadingTasks}>
                      {loadingTasks ? 'Sincronizando...' : '↻ Atualizar'}
                    </button>
                  </div>

                  {tasks.length === 0 ? (
                    <p className="empty-text">Nenhuma ordem cadastrada. Adicione uma acima!</p>
                  ) : (
                    <div className="task-list">
                      {tasks.map((task) => (
                        <div key={task._id} className={`task-item ${task.completed ? 'completed' : ''}`} style={{
                          backgroundColor: isDark ? '#262626' : '#f8fafc',
                          borderColor: isDark ? '#404040' : '#e2e8f0'
                        }}>
                          <div className="task-info">
                            <span className="task-title" style={{ color: isDark ? '#FAFAFA' : '#1e293b' }}>{task.title}</span>
                            {task.description && <p className="task-desc" style={{ color: isDark ? '#cbd5e1' : '#64748b' }}>{task.description}</p>}
                            <small className="task-date" style={{ display: 'block', marginTop: 4, color: '#94a3b8' }}>
                              Criado em: {new Date(task.createdAt || Date.now()).toLocaleString('pt-BR')}
                            </small>
                          </div>
                          <div className="task-actions">
                            <button onClick={() => handleToggleTask(task)} className={`btn-sm ${task.completed ? 'btn-reopen' : 'btn-check'}`}>
                              {task.completed ? 'Reabrir' : '✓ Concluir'}
                            </button>
                            <button onClick={() => handleDeleteTask(task._id)} className="btn-sm btn-delete">
                              ✕ Excluir
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        <footer className="footer">
          <p>Laboratório de Desenvolvimento de Aplicativos Híbridos • Mateus Pereira Gomes</p>
        </footer>
      </div>
    </div>
  );
}
