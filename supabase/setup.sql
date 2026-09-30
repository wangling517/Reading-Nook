-- Reading Nook family pilot. Run once in this project's SQL Editor.
-- Contains no passwords or administrator keys. Does not delete existing data.
begin;

create table if not exists public.reading_nook_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  operation_id uuid,
  state jsonb,
  audios jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.reading_nook_snapshots enable row level security;
revoke all on public.reading_nook_snapshots from anon, authenticated;
grant select on public.reading_nook_snapshots to authenticated;
drop policy if exists reading_nook_owner_read on public.reading_nook_snapshots;
create policy reading_nook_owner_read on public.reading_nook_snapshots
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.reading_nook_save(
  expected_version bigint, operation uuid, new_state jsonb, new_audios jsonb
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := auth.uid();
  current_row public.reading_nook_snapshots%rowtype;
  item jsonb;
  total_bytes bigint := 0;
begin
  if owner is null then raise exception 'LOGIN_REQUIRED' using errcode = '28000'; end if;
  if operation is null or expected_version is null or expected_version < 0 then
    raise exception 'INVALID_VERSION';
  end if;
  if new_state is null or jsonb_typeof(new_state) <> 'object'
    or (new_state->>'version')::int is distinct from 1
    or jsonb_typeof(new_state->'books') is distinct from 'array'
    or jsonb_typeof(new_state->'days') is distinct from 'array'
    or jsonb_typeof(new_state->'shares') is distinct from 'array'
    or octet_length(new_state::text) > 10485760
    or new_audios is null or jsonb_typeof(new_audios) <> 'array' then
    raise exception 'INVALID_SNAPSHOT';
  end if;
  if jsonb_array_length(new_audios) > 5000 then raise exception 'AUDIO_LIMIT'; end if;
  for item in select value from jsonb_array_elements(new_audios) loop
    if item->>'id' is null or item->>'id' !~ '^[a-zA-Z0-9_-]{1,80}$'
      or item->>'sha256' is null or item->>'sha256' !~ '^[a-f0-9]{64}$'
      or item->>'path' is distinct from owner::text || '/' || (item->>'sha256')
      or (item->>'bytes')::bigint is null or (item->>'bytes')::bigint not between 1 and 31457280
      or (item->>'duration')::numeric is null or (item->>'duration')::numeric not between 0.001 and 181
      or item->>'type' is null or item->>'type' !~ '^audio/' then
      raise exception 'INVALID_AUDIO';
    end if;
    if not exists (select 1 from storage.objects
      where bucket_id = 'reading-nook-audio' and name = item->>'path') then
      raise exception 'AUDIO_NOT_UPLOADED';
    end if;
    total_bytes := total_bytes + (item->>'bytes')::bigint;
  end loop;
  if total_bytes > 104857600 then raise exception 'AUDIO_LIMIT'; end if;
  if exists (select 1 from jsonb_array_elements(new_audios) a group by a->>'id' having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(new_state->'shares') s
      where s->>'audioId' is not null and not exists
      (select 1 from jsonb_array_elements(new_audios) a where a->>'id' = s->>'audioId'))
    or exists (select 1 from jsonb_array_elements(new_audios) a where not exists
      (select 1 from jsonb_array_elements(new_state->'shares') s where s->>'audioId' = a->>'id')) then
    raise exception 'INVALID_AUDIO_REFERENCE';
  end if;
  insert into public.reading_nook_snapshots(user_id) values(owner) on conflict do nothing;
  select * into current_row from public.reading_nook_snapshots where user_id = owner for update;
  -- A lost HTTP response can retry exactly the same write, but not different content.
  if current_row.operation_id = operation then
    if current_row.state is distinct from new_state or current_row.audios is distinct from new_audios then
      raise exception 'OPERATION_REUSED';
    end if;
    return current_row.version;
  end if;
  if current_row.version <> expected_version then raise exception 'SYNC_CONFLICT'; end if;
  update public.reading_nook_snapshots set version = version + 1,
    operation_id = operation, state = new_state, audios = new_audios, updated_at = now()
    where user_id = owner returning version into expected_version;
  return expected_version;
end;
$$;
revoke all on function public.reading_nook_save(bigint,uuid,jsonb,jsonb) from public, anon;
grant execute on function public.reading_nook_save(bigint,uuid,jsonb,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('reading-nook-audio','reading-nook-audio',false,31457280,
  array['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/mpeg','audio/x-m4a','audio/aac'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists reading_nook_audio_read on storage.objects;
create policy reading_nook_audio_read on storage.objects for select to authenticated
  using(bucket_id='reading-nook-audio' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists reading_nook_audio_insert on storage.objects;
create policy reading_nook_audio_insert on storage.objects for insert to authenticated
  with check(bucket_id='reading-nook-audio' and (storage.foldername(name))[1]=(select auth.uid())::text
    and name ~ '^[a-f0-9-]{36}/[a-f0-9]{64}$');
-- Objects are immutable. No client UPDATE/DELETE policies: another device may still need them.
-- Removing a share stops publishing its reference. Old unreferenced objects require owner maintenance.
commit;
