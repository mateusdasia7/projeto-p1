-- P2 completa: executar UMA VEZ em um projeto novo. Para o projeto P1 existente, use migrations/.
-- Transação atômica: uma tabela já existente interrompe a instalação sem apagar dados.
begin;

create table public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique (user_id, auth_session_id)
);
alter table public.app_sessions enable row level security;
revoke all on public.app_sessions from public, anon, authenticated;

create function public.has_app_session() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_sessions s
    where s.user_id = auth.uid()
      and s.auth_session_id = auth.jwt()->>'session_id'
      and s.revoked_at is null and s.expires_at > now()
  );
$$;

create function public.begin_session() returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null or nullif(auth.jwt()->>'session_id', '') is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  -- A restrição UNIQUE também bloqueia duas aberturas concorrentes.
  if exists (
    select 1 from public.app_sessions
    where user_id = auth.uid() and auth_session_id = auth.jwt()->>'session_id'
  ) then
    raise exception 'Faça novo login' using errcode = '28000';
  end if;
  insert into public.app_sessions(user_id, auth_session_id, expires_at)
    values (auth.uid(), auth.jwt()->>'session_id', now() + interval '2 minutes')
    returning id into result;
  return result;
end;
$$;

create function public.touch_session(p_id uuid, p_activity timestamptz) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_activity is null or p_activity > now() + interval '10 seconds'
     or p_activity <= now() - interval '2 minutes' then
    return false;
  end if;
  update public.app_sessions
  set expires_at = greatest(expires_at, least(p_activity, now()) + interval '2 minutes')
  where id = p_id and user_id = auth.uid()
    and auth_session_id = auth.jwt()->>'session_id'
    and revoked_at is null and expires_at > now();
  return found;
end;
$$;

create function public.end_session(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.app_sessions set revoked_at = now()
  where id = p_id and user_id = auth.uid()
    and auth_session_id = auth.jwt()->>'session_id';
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Aluno' check (length(trim(name)) between 1 and 80),
  role text not null default 'aluno' check (role in ('aluno', 'professor'))
);
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100)
);
create table public.room_members (
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (room_id, user_id)
);
create index room_members_user_idx on public.room_members(user_id);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index messages_room_created_idx on public.messages(room_id, created_at desc);
create index messages_author_idx on public.messages(author_id);
create table public.push_tokens (
  token text primary key check (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'),
  user_id uuid not null references auth.users(id) on delete cascade
);
create index push_tokens_user_idx on public.push_tokens(user_id);

-- O domínio da P1 também tem dono e RLS; a API usa o JWT do chamador.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 150),
  description text not null default '' check (length(description) <= 5000),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index tasks_owner_created_idx on public.tasks(user_id, created_at desc);

create function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room and user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.push_tokens enable row level security;
alter table public.tasks enable row level security;

revoke all on public.profiles, public.rooms, public.room_members,
  public.messages, public.push_tokens, public.tasks from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.rooms, public.room_members,
  public.messages, public.tasks to authenticated;
grant update(name) on public.profiles to authenticated;
grant insert(room_id, author_id, body) on public.messages to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;
grant insert(title, description) on public.tasks to authenticated;
grant update(title, description, completed) on public.tasks to authenticated;
grant delete on public.tasks to authenticated;

create policy profile_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) and (select public.has_app_session()));
create policy profile_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select public.has_app_session()))
  with check (id = (select auth.uid()) and (select public.has_app_session()));
create policy room_read on public.rooms for select to authenticated
  using ((select public.has_app_session()) and public.is_room_member(id));
create policy member_read on public.room_members for select to authenticated
  using ((select public.has_app_session()) and user_id = (select auth.uid()));
create policy message_read on public.messages for select to authenticated
  using ((select public.has_app_session()) and public.is_room_member(room_id));
create policy message_insert on public.messages for insert to authenticated
  with check ((select public.has_app_session()) and public.is_room_member(room_id) and author_id = (select auth.uid()));
create policy token_own on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid()) and (select public.has_app_session()))
  with check (user_id = (select auth.uid()) and (select public.has_app_session()));
create policy task_own on public.tasks for all to authenticated
  using (user_id = (select auth.uid()) and (select public.has_app_session()))
  with check (user_id = (select auth.uid()) and (select public.has_app_session()));

-- O papel sempre nasce como aluno, sem confiar em user_metadata.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
insert into public.profiles(id) select id from auth.users on conflict (id) do nothing;

revoke execute on function public.has_app_session(), public.is_room_member(uuid),
  public.begin_session(), public.touch_session(uuid, timestamptz), public.end_session(uuid)
  from public, anon;
grant execute on function public.has_app_session(), public.is_room_member(uuid),
  public.begin_session(), public.touch_session(uuid, timestamptz), public.end_session(uuid)
  to authenticated;
-- Só a função de push usa estes SELECTs administrativos, depois da checagem RLS.
grant select on public.room_members, public.push_tokens to service_role;

-- Implementações privilegiadas ficam fora do esquema exposto pela Data API.
create schema app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;
alter function public.has_app_session() set schema app_private;
alter function public.is_room_member(uuid) set schema app_private;
alter function public.begin_session() set schema app_private;
alter function public.touch_session(uuid,timestamptz) set schema app_private;
alter function public.end_session(uuid) set schema app_private;
revoke execute on all functions in schema app_private from public, anon;

-- RPCs públicos mantêm a interface da aula, sem elevar o papel do chamador.
create function public.has_app_session() returns boolean
language sql stable security invoker set search_path = '' as $$
  select app_private.has_app_session();
$$;
create function public.is_room_member(p_room uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select app_private.is_room_member(p_room);
$$;
create function public.begin_session() returns uuid
language sql security invoker set search_path = '' as $$
  select app_private.begin_session();
$$;
create function public.touch_session(p_id uuid, p_activity timestamptz) returns boolean
language sql security invoker set search_path = '' as $$
  select app_private.touch_session(p_id, p_activity);
$$;
create function public.end_session(p_id uuid) returns void
language sql security invoker set search_path = '' as $$
  select app_private.end_session(p_id);
$$;
revoke execute on function public.has_app_session(), public.is_room_member(uuid),
  public.begin_session(), public.touch_session(uuid,timestamptz), public.end_session(uuid)
  from public, anon;
grant execute on function public.has_app_session(), public.is_room_member(uuid),
  public.begin_session(), public.touch_session(uuid,timestamptz), public.end_session(uuid)
  to authenticated;
-- A tabela de concessões é deliberadamente inacessível diretamente.
create policy app_session_no_direct_access on public.app_sessions as restrictive
  for all to authenticated using (false) with check (false);

-- Supabase já cria a publicação. Não adicionar a mesma tabela duas vezes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

-- P2: migração sem apagar ordens, contas ou mensagens da P1.
alter table public.profiles drop constraint profiles_role_check;
update public.profiles set role = case when role = 'professor' then 'tecnico' else 'solicitante' end;
alter table public.profiles alter column role set default 'solicitante';
alter table public.profiles add constraint profiles_role_check check (role in ('solicitante', 'tecnico'));
-- Somente a conta fictícia B recebe o papel técnico. Cadastros normais não podem escolher papel.
update public.profiles set role = 'tecnico'
where id in (select id from auth.users where email = 'alunob@lab.edu');

alter table public.tasks add column version integer not null default 1 check (version > 0);
alter table public.tasks add column updated_at timestamptz not null default now();
alter table public.tasks add column owner_name text not null default 'Solicitante';
update public.tasks t set owner_name = p.name from public.profiles p where p.id = t.user_id;

create function app_private.current_app_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid();
$$;
revoke all on function app_private.current_app_role() from public, anon;
grant execute on function app_private.current_app_role() to authenticated;

-- Escritas passam exclusivamente pela transação autorizada abaixo. Nem REST direto contorna as regras.
revoke insert, update, delete on public.tasks from authenticated;
revoke insert(title, description), update(title, description, completed) on public.tasks from authenticated;
drop policy task_own on public.tasks;
create policy task_read on public.tasks for select to authenticated
using ((select public.has_app_session()) and
  (user_id = (select auth.uid()) or (select app_private.current_app_role()) = 'tecnico'));

-- Recibos privados tornam reenvios seguros, inclusive após perder a resposta HTTP.
create table public.task_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  task_id uuid not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id, operation_id)
);
create index task_operations_task_idx on public.task_operations(task_id);
alter table public.task_operations enable row level security;
revoke all on public.task_operations from public, anon, authenticated;
create policy operation_no_direct_access on public.task_operations as restrictive
  for all to authenticated using (false) with check (false);

create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  actor_name text not null,
  task_id uuid not null,
  kind text not null check (kind in ('create','update','delete')),
  created_at timestamptz not null default now(),
  unique(actor_id, operation_id, user_id)
);
create index task_events_owner_created_idx on public.task_events(user_id, created_at desc);
create index task_events_actor_idx on public.task_events(actor_id);
alter table public.task_events enable row level security;
revoke all on public.task_events from public, anon, authenticated;
grant select on public.task_events to authenticated;
create policy event_read on public.task_events for select to authenticated
  using (user_id = (select auth.uid()) and (select public.has_app_session()));

create function app_private.mutate_task(
  p_operation uuid, p_action text, p_id uuid, p_version integer, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  caller_name text;
  canonical jsonb;
  receipt public.task_operations%rowtype;
  item public.tasks%rowtype;
  answer jsonb;
  has_row boolean;
begin
  if caller is null or not app_private.has_app_session() then
    return jsonb_build_object('status',401,'code','SESSION_EXPIRED','error','Entre novamente. Suas alterações locais continuam guardadas.');
  end if;
  select role, name into caller_role, caller_name from public.profiles where id = caller;
  if caller_role is null then
    return jsonb_build_object('status',403,'code','FORBIDDEN','error','Perfil não autorizado.');
  end if;
  if p_operation is null or p_id is null or p_action not in ('create','update','delete')
     or p_action is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('status',400,'code','INVALID_INPUT','error','Operação inválida.');
  end if;
  if exists(select 1 from jsonb_object_keys(p_payload) as k where k not in ('title','description','completed'))
     or (p_action = 'create' and (not(p_payload ? 'title') or p_payload ? 'completed'))
     or (p_action = 'update' and (p_payload = '{}'::jsonb or p_version is null or p_version < 1))
     or (p_action = 'delete' and (p_payload <> '{}'::jsonb or p_version is null or p_version < 1))
     or (p_payload ? 'title' and (jsonb_typeof(p_payload->'title') <> 'string' or length(trim(p_payload->>'title')) not between 1 and 150))
     or (p_payload ? 'description' and (jsonb_typeof(p_payload->'description') <> 'string' or length(p_payload->>'description') > 5000))
     or (p_payload ? 'completed' and jsonb_typeof(p_payload->'completed') <> 'boolean') then
    return jsonb_build_object('status',400,'code','INVALID_INPUT','error','Campos inválidos. Confira título, descrição e versão.');
  end if;
  if p_payload ? 'completed' and caller_role <> 'tecnico' then
    return jsonb_build_object('status',403,'code','FORBIDDEN','error','Somente o técnico pode concluir ou reabrir ordens.');
  end if;
  canonical := jsonb_build_object('action',p_action,'id',p_id,'version',p_version,'payload',p_payload);
  perform pg_advisory_xact_lock(hashtextextended(caller::text || ':' || p_operation::text, 0));
  select * into receipt from public.task_operations where user_id = caller and operation_id = p_operation;
  if found then
    if receipt.request <> canonical then
      return jsonb_build_object('status',409,'code','OPERATION_ID_REUSED','error','Identificador já utilizado por outra alteração.');
    end if;
    if (receipt.result->'task'->>'user_id')::uuid is distinct from caller and caller_role <> 'tecnico' then
      return jsonb_build_object('status',403,'code','FORBIDDEN','error','Acesso negado.');
    end if;
    return receipt.result || jsonb_build_object('replayed',true);
  end if;

  if p_action = 'create' then
    -- O UUID é reservado para sempre: não recriar após exclusão e reenvio tardio.
    perform pg_advisory_xact_lock(hashtextextended('task:' || p_id::text, 0));
    if exists(select 1 from public.task_operations where task_id = p_id) then
      return jsonb_build_object('status',409,'code','TASK_ID_REUSED','error','Identificador de ordem já utilizado.');
    end if;
    insert into public.tasks(id,user_id,title,description,owner_name)
      values(p_id,caller,trim(p_payload->>'title'),trim(coalesce(p_payload->>'description','')),caller_name)
      on conflict(id) do nothing returning * into item;
    if not found then
      return jsonb_build_object('status',409,'code','TASK_ID_REUSED','error','Identificador de ordem já utilizado.');
    end if;
  else
    select * into item from public.tasks where id = p_id for update;
    has_row := found;
    if not has_row or (item.user_id <> caller and caller_role <> 'tecnico') then
      return jsonb_build_object('status',404,'code','NOT_FOUND','error','Ordem não encontrada ou sem acesso.');
    end if;
    if item.user_id <> caller and (p_action = 'delete' or p_payload ? 'title' or p_payload ? 'description') then
      return jsonb_build_object('status',403,'code','FORBIDDEN','error','Somente o solicitante pode editar o texto ou excluir sua ordem.');
    end if;
    if item.version <> p_version then
      return jsonb_build_object('status',409,'code','VERSION_CONFLICT','error','A ordem mudou na nuvem. Escolha qual versão manter.','current',to_jsonb(item));
    end if;
    if p_action = 'delete' then
      delete from public.tasks where id = p_id;
    else
      update public.tasks set
        title = case when p_payload ? 'title' then trim(p_payload->>'title') else title end,
        description = case when p_payload ? 'description' then trim(p_payload->>'description') else description end,
        completed = case when p_payload ? 'completed' then (p_payload->>'completed')::boolean else completed end,
        version = version + 1, updated_at = clock_timestamp()
      where id = p_id returning * into item;
    end if;
  end if;
  answer := jsonb_build_object('status',case when p_action = 'create' then 201 else 200 end,
    'task',to_jsonb(item),'deleted',p_action = 'delete','replayed',false);
  insert into public.task_operations(user_id,operation_id,task_id,request,result)
    values(caller,p_operation,p_id,canonical,answer);
  insert into public.task_events(operation_id,user_id,actor_id,actor_name,task_id,kind)
    select p_operation,p.id,caller,caller_name,p_id,p_action from public.profiles p
    where p.id = item.user_id or p.role = 'tecnico'
    on conflict(actor_id,operation_id,user_id) do nothing;
  return answer;
end;
$$;
revoke all on function app_private.mutate_task(uuid,text,uuid,integer,jsonb) from public,anon;
grant execute on function app_private.mutate_task(uuid,text,uuid,integer,jsonb) to authenticated;
create function public.mutate_task(p_operation uuid,p_action text,p_id uuid,p_version integer,p_payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.mutate_task(p_operation,p_action,p_id,p_version,p_payload);
$$;
revoke all on function public.mutate_task(uuid,text,uuid,integer,jsonb) from public,anon;
grant execute on function public.mutate_task(uuid,text,uuid,integer,jsonb) to authenticated;

create function public.workspace() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'profile',(select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.tasks t),'[]'::jsonb),
    'rooms',coalesce((select jsonb_agg(to_jsonb(r) order by r.name) from public.rooms r),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from
      (select * from public.task_events order by created_at desc limit 100) e),'[]'::jsonb));
$$;
revoke all on function public.workspace() from public,anon;
grant execute on function public.workspace() to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
       and schemaname='public' and tablename='task_events') then
    alter publication supabase_realtime add table public.task_events;
  end if;
end $$;

commit;
