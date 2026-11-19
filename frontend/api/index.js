import backend from '../../backend/app.js';
import authorization from '../../backend/authorization.js';

// A mesma API do Render, exportada sem abrir uma porta no ambiente serverless.
const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',').map(value => value.trim());
export default backend.createApp({
  authorize: authorization.createAuthorization({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
  }),
  configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
  origins,
});
