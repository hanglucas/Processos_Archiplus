-- Extensão para consultas rápidas. Aplicar após schema.sql.
begin;
create table if not exists public.consultation_sessions (
 id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, process_id text not null,
 payload text not null, captcha_hash text not null unique, expires_at timestamptz not null
);
alter table public.consultation_sessions enable row level security;
revoke all on public.consultation_sessions from public,anon,authenticated;
grant select,insert,delete on public.consultation_sessions to service_role;
create index if not exists consultation_sessions_expiry on public.consultation_sessions(expires_at);
create table if not exists public.consultation_limits (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, process_id text not null,
 portal text not null default 'sei' check(portal in ('sei','smu')),
 requested_at timestamptz not null default now(),primary key(workspace_id,user_id,process_id,portal)
);
alter table public.consultation_limits add column if not exists portal text not null default 'sei';
alter table public.consultation_limits drop constraint if exists consultation_limits_pkey;
alter table public.consultation_limits add primary key(workspace_id,user_id,process_id,portal);
alter table public.consultation_limits enable row level security;
drop function if exists public.reserve_consultation(uuid,text);
revoke all on public.consultation_limits from public,anon,authenticated;
create or replace function public.reserve_consultation(w uuid,pid text,portal_name text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if portal_name not in ('sei','smu') or portal_name is null then raise exception 'Portal inválido.';end if;
 if not archiplus_private.has_role(w,array['admin','editor']) or not exists(select 1 from public.processes where workspace_id=w and id=pid) then raise exception 'Consulta não autorizada.';end if;
 insert into public.consultation_limits(workspace_id,user_id,process_id,portal) values(w,auth.uid(),pid,portal_name)
 on conflict(workspace_id,user_id,process_id,portal) do update set requested_at=now()
 where public.consultation_limits.requested_at<now()-interval '5 seconds';
 if not found then raise exception 'Aguarde alguns segundos antes de repetir esta consulta.';end if;
end $$;
revoke all on function public.reserve_consultation(uuid,text,text) from public,anon;
grant execute on function public.reserve_consultation(uuid,text,text) to authenticated;
commit;
