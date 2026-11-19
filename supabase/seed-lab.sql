-- Preparação administrativa de um projeto NOVO de laboratório.
-- Crie antes as contas fictícias abaixo em Authentication > Users.
-- Não usar este SQL Editor para validar RLS: os testes usam clientes autenticados.
begin;
do $$
declare
  a uuid; b uuid; c uuid;
  room uuid := '44444444-4444-4444-8444-444444444444';
begin
  select id into a from auth.users where lower(email) = 'alunoa@lab.edu';
  select id into b from auth.users where lower(email) = 'alunob@lab.edu';
  select id into c from auth.users where lower(email) = 'alunoc@lab.edu';
  if a is null or b is null or c is null then
    raise exception 'Crie e confirme as contas fictícias A, B e C antes do seed.';
  end if;
  update public.profiles set name = 'Solicitante A', role = 'solicitante' where id = a;
  update public.profiles set name = 'Técnico B', role = 'tecnico' where id = b;
  update public.profiles set name = 'Solicitante C', role = 'solicitante' where id = c;
  insert into public.rooms(id,name) values (room, 'Sala de suporte A/B') on conflict (id) do nothing;
  insert into public.room_members(room_id,user_id) values (room,a),(room,b) on conflict do nothing;
end;
$$;
commit;
