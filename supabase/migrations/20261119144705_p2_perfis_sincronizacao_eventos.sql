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
