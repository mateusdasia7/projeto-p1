import React, { useEffect, useState } from 'react';
import { SessionProvider, useSession } from './SessionProvider';
import { configurationError, supabase } from './supabase';
import PasskeySettings from './PasskeySettings';
import { supportsPasskeys } from './web-auth.mjs';
import { useWorkspace } from './useWorkspace';
import { WorkspaceView, NotificationsView } from './WorkspaceView';
import InstallStatus from './InstallStatus';

const API_URL = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '')).replace(/\/+$/, '');
function preference(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

export default function App() {
  const [theme, setTheme] = useState(() => preference('p2.tema', 'escuro'));
  const [scale, setScale] = useState(() => {
    const value = Number(preference('p2.escala', '1'));
    return [1, 1.25, 1.5].includes(value) ? value : 1;
  });
  useEffect(() => {
    try { localStorage.setItem('p2.tema', theme); localStorage.setItem('p2.escala', String(scale)); } catch {}
  }, [theme, scale]);
  return <SessionProvider>
    <div className="app" data-theme={theme} style={{ '--font-scale': scale }}>
      <a className="skip-link" href="#main">Pular para o conteúdo</a>
      <div className="shell">
        <header className="brand">
          <span className="brand-icon" aria-hidden="true">T</span>
          <div><h1>TechTask</h1><p>Seu suporte, organizado.</p></div>
        </header>
        <section className="accessibility" aria-label="Preferências de acessibilidade">
          <button className="secondary" onClick={() => setTheme(theme === 'escuro' ? 'claro' : 'escuro')}>
            Tema {theme === 'escuro' ? 'escuro' : 'claro'}
          </button>
          <div className="font-options" role="group" aria-label="Tamanho da fonte">
            {[1, 1.25, 1.5].map(value => <button key={value} aria-pressed={scale === value}
              onClick={() => setScale(value)}>{value * 100}%</button>)}
          </div>
        </section>
        <InstallStatus /><main id="main" tabIndex={-1}><Gate /></main>
        <footer>TechTask · Ordens de serviço de TI</footer>
      </div>
    </div>
  </SessionProvider>;
}

function Gate() {
  const { user } = useSession();
  if (configurationError) return <section className="card"><h2>Configuração pendente</h2>
    <p>O responsável pelo projeto precisa configurar a conexão antes de liberar o acesso.</p></section>;
  return user ? <PrivateArea key={user.id} /> : <Login />;
}

function Login() {
  const { login, loginWithPasskey, busy, reason } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  async function submit(event) {
    event.preventDefault();
    await login(email, password);
    setPassword('');
  }
  return <section className="card login">
    <span className="eyebrow">BEM-VINDO AO TECHTASK</span>
    <h2>Entre para acompanhar seus chamados.</h2>
    <p className="muted">Acesse suas ordens de serviço e converse com sua equipe.</p>
    {reason && <p role="status" className="notice">{reason}</p>}
    <form onSubmit={submit}>
      <label htmlFor="email">E-mail</label>
      <input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)}
        autoComplete="username" autoCapitalize="none" required disabled={busy} />
      <label htmlFor="password">Senha</label>
      <input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)}
        autoComplete="current-password" required disabled={busy} />
      <button disabled={busy}>{busy ? 'Entrando…' : 'Entrar na minha conta'}</button>
    </form>
    <div className="signin-options">
      <p className="muted small">Ou escolha outra forma de entrar</p>
      <button className="secondary" disabled={busy || !supportsPasskeys()} onClick={() => void loginWithPasskey()}>Entrar com chave de acesso</button>
      <p className="muted small">Digital, Face ID ou Windows Hello, conforme seu aparelho.
        Primeiro entre com e-mail e cadastre sua chave em Meu perfil.</p>
      {!supportsPasskeys() && <p className="muted small">As chaves de acesso não estão disponíveis neste navegador.</p>}
    </div>
    <p className="muted small">As contas A/B/C fornecidas pelo responsável são destinadas aos testes de laboratório.</p>
    <Help />
  </section>;
}

function Help() {
  return <details className="help"><summary>Ajuda e acessibilidade</summary>
    <p>Entre com e-mail e senha ou uma chave de acesso já cadastrada. Em Ordens de serviço, registre uma manutenção e acompanhe sua conclusão.
      Em Conversas, aparecem apenas as salas das quais você participa.</p>
    <p>As opções de tema e tamanho da fonte ficam disponíveis no topo.
      O botão do VLibras na lateral permite traduzir textos para Libras quando o serviço está disponível.</p>
  </details>;
}

function PrivateArea() {
  const { user, logout } = useSession();
  const { state, engine, notifications, toggleNotifications } = useWorkspace();
  const [tab, setTab] = useState('tasks');
  const [notice, setNotice] = useState('');
  return <>
    <section className="account-bar"><div><strong>{state.profile?.name || 'Sua conta'}</strong>
      <span className="muted">{user.email} · {state.profile?.role === 'tecnico' ? 'Técnico' : 'Solicitante'}</span></div>
      <button className="secondary" onClick={() => void logout()}>Sair</button></section>
    <nav className="tabs" aria-label="Áreas do aplicativo">{[['tasks','Ordens de serviço'],['activity','Atividade'],['chat','Conversas'],['profile','Meu perfil']].map(([id,label]) =>
      <button key={id} className={tab === id ? 'active' : 'secondary'} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {(notice || state.notice) && <p className="notice" role="status">{notice || state.notice}</p>}
    {tab === 'tasks' && <WorkspaceView state={state} engine={engine} user={user} setNotice={setNotice} />}
    {tab === 'activity' && <NotificationsView events={state.events} notifications={notifications} toggleNotifications={toggleNotifications} />}
    {tab === 'profile' && <Profile profile={state.profile} setProfile={() => void engine.current.refresh()} setNotice={setNotice} />}
    {tab === 'chat' && <Conversations rooms={state.rooms} />}
    <Help />
  </>;
}

function Profile({ profile, setProfile, setNotice }) {
  const { user } = useSession();
  const [name, setName] = useState(profile?.name || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(profile?.name || ''); }, [profile?.name]);
  return <><section className="card"><h2>Meu perfil</h2>
    <p className="muted">Papel da conta: {profile?.role || 'Carregando…'}</p>
    <form onSubmit={async event => {
      event.preventDefault();
      if (busy || !name.trim()) return;
      setBusy(true);
      try {
        const { data, error } = await supabase.from('profiles').update({ name: name.trim() })
          .eq('id', user.id).select('id,name,role').single();
        if (error || !data) throw new Error('Nome não atualizado. Verifique se a sessão continua ativa.');
        setProfile(data);
        setNotice('Nome atualizado com sucesso.');
      } catch (error) { setNotice(error.message); }
      finally { setBusy(false); }
    }}>
      <label htmlFor="profile-name">Nome de exibição</label>
      <input id="profile-name" value={name} onChange={event => setName(event.target.value)}
        required maxLength={80} disabled={busy} />
      <button disabled={busy || !profile}>{busy ? 'Salvando…' : 'Salvar nome'}</button>
    </form>
  </section><PasskeySettings /></>;
}

function Conversations({ rooms }) {
  const [roomId, setRoomId] = useState('');
  return <section className="card"><h2>Conversas da equipe</h2>
    {rooms.length === 0 ? <p className="muted">Você ainda não participa de uma sala.</p> : <>
      <label htmlFor="room">Sala</label><select id="room" value={roomId} onChange={event => setRoomId(event.target.value)}>
        <option value="">Selecione uma conversa</option>
        {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
      </select>
      {roomId && <Chat key={roomId} roomId={roomId} />}
    </>}
  </section>;
}

function Chat({ roomId }) {
  const { user } = useSession();
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('Conectando…');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    let alive = true;
    const merge = rows => {
      if (!alive) return;
      setMessages(previous => {
        const map = new Map(previous.map(item => [item.id, item]));
        for (const row of rows) map.set(row.id, row);
        return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
    };
    async function recover() {
      const { data, error } = await supabase.from('messages').select('id,author_id,body,created_at')
        .eq('room_id', roomId).order('created_at', { ascending: false }).limit(100);
      if (!alive) return;
      if (error) setStatus('Não foi possível carregar as mensagens.');
      else merge(data);
    }
    const channel = supabase.channel('web-room-' + roomId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'room_id=eq.' + roomId },
        payload => merge([payload.new]))
      .subscribe(value => {
        if (!alive) return;
        setStatus(value === 'SUBSCRIBED' ? 'Conectado' : 'Reconectando…');
        if (value === 'SUBSCRIBED') void recover();
      });
    void recover();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [roomId]);
  return <div className="chat">
    <p role="status" className="muted">{status}</p>
    <ol className="messages" aria-label="Histórico da conversa" aria-live="polite">
      {messages.map(message => <li key={message.id} className={message.author_id === user.id ? 'mine' : ''}>
        <strong>{message.author_id === user.id ? 'Você' : 'Participante'}</strong><p>{message.body}</p>
        <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('pt-BR')}</time>
      </li>)}
    </ol>
    <form onSubmit={async event => {
      event.preventDefault();
      if (sending || !body.trim()) return;
      setSending(true);
      try {
        const { data, error } = await supabase.from('messages').insert({
          room_id: roomId, author_id: user.id, body: body.trim(),
        }).select('id,author_id,body,created_at').single();
        if (error) throw new Error('Mensagem não enviada. Verifique sua sessão e participação na sala.');
        setMessages(previous => previous.some(item => item.id === data.id) ? previous : [...previous, data]);
        setBody('');
        setStatus('Mensagem enviada e salva na nuvem.');
      } catch (error) { setStatus(error.message); }
      finally { setSending(false); }
    }}>
      <label htmlFor="message">Sua mensagem</label>
      <textarea id="message" value={body} onChange={event => setBody(event.target.value)}
        maxLength={1000} required rows={2} disabled={sending} />
      <button disabled={sending || !body.trim()}>{sending ? 'Enviando…' : 'Enviar mensagem'}</button>
    </form>
  </div>;
}
