-- Executar uma vez no SQL Editor de um projeto Supabase novo.
begin;
create schema if not exists archiplus_private;
revoke all on schema archiplus_private from public;
grant usage on schema archiplus_private to authenticated;
create table public.workspaces (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 80),
 owner_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.memberships (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('admin','editor','viewer')), primary key(workspace_id,user_id)
);
create table public.processes (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null check(length(id) between 1 and 100), data jsonb not null,
 version integer not null default 1, updated_at timestamptz not null default now(),
 primary key(workspace_id,id),
 check(jsonb_typeof(data)='object'),
 check(data->>'source' in ('sei','smu','both')),
 check(data->>'lifecycle' in ('active','approved','archived')),
 check(length(trim(data->>'title')) between 1 and 180),
 check(length(trim(data->>'number')) between 1 and 45),
 check(length(trim(data->>'group')) between 1 and 80)
);
create table public.process_history (
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 process_id text not null, actor uuid references auth.users(id) on delete set null,
 action text not null, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create index on public.memberships(user_id,workspace_id);
create index on public.process_history(workspace_id,process_id,created_at desc);
create function archiplus_private.has_role(w uuid, roles text[]) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m where m.workspace_id=w and m.user_id=(select auth.uid()) and m.role=any(roles));
$$;
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.processes enable row level security;
alter table public.process_history enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using(archiplus_private.has_role(id,array['admin','editor','viewer']));
create policy members_read on public.memberships for select to authenticated using(user_id=(select auth.uid()) or archiplus_private.has_role(workspace_id,array['admin']));
create policy process_read on public.processes for select to authenticated using(archiplus_private.has_role(workspace_id,array['admin','editor','viewer']));
create policy history_read on public.process_history for select to authenticated using(archiplus_private.has_role(workspace_id,array['admin','editor','viewer']));
-- Nenhuma escrita direta: RPCs abaixo validam acesso e versão dentro da transação.
revoke all on public.workspaces,public.memberships,public.processes,public.process_history from anon,authenticated;
grant select on public.workspaces,public.memberships,public.processes,public.process_history to authenticated;

create function public.create_workspace(workspace_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare w uuid;
begin
 if auth.uid() is null then raise exception 'Entre novamente.'; end if;
 insert into public.workspaces(name,owner_id) values(trim(workspace_name),auth.uid()) returning id into w;
 insert into public.memberships values(w,auth.uid(),'admin'); return w;
end $$;

create function public.list_members(w uuid) returns table(user_id uuid,email text,role text,is_owner boolean)
language plpgsql security definer set search_path='' as $$
begin
 if not archiplus_private.has_role(w,array['admin']) then raise exception 'Acesso restrito ao administrador.';end if;
 return query select m.user_id,u.email::text,m.role,ws.owner_id=m.user_id from public.memberships m join auth.users u on u.id=m.user_id join public.workspaces ws on ws.id=w where m.workspace_id=w order by u.email;
end $$;

create function public.set_member(w uuid,member_email text,member_role text) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid; owner uuid;
begin
 -- Bloqueio serializa alterações de acesso com as demais gravações da equipe.
 select owner_id into owner from public.workspaces where id=w for update;
 if not archiplus_private.has_role(w,array['admin']) then raise exception 'Acesso restrito ao administrador.';end if;
 select id into target from auth.users where lower(email)=lower(trim(member_email));
 if target is null then raise exception 'Crie a conta no painel Authentication do Supabase primeiro.';end if;
 if target=owner then raise exception 'O proprietário permanece administrador.';end if;
 if member_role is null then delete from public.memberships where workspace_id=w and user_id=target;
 elsif member_role in ('admin','editor','viewer') then
 insert into public.memberships values(w,target,member_role) on conflict(workspace_id,user_id) do update set role=excluded.role;
 else raise exception 'Perfil inválido.';end if;
end $$;

create function archiplus_private.valid_process(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object'
 and p->>'source' in ('sei','smu','both')
 and p->>'lifecycle' in ('active','approved','archived')
 and length(trim(p->>'title')) between 1 and 180
 and length(trim(p->>'number')) between 1 and 45
 and length(trim(p->>'group')) between 1 and 80
 and length(coalesce(p->>'note',''))<=2000
 and length(coalesce(p->>'reportResponsible',''))<=100
 and (p->>'source'='smu' or (p->>'url' ~ '^https://prefeitura[.]sei[.]rio/sei/modulos/pesquisa/md_?pesq_processo_exibir[.]php[?]' and length(p->>'url')<=8192))
 and pg_column_size(p)<=2000000,false);
$$;

create function public.save_process(w uuid,p jsonb,expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid text; old public.processes; saved public.processes;
begin
 perform 1 from public.workspaces where id=w for update;
 if not archiplus_private.has_role(w,array['admin','editor']) then raise exception 'Você não tem permissão para editar esta equipe.';end if;
 if not archiplus_private.valid_process(p) then raise exception 'Cadastro inválido: confira nome, número, grupo e link oficial.';end if;
 pid=coalesce(nullif(p->>'id',''),gen_random_uuid()::text);
 select * into old from public.processes where workspace_id=w and id=pid for update;
 if old.id is null then
   if expected_version is not null then raise exception 'Cadastro removido. Recarregue a lista.'; end if;
   insert into public.processes(workspace_id,id,data) values(w,pid,p-'version') returning * into saved;
 else
   if expected_version is null or old.version<>expected_version then raise exception 'Outra pessoa alterou este cadastro. Recarregue a lista antes de salvar.';end if;
   update public.processes set data=p-'version',version=version+1,updated_at=now() where workspace_id=w and id=pid returning * into saved;
 end if;
 insert into public.process_history(workspace_id,process_id,actor,action,before_data,after_data)
 values(w,pid,auth.uid(),case when old.id is null then 'Cadastro' else 'Alteração' end,old.data,saved.data);
 return saved.data||jsonb_build_object('id',pid,'version',saved.version,'updatedAt',saved.updated_at);
end $$;

create function public.delete_process(w uuid,pid text,expected_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare old public.processes;
begin
 perform 1 from public.workspaces where id=w for update;
 if not archiplus_private.has_role(w,array['admin','editor']) then raise exception 'Você não tem permissão para excluir.';end if;
 select * into old from public.processes where workspace_id=w and id=pid for update;
 if old.id is null or expected_version is null or old.version<>expected_version then raise exception 'Cadastro alterado ou removido. Recarregue a lista.';end if;
 insert into public.process_history(workspace_id,process_id,actor,action,before_data) values(w,pid,auth.uid(),'Exclusão',old.data);
 delete from public.processes where workspace_id=w and id=pid;
end $$;

create function public.import_processes(w uuid,items jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare item jsonb; n integer=0;
begin
 perform 1 from public.workspaces where id=w for update;
 if not archiplus_private.has_role(w,array['admin']) then raise exception 'Somente o administrador pode importar.';end if;
 if exists(select 1 from public.processes where workspace_id=w) then raise exception 'Importação inicial disponível apenas em equipe vazia.';end if;
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 1000 then raise exception 'Arquivo deve conter de 1 a 1000 processos.';end if;
 for item in select value from jsonb_array_elements(items) loop
   perform public.save_process(w,item, null); n=n+1;
 end loop;
 return n;
end $$;

revoke all on all functions in schema archiplus_private from public,anon;
grant execute on function archiplus_private.has_role(uuid,text[]) to authenticated;
revoke all on function public.create_workspace(text),public.list_members(uuid),public.set_member(uuid,text,text),public.save_process(uuid,jsonb,integer),public.delete_process(uuid,text,integer),public.import_processes(uuid,jsonb) from public,anon;
grant execute on function public.create_workspace(text),public.list_members(uuid),public.set_member(uuid,text,text),public.save_process(uuid,jsonb,integer),public.delete_process(uuid,text,integer),public.import_processes(uuid,jsonb) to authenticated;
commit;
