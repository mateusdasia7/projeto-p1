const { createClient } = require('@supabase/supabase-js');

function createAuthorization({ url, key, clientFactory = createClient }) {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '');
    if (!match) return res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Autenticação obrigatória.' });
    if (!url || !key) return res.status(503).json({ error: 'Serviço de autenticação não configurado.' });
    try {
      // Um cliente por requisição; nunca usar service_role na API de domínio.
      const client = clientFactory(url, key, {
        global: {
          headers: { Authorization: `Bearer ${match[1]}` },
          fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12000) }),
        },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: { user }, error } = await client.auth.getUser(match[1]);
      if (error || !user) return res.status(error?.status >= 500 ? 503 : 401).json({ code: error?.status >= 500 ? 'SERVICE_UNAVAILABLE' : 'AUTH_REQUIRED', error: 'Não foi possível autenticar a conta.' });
      const session = await client.rpc('has_app_session');
      if (session.error) return res.status(503).json({ error: 'Não foi possível validar a sessão.' });
      if (session.data !== true) return res.status(401).json({ code: 'SESSION_EXPIRED', error: 'Sessão da aplicação expirada ou revogada.' });
      req.user = user;
      req.supabase = client; // O mesmo JWT chega ao PostgreSQL e às políticas RLS.
      next();
    } catch {
      res.status(503).json({ error: 'Serviço de autenticação indisponível.' });
    }
  };
}
module.exports = { createAuthorization };
