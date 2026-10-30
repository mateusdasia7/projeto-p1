import React, { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://projeto-p1.onrender.com';

const CONTAS_DEMO = {
  'alunoa@lab.edu': { id: 'uuid-conta-a-001', email: 'alunoa@lab.edu', name: 'Aluno A (Mateus)', role: 'aluno' },
  'alunob@lab.edu': { id: 'uuid-conta-b-002', email: 'alunob@lab.edu', name: 'Aluno B (Colega)', role: 'aluno' },
  'alunoc@lab.edu': { id: 'uuid-conta-c-003', email: 'alunoc@lab.edu', name: 'Aluno C (Visitante)', role: 'visitante' },
};

export default function App() {
  // Acessibilidade (Aula 1 preservada: tema claro/escuro e escala 100%, 125%, 150%)
  const [tema, setTema] = useState(() => localStorage.getItem('p2.tema') || 'claro');
  const [escala, setEscala] = useState(() => Number(localStorage.getItem('p2.escala')) || 1);

  useEffect(() => {
    localStorage.setItem('p2.tema', tema);
    localStorage.setItem('p2.escala', String(escala));
  }, [tema, escala]);

  // Sessão e Biometria (Aula 3 - Entrada com Recurso Nativo)
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('alunoa@lab.edu');
  const [password, setPassword] = useState('123456');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [promptBiometrico, setPromptBiometrico] = useState(null); // { modo: 'login'|'ativar', pendingUser }
  const [hardwareDisponivel, setHardwareDisponivel] = useState(true);
  const [biometriaCadastrada, setBiometriaCadastrada] = useState(true);
  const [nativeAtivoContaAtual, setNativeAtivoContaAtual] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [abaAtiva, setAbaAtiva] = useState('dominio'); // 'dominio' | 'perfil' | 'acessibilidade'

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

  // Estado do Domínio P1 (Ordens de Serviço de TI no Render + MongoDB Atlas)
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loadingTasks, setLoadingTasks] = useState(false);

  const fetchTasks = async () => {
    try {
      setLoadingTasks(true);
      const res = await fetch(`${API_URL}/api/tasks`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    if (user) fetchTasks();
  }, [user]);

  const logout = (msg = 'Sessão encerrada.') => {
    setPromptBiometrico(null);
    setUser(null);
    setReason(msg);
    setFeedback('');
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
      role: 'aluno'
    };

    if (!password || password.length < 3) {
      setReason('Credenciais inválidas. Informe a senha remota.');
      return;
    }

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

    // Se a conta não ativou biometria neste aparelho (ex: Conta B em A3-05), entra direto após senha remota
    setUser(conta);
    setFeedback(`Sessão iniciada (begin_session) para ${conta.email} sem biometria exigida neste aparelho.`);
  };

  const confirmarBiometria = () => {
    if (!promptBiometrico) return;
    if (promptBiometrico.modo === 'login') {
      const u = promptBiometrico.pendingUser;
      setPromptBiometrico(null);
      setUser(u);
      setFeedback('Biometria confirmada! Concessão begin_session liberada (A3-01).');
    } else if (promptBiometrico.modo === 'ativar') {
      localStorage.setItem('native:' + user.id, 'true');
      setNativeAtivoContaAtual(true);
      setPromptBiometrico(null);
      setFeedback(`Entrada nativa ativada! Gravada apenas a chave native:${user.id} (sem armazenar senha).`);
    }
  };

  const cancelarBiometria = () => {
    if (!promptBiometrico) return;
    if (promptBiometrico.modo === 'login') {
      logout('Entrada nativa não autorizada: diálogo cancelado pelo usuário. Tela privada mantida bloqueada (A3-02).');
    } else {
      setPromptBiometrico(null);
      setFeedback('Ativação cancelada pelo usuário.');
    }
  };

  const handleEnableNative = (ativar) => {
    if (!user) return;
    if (ativar) {
      if (!hardwareDisponivel || !biometriaCadastrada) {
        setFeedback('Cadastre biometria nas configurações do aparelho antes de ativar (A3-03).');
        return;
      }
      setPromptBiometrico({ modo: 'ativar', pendingUser: user });
    } else {
      localStorage.setItem('native:' + user.id, 'false');
      setNativeAtivoContaAtual(false);
      setFeedback('Entrada nativa desativada para esta conta neste aparelho. Próximo login usará apenas senha remota.');
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description })
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      setTitle('');
      setDescription('');
      setFeedback('Ordem de serviço salva no banco em nuvem (MongoDB Atlas)!');
      fetchTasks();
    } catch {
      setFeedback('Erro ao conectar à API no Render.');
    }
  };

  const handleToggleTask = async (task) => {
    try {
      await fetch(`${API_URL}/api/tasks/${task._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: task.title, description: task.description, completed: !task.completed })
      });
      fetchTasks();
    } catch {
      setFeedback('Erro ao atualizar status.');
    }
  };

  const handleDeleteTask = async (id) => {
    try {
      await fetch(`${API_URL}/api/tasks/${id}`, { method: 'DELETE' });
      fetchTasks();
    } catch {
      setFeedback('Erro ao excluir registro.');
    }
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
            TechTask P1 & P2 — Ordens de Serviço de TI + Entrada Nativa
          </h1>
          <p style={{ color: isDark ? '#cbd5e1' : '#475569', fontSize: `${0.9 * escala}rem` }}>
            Integração P1 (Vercel + Render + MongoDB) & P2 (Acessibilidade Aula 1 + Biometria Aula 3)
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
                Diálogo Nativo do Sistema Operacional (`expo-local-authentication`) para a conta <strong>{promptBiometrico.pendingUser?.email}</strong>
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={confirmarBiometria} className="btn btn-primary">
                  ✓ Reconhecer Digital / Face ID
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
              🔐 Login Remoto + Entrada Nativa (Aula 3 — P2)
            </h2>

            {reason && (
              <div role="status" aria-live="polite" className="alert alert-error">
                {reason}
              </div>
            )}

            <form onSubmit={handleLogin} className="form">
              <div className="form-group">
                <label style={{ color: isDark ? '#e2e8f0' : '#475569' }}>Selecionar Conta de Teste (ou digite o e-mail):</label>
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{ fontSize: `${1 * escala}px` }}
                />
              </div>

              <div className="form-group">
                <label style={{ color: isDark ? '#e2e8f0' : '#475569' }}>Senha Remota:</label>
                <input
                  type="password"
                  aria-label="Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div style={{ padding: 12, borderRadius: 8, border: `1px dashed ${isDark ? '#555' : '#94a3b8'}`, marginTop: 4 }}>
                <strong style={{ display: 'block', marginBottom: 6 }}>🛠️ Simulador de Hardware do Aparelho (Para demonstrar cenários A3-01 a A3-05 em aula):</strong>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={biometriaCadastrada}
                    onChange={(e) => setBiometriaCadastrada(e.target.checked)}
                  />
                  Aparelho possui biometria cadastrada (`isEnrolledAsync = {String(biometriaCadastrada)}`)
                </label>
              </div>

              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Entrando...' : 'Entrar no Sistema'}
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Cabeçalho da Área Privada */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong>Conta autenticada:</strong> {user.email} <br />
                  <small>UUID: <code>{user.id}</code> | Chave no aparelho: <code>native:{user.id} = {String(nativeAtivoContaAtual)}</code></small>
                </div>
                <button type="button" onClick={() => logout('Sessão encerrada pelo usuário.')} className="btn btn-delete" style={{ padding: '8px 14px' }}>
                  Sair (Logout)
                </button>
              </div>

              {feedback && (
                <div role="status" aria-live="polite" className="alert alert-success" style={{ marginTop: 12, marginBottom: 0 }}>
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
                  🔒 Perfil & Entrada Nativa (Aula 3 - P2)
                </button>
              </div>
            </div>

            {abaAtiva === 'perfil' && (
              <div style={cardStyle}>
                <h3 style={{ color: isDark ? '#FAFAFA' : '#0f172a' }}>Configuração de Entrada com Recurso Nativo (Aula 3)</h3>
                <p style={{ marginBottom: 12 }}>
                  Ative ou desative a exigência de confirmação biométrica para a conta <strong>{user.email}</strong> neste aparelho. Nenhuma senha é salva.
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
                  Simular biometria cadastrada no SO (`isEnrolledAsync`) — desmarque para testar o cenário A3-03
                </label>
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
