const headers = {
  'Content-Type': 'application/json', 'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleNotification(req, { userClient, admin, send, now = Date.now }) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ error: 'Método inválido.' }, 405);
  const authorization = req.headers.get('Authorization') || '';
  if (!/^Bearer [^\s]+$/i.test(authorization)) return json({ error: 'Não autenticado.' }, 401);
  try {
    const client = userClient(authorization);
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user) return json({ error: 'Não autenticado.' }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON inválido.' }, 400); }
    if (!body || typeof body.messageId !== 'string' || !uuid.test(body.messageId)) return json({ error: 'Mensagem inválida.' }, 400);

    // Esta consulta usa o JWT do chamador: RLS exige concessão ativa e participação.
    const { data: message, error } = await client.from('messages')
      .select('id,room_id,author_id,created_at').eq('id', body.messageId).maybeSingle();
    if (error || !message || message.author_id !== auth.data.user.id) return json({ error: 'Acesso negado.' }, 403);
    const age = now() - Date.parse(message.created_at);
    if (!Number.isFinite(age) || age < -5000 || age > 60000) return json({ error: 'Evento fora do prazo.' }, 400);

    // Só depois das verificações acima a chave de servidor consulta destinatários.
    const members = await admin.from('room_members').select('user_id')
      .eq('room_id', message.room_id).neq('user_id', auth.data.user.id);
    if (members.error) throw new Error('members');
    const recipients = members.data.map(row => row.user_id);
    if (!recipients.length) return json({ tickets: [], recipients: 0 });
    const tokens = await admin.from('push_tokens').select('token').in('user_id', recipients);
    if (tokens.error) throw new Error('tokens');
    const valid = tokens.data.filter(row => /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(row.token));
    const tickets = [];
    for (let offset = 0; offset < valid.length; offset += 100) {
      const batch = valid.slice(offset, offset + 100).map(row => ({
        to: row.token, title: 'Atualização no aplicativo',
        body: 'Há uma nova interação. Entre para consultar.',
        sound: 'default', channelId: 'eventos', data: { type: 'message' },
      }));
      const response = await send(batch);
      if (!response.ok) throw new Error('provider');
      const result = await response.json();
      if (!Array.isArray(result.data)) throw new Error('provider');
      // Respostas do provedor podem mencionar tokens; devolver apenas campos seguros.
      tickets.push(...result.data.map(ticket => ({
        status: ticket.status, ...(ticket.id ? { id: ticket.id } : {}),
        ...(ticket.details?.error ? { error: ticket.details.error } : {}),
      })));
    }
    return json({ tickets, recipients: valid.length });
  } catch {
    return json({ error: 'Falha no envio da notificação.' }, 500);
  }
}
