// A concessão e o JWT ficam privados a este módulo, somente em memória.
export function createSessionManager(client, { onChange, isForeground = () => true, isOnline = () => true, now = Date.now }) {
  let state = { user: null, busy: false, reason: '' };
  let lease = null;
  let activity = 0;
  let generation = 0;
  let renewing = false;
  let signingOut = null;
  let authenticating = false;
  const publish = (patch) => { state = { ...state, ...patch }; onChange?.(state); };

  async function logout(reason = 'Sessão encerrada.') {
    generation += 1;
    const previous = lease;
    lease = null;
    publish({ user: null, reason }); // Desmonta conteúdo privado antes da rede.
    if (signingOut) return signingOut;
    signingOut = (async () => {
      try {
        if (previous) await client.rpc('end_session', { p_id: previous });
      } catch { /* Offline: a concessão expira em até dois minutos no servidor. */ }
      finally {
        try { await client.auth.signOut({ scope: 'local' }); }
        catch { /* A área privada já foi desmontada. */ }
      }
    })();
    try { await signingOut; }
    finally { signingOut = null; publish({ busy: authenticating }); }
  }

  async function signIn(authenticate, confirm = async () => {}) {
    if (authenticating || signingOut || state.user) return;
    authenticating = true;
    publish({ busy: true, reason: '' });
    const attempt = ++generation;
    try {
      const authenticatedUser = await authenticate();
      if (!authenticatedUser?.id) throw new Error('A autenticação não retornou uma conta válida.');
      if (attempt !== generation) throw new Error('Entrada interrompida. Entre novamente.');
      await confirm(authenticatedUser);
      if (attempt !== generation || !isForeground()) throw new Error('Entrada interrompida. Entre novamente.');
      const { data: id, error } = await client.rpc('begin_session');
      if (error || !id) throw new Error('Não foi possível abrir a sessão. Faça novo login.');
      if (attempt !== generation || !isForeground()) {
        await client.rpc('end_session', { p_id: id });
        throw new Error('Entrada interrompida. Entre novamente.');
      }
      lease = id;
      activity = now();
      publish({ user: authenticatedUser });
    } catch (error) {
      await logout(error.message || 'Falha na autenticação.');
    } finally { authenticating = false; publish({ busy: false }); }
  }

  async function tick() {
    if (!state.user || renewing) return;
    if (!isForeground() || now() - activity >= 120000) {
      await logout('Sessão expirada ou aplicativo fora do primeiro plano.');
      return;
    }
    if (!isOnline()) return;
    renewing = true;
    const attempt = generation;
    try {
      const { data, error } = await client.rpc('touch_session', {
        p_id: lease, p_activity: new Date(activity).toISOString(),
      });
      if (attempt === generation && !error && data !== true) await logout('Sessão inválida no servidor.');
    } catch {
      // Falha de transporte não apaga rascunhos nem simula autorização remota.
      // O servidor continuará exigindo concessão válida em cada leitura/escrita.
    } finally { renewing = false; }
  }

  async function accessToken() {
    if (!state.user || !isForeground() || now() - activity >= 120000) {
      await logout('Faça login para continuar.');
      throw new Error('Sessão encerrada.');
    }
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.access_token) {
      await logout('Faça login para continuar.');
      throw new Error('Sessão encerrada.');
    }
    return data.session.access_token;
  }

  return {
    signIn, logout, tick, accessToken,
    touch() {
      if (!state.user) return;
      if (now() - activity >= 120000) void logout('Sessão expirada por inatividade.');
      else activity = now();
    },
    getState() { return state; },
  };
}
