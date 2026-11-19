const express = require('express');
const cors = require('cors');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const serialize = row => ({
  _id: row.id, ownerId: row.user_id, ownerName: row.owner_name,
  title: row.title, description: row.description, completed: row.completed,
  version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
});
function validate(body, action) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Dados inválidos.';
  const allowed = action === 'create' ? ['id','operation_id','title','description']
    : action === 'update' ? ['operation_id','expected_version','title','description','completed']
      : ['operation_id','expected_version'];
  if (Object.keys(body).some(key => !allowed.includes(key))) return 'Campos não permitidos.';
  if (!UUID.test(body.operation_id || '') || (action === 'create' && !UUID.test(body.id || ''))) return 'Identificador da operação inválido.';
  if (action !== 'create' && (!Number.isSafeInteger(body.expected_version) || body.expected_version < 1)) return 'Versão inválida.';
  if ((action === 'create' || 'title' in body) && (typeof body.title !== 'string' || !body.title.trim() || [...body.title.trim()].length > 150)) return 'O título deve ter entre 1 e 150 caracteres.';
  if ('description' in body && (typeof body.description !== 'string' || [...body.description].length > 5000)) return 'A descrição deve ter até 5000 caracteres.';
  if ('completed' in body && typeof body.completed !== 'boolean') return 'Estado inválido.';
  if (action === 'update' && !['title','description','completed'].some(key => key in body)) return 'Informe uma alteração.';
  return null;
}
function failure(res, error) {
  if (error?.code === '42501') return res.status(403).json({ code:'FORBIDDEN', error:'Operação não autorizada.' });
  if (['23514','23502','22P02','22001'].includes(error?.code)) return res.status(400).json({ code:'INVALID_INPUT', error:'Dados inválidos.' });
  return res.status(503).json({ code:'SERVICE_UNAVAILABLE', error:'Não foi possível acessar o banco. Sua alteração pode ser reenviada.' });
}
function createApp({ authorize, configured = true, origins = ['http://localhost:5173'] }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req,res,next) => { res.set('Cache-Control','no-store'); res.set('X-Content-Type-Options','nosniff'); next(); });
  app.use(cors({ origin(origin,done) {
    if (!origin || origins.includes(origin)) return done(null,true);
    done(Object.assign(new Error('Origem não autorizada.'),{status:403}));
  }, methods:['GET','POST','PUT','DELETE'], allowedHeaders:['Content-Type','Authorization'] }));
  app.use(express.json({limit:'32kb'}));
  const health = (req,res) => res.status(configured ? 200 : 503).json({
    status:configured ? 'Configurado' : 'Configuração pendente', version:'P2',
    database:'Supabase PostgreSQL; disponibilidade validada em cada operação autenticada',
  });
  app.get('/',health); app.get('/health',health); app.get('/api/health',health);
  app.use('/api',authorize);
  app.param('id',(req,res,next,id) => UUID.test(id) ? next() : res.status(400).json({error:'Identificador inválido.'}));
  app.get('/api/workspace',async(req,res,next) => {
    try {
      const {data,error} = await req.supabase.rpc('workspace');
      if (error) return failure(res,error);
      if (!data?.profile) return res.status(401).json({code:'SESSION_EXPIRED',error:'Entre novamente.'});
      res.json({...data,tasks:data.tasks.map(serialize)});
    } catch(error) { next(error); }
  });
  app.get('/api/tasks',async(req,res,next) => {
    try {
      const {data,error} = await req.supabase.from('tasks').select('*').order('created_at',{ascending:false});
      if (error) return failure(res,error);
      res.json(data.map(serialize));
    } catch(error) { next(error); }
  });
  const mutation = action => async(req,res,next) => {
    const invalid = validate(req.body,action);
    if (invalid) return res.status(400).json({code:'INVALID_INPUT',error:invalid});
    const payload = {};
    for (const key of ['title','description','completed']) if (key in req.body) payload[key] = req.body[key];
    try {
      const {data,error} = await req.supabase.rpc('mutate_task',{
        p_operation:req.body.operation_id, p_action:action, p_id:action === 'create' ? req.body.id : req.params.id,
        p_version:action === 'create' ? null : req.body.expected_version, p_payload:payload,
      });
      if (error) return failure(res,error);
      if (!data || !Number.isInteger(data.status)) return failure(res,{});
      if (data.error) return res.status(data.status).json({...data,current:data.current ? serialize(data.current) : undefined});
      res.status(data.status).json({task:serialize(data.task),deleted:data.deleted,replayed:data.replayed});
    } catch(error) { next(error); }
  };
  app.post('/api/tasks',mutation('create'));
  app.put('/api/tasks/:id',mutation('update'));
  app.delete('/api/tasks/:id',mutation('delete'));
  app.use((req,res) => res.status(404).json({error:'Rota não encontrada.'}));
  app.use((error,req,res,next) => {
    const status = [400,413,403].includes(error.status) ? error.status : 503;
    res.status(status).json({error:status===400 ? 'JSON inválido.' : status===413 ? 'Dados excedem o limite.' : status===403 ? 'Origem não autorizada.' : 'Serviço indisponível. Tente sincronizar novamente.'});
  });
  return app;
}
module.exports = {createApp,serialize};
