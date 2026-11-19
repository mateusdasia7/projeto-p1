require('dotenv').config();
const { createApp } = require('./app');
const { createAuthorization } = require('./authorization');

const port = Number(process.env.PORT || 5000);
const authorize = createAuthorization({
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_ANON_KEY,
});
const app = createApp({
  authorize,
  configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
  origins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(value => value.trim()),
});
app.listen(port, () => console.log(`TechTask: API iniciada na porta ${port}`));
