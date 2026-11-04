-- =====================================================================
--  AI를 활용한 가곡동 이야기책 만들기 — Supabase 스키마
--  통합 프로젝트용, 모든 테이블 접두어 ys_ (마을작가 책 앱 bk_ 와 따로) (다른 앱 테이블은 건드리지 않음)
--  사용법: SQL Editor → 이 파일 전체 붙여넣기 → 맨 아래 운영자 이름·비밀번호 바꾸기 → Run
--  여러 번 실행해도 기존 데이터는 지워지지 않습니다.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- 테이블 ----------
-- tracks: 'story'(가곡동 이야기책) — 과정이 하나뿐이라 가입하면 자동으로 들어감
create table if not exists public.ys_people (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  pin_hash text not null,
  role text not null default 'member' check (role in ('member','teacher','admin')),
  tracks text[] not null default '{}',
  active boolean not null default true,
  fails int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

-- 첫 로그인 안내·동의 기록 {ver, at, ai, privacy}
alter table public.ys_people add column if not exists consent jsonb;
-- 직접 가입: 전화번호, 운영자 승인 여부 (운영자가 등록한 사람은 바로 승인)
alter table public.ys_people add column if not exists phone text;
alter table public.ys_people add column if not exists approved boolean not null default true;

create table if not exists public.ys_tokens (
  token_hash text primary key,
  person_id uuid not null references public.ys_people(id) on delete cascade,
  expires_at timestamptz not null
);

-- 한 사람이 트랙마다 작품 하나. pages = [{tpl, head, text, imgs:[{url,w,h,fit}], hint}]
create table if not exists public.ys_works (
  person_id uuid not null references public.ys_people(id) on delete cascade,
  track text not null check (track in ('story')),
  title text not null default '',
  pen_name text not null default '',
  intro text not null default '',
  pages jsonb not null default '[]',
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (person_id, track)
);

create table if not exists public.ys_books (
  track text primary key check (track in ('story')),
  data jsonb not null default '{}'
);

create table if not exists public.ys_tickets (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.ys_people(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes'
);

-- 회차 사진 (운영자·강사가 올림)
create table if not exists public.ys_photos (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('story')),
  session_no int not null,
  url text not null,
  thumb text,
  w int, h int,
  created_at timestamptz not null default now()
);
create index if not exists ys_photos_track_idx on public.ys_photos(track, session_no);
-- track 'all' = 과정 구분 없이 올린 전체 공용 사진, session_no 0 = 회차 구분 안 함
alter table public.ys_photos drop constraint if exists ys_photos_track_check;
alter table public.ys_photos add constraint ys_photos_track_check check (track in ('story','all'));

-- 내 사진첩 (회차 사진에서 담아 온 것 + 직접 올린 것)
create table if not exists public.ys_album (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.ys_people(id) on delete cascade,
  url text not null,
  thumb text,
  w int, h int,
  src_photo uuid references public.ys_photos(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ys_album_person_idx on public.ys_album(person_id);

-- 회차별 교육자료 (강사·운영자가 올림, 참여자는 자기 과정 것 + 모든 과정 공통 열람)
create table if not exists public.ys_materials (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('story','all')),
  session_no int not null default 0,          -- 0 = 과정 공통
  title text not null,
  kind text not null default 'file' check (kind in ('file','link')),
  url text not null,
  fname text, bytes bigint, mime text,
  created_at timestamptz not null default now()
);
create index if not exists ys_materials_track_idx on public.ys_materials(track, session_no);
-- 자료 순서 (작을수록 앞, 같으면 올린 순)
alter table public.ys_materials add column if not exists ord int not null default 0;
-- 업로드 허가표 종류: img(사진, 누구나) / doc(교육자료, 강사·운영자만)
alter table public.ys_tickets add column if not exists kind text not null default 'img';

-- AI 교정 하루 사용 횟수
create table if not exists public.ys_proof (
  person_id uuid not null references public.ys_people(id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (person_id, day)
);

-- ===== 이야기책 교육용 추가 =====
-- AI 그림·AI 인터뷰 하루 사용 횟수 (kind: image / interview)
create table if not exists public.ys_usage (
  person_id uuid not null references public.ys_people(id) on delete cascade,
  day date not null,
  kind text not null,
  n int not null default 0,
  primary key (person_id, day, kind)
);
-- 개인 메모: interview(AI 인터뷰 대화·정리) / plan(주제·독자·핵심 메시지·12쪽 구성표)
create table if not exists public.ys_notes (
  person_id uuid not null references public.ys_people(id) on delete cascade,
  kind text not null check (kind in ('interview','plan')),
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (person_id, kind)
);
-- 그림체 후보 (강사·운영자가 올림) · 투표 · 정해진 그림체(ys_settings 'style')
create table if not exists public.ys_styles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prompt text not null default '',
  sample_url text, sample_thumb text,
  ord int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.ys_votes (
  person_id uuid primary key references public.ys_people(id) on delete cascade,
  style_id uuid not null references public.ys_styles(id) on delete cascade,
  at timestamptz not null default now()
);
create table if not exists public.ys_settings (
  key text primary key,
  value jsonb
);
-- 이야기 지도: 기억 속 장소 (참여자 모두가 봄)
create table if not exists public.ys_pins (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.ys_people(id) on delete cascade,
  lat double precision not null, lng double precision not null,
  place text not null default '', era text not null default '', memo text not null default '',
  created_at timestamptz not null default now()
);

-- 수업 활동 답 (자기소개·소감 등, curriculum.js의 acts). 한 사람이 활동마다 하나
create table if not exists public.ys_answers (
  person_id uuid not null references public.ys_people(id) on delete cascade,
  act text not null,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (person_id, act)
);

-- 테이블 직접 접근 차단 (모든 읽기·쓰기는 아래 함수로만)
do $$ declare t text; begin
  foreach t in array array['ys_people','ys_tokens','ys_works','ys_books','ys_tickets','ys_proof','ys_photos','ys_album','ys_materials','ys_usage','ys_notes','ys_styles','ys_votes','ys_settings','ys_pins','ys_answers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------- 공통 함수 ----------
create or replace function public.ys_hash(t text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(t, 'sha256'), 'hex')
$$;

-- p_shared: 여러 사람이 쓰는 기기면 로그인을 12시간만 유지 (예전 2칸짜리 함수는 지우고 새로 만듦)
drop function if exists public.ys_login(text, text);
create or replace function public.ys_login(p_name text, p_pin text, p_shared boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare p public.ys_people; t text;
begin
  select * into p from ys_people
   where replace(name, ' ', '') = replace(coalesce(p_name, ''), ' ', '') and active
   limit 1;
  if not found then
    perform pg_sleep(0.3);
    return jsonb_build_object('error', '이름 또는 비밀번호가 맞지 않아요.');
  end if;
  if p.locked_until is not null and p.locked_until > now() then
    return jsonb_build_object('error', '비밀번호를 5번 틀려서 10분 동안 잠겼어요. 잠시 뒤 다시 해 주세요.');
  end if;
  if p.pin_hash <> extensions.crypt(coalesce(p_pin, ''), p.pin_hash) then
    update ys_people
       set fails = case when fails + 1 >= 5 then 0 else fails + 1 end,
           locked_until = case when fails + 1 >= 5 then now() + interval '10 minutes' else null end
     where id = p.id;
    return jsonb_build_object('error', '이름 또는 비밀번호가 맞지 않아요.');
  end if;
  if not p.approved then
    return jsonb_build_object('error', '가입 신청은 들어왔어요. 선생님이 승인하면 들어올 수 있어요. 승인 뒤에 다시 로그인해 주세요.', 'pending', true);
  end if;
  update ys_people set fails = 0, locked_until = null where id = p.id;
  delete from ys_tokens where expires_at < now();
  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into ys_tokens values (ys_hash(t), p.id, now() + case when coalesce(p_shared, false) then interval '12 hours' else interval '60 days' end);
  return jsonb_build_object('token', t,
    'me', jsonb_build_object('id', p.id, 'name', p.name, 'role', p.role, 'tracks', to_jsonb(p.tracks), 'consent', p.consent));
end $$;

-- 직접 가입: 이름·전화번호·비밀번호·참여 과정·동의 → 운영자 승인을 기다리는 상태로 등록
create or replace function public.ys_signup(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_name text := trim(coalesce(p->>'name', '')); v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[^0-9]', '', 'g');
        v_pw text := coalesce(p->>'pw', ''); v_tracks text[];
begin
  if length(v_name) < 2 or length(v_name) > 20 then return jsonb_build_object('error', '이름을 2~20자로 적어 주세요.'); end if;
  if v_phone !~ '^01[0-9]{8,9}$' then return jsonb_build_object('error', '휴대폰 번호를 숫자로 적어 주세요. 예) 01012345678'); end if;
  if length(v_pw) < 4 or length(v_pw) > 40 then return jsonb_build_object('error', '비밀번호는 4자 이상으로 정해 주세요.'); end if;
  select array_agg(x) into v_tracks from jsonb_array_elements_text(p->'tracks') x where x in ('story');
  if coalesce(array_length(v_tracks, 1), 0) = 0 then return jsonb_build_object('error', '참여한 과정을 하나 이상 골라 주세요.'); end if;
  if not coalesce((p->'consent'->>'privacy')::boolean, false) then return jsonb_build_object('error', '개인정보 수집·이용에 동의해야 가입할 수 있어요.'); end if;
  if exists (select 1 from ys_people x where replace(x.name, ' ', '') = replace(v_name, ' ', '')) then
    return jsonb_build_object('error', '같은 이름으로 가입한 분이 있어요. 이름 뒤에 구분할 말을 붙여 주세요. 예) 김하람(가곡), 김하람2');
  end if;
  if (select count(*) from ys_people where not approved) >= 200 then
    return jsonb_build_object('error', '가입 신청이 너무 많이 밀려 있어요. 선생님께 말씀해 주세요.'); end if;
  insert into ys_people (name, phone, pin_hash, role, tracks, approved, consent)
  values (v_name, v_phone, extensions.crypt(v_pw, extensions.gen_salt('bf')), 'member', v_tracks, false,
          jsonb_build_object('ver', coalesce(p->'consent'->>'ver', ''), 'at', now(), 'privacy', true,
                             'ai', coalesce((p->'consent'->>'ai')::boolean, false)));
  return jsonb_build_object('ok', true, 'pending', true);
end $$;
revoke all on function public.ys_signup(jsonb) from public;
grant execute on function public.ys_signup(jsonb) to anon, authenticated;

-- 업로드 허가표 검사 (Storage 정책에서 사용)
create or replace function public.ys_ticket_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(p_name, '/', 1) = 't' and exists (
    select 1 from ys_tickets t
     where t.id::text = split_part(p_name, '/', 2) and t.expires_at > now() and t.kind = 'img')
$$;
create or replace function public.ys_doc_ticket_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(p_name, '/', 1) = 't' and exists (
    select 1 from ys_tickets t
     where t.id::text = split_part(p_name, '/', 2) and t.expires_at > now() and t.kind = 'doc')
$$;
revoke all on function public.ys_doc_ticket_ok(text) from public;
grant execute on function public.ys_doc_ticket_ok(text) to anon, authenticated;

-- 작품 요약 (현황판·책 만들기용)
create or replace function public.ys_sum(w public.ys_works) returns jsonb
language sql stable strict set search_path = public as $$
  select jsonb_build_object(
    'npages', jsonb_array_length(w.pages),
    'open_notes', coalesce((select count(*) from jsonb_array_elements(w.pages) p,
                            jsonb_array_elements(coalesce(p->'notes', '[]'::jsonb)) n
                            where coalesce((n->>'done')::boolean, false) = false), 0),
    'chars', coalesce((select sum(length(coalesce(p->>'text', ''))) from jsonb_array_elements(w.pages) p), 0),
    'imgs',  coalesce((select count(*) from jsonb_array_elements(w.pages) p,
                       jsonb_array_elements(coalesce(p->'imgs', '[]'::jsonb)) i where i->>'url' is not null), 0))
$$;

-- ---------- 메인 API ----------
create or replace function public.ys_api(p_token text, p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  me public.ys_people;
  staff boolean;
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_id uuid;
  v_tr text := coalesce(d->>'track', '');
  v_n int;
  w public.ys_works;
  ph public.ys_photos;
  v_aid uuid;
  v_owner uuid;
begin
  select pp.* into me from ys_tokens t join ys_people pp on pp.id = t.person_id
   where t.token_hash = ys_hash(coalesce(p_token, '')) and t.expires_at > now() and pp.active;
  if not found then return jsonb_build_object('error', 'auth'); end if;
  staff := me.role in ('teacher', 'admin');
  -- 강사·운영자는 다른 사람 대신 작업할 수 있음 (d.id)
  v_owner := case when staff and coalesce(d->>'id', '') <> '' then (d->>'id')::uuid else me.id end;

  case p_action

  when 'me' then
    return jsonb_build_object('me', jsonb_build_object('id', me.id, 'name', me.name, 'role', me.role, 'tracks', to_jsonb(me.tracks), 'consent', me.consent));

  -- 안내 확인·AI 교정 동의 (ai는 나중에 바꿀 수 있음)
  when 'consent' then
    update ys_people set consent = jsonb_build_object('ver', coalesce(d->>'ver', ''), 'at', now(),
                                                      'ai', coalesce((d->>'ai')::boolean, false))
     where id = me.id;
    return jsonb_build_object('ok', true, 'consent', (select consent from ys_people where id = me.id));

  when 'logout' then
    delete from ys_tokens where token_hash = ys_hash(p_token);
    return jsonb_build_object('ok', true);

  when 'pin_change' then
    if length(coalesce(d->>'new', '')) < 4 or length(d->>'new') > 40 then
      return jsonb_build_object('error', '새 비밀번호는 4자 이상으로 정해 주세요.'); end if;
    if me.pin_hash <> extensions.crypt(coalesce(d->>'old', ''), me.pin_hash) then
      return jsonb_build_object('error', '지금 비밀번호가 맞지 않아요.'); end if;
    update ys_people set pin_hash = extensions.crypt(d->>'new', extensions.gen_salt('bf')) where id = me.id;
    return jsonb_build_object('ok', true);

  -- ===== 작품 =====
  when 'work_get' then
    v_id := coalesce(nullif(d->>'id', '')::uuid, me.id);
    if v_id <> me.id and not staff then return jsonb_build_object('error', '다른 분의 작품은 열 수 없어요.'); end if;
    if v_tr not in ('story') then return jsonb_build_object('error', '과정을 골라 주세요.'); end if;
    return jsonb_build_object(
      'name', (select name from ys_people where id = v_id),
      'work', coalesce((select to_jsonb(x) from ys_works x where x.person_id = v_id and x.track = v_tr),
                jsonb_build_object('person_id', v_id, 'track', v_tr, 'title', '', 'pen_name', '',
                  'intro', '', 'pages', '[]'::jsonb, 'confirmed_at', null)));

  when 'work_save' then
    v_id := case when staff and coalesce(d->>'id', '') <> '' then (d->>'id')::uuid else me.id end;
    if v_tr not in ('story') then return jsonb_build_object('error', '과정을 골라 주세요.'); end if;
    if not staff and not (v_tr = any(me.tracks)) then
      return jsonb_build_object('error', '참여한 과정이 아니에요. 운영자에게 말씀해 주세요.'); end if;
    if d ? 'pages' and (jsonb_typeof(d->'pages') <> 'array' or jsonb_array_length(d->'pages') > 60
                        or length((d->'pages')::text) > 300000) then
      return jsonb_build_object('error', '쪽이 너무 많아요. 60쪽까지 만들 수 있어요.'); end if;
    -- 동시 편집 막기: 불러온 뒤(base)에 다른 곳에서 저장했으면 덮어쓰지 않음 (force면 덮어씀)
    select * into w from ys_works x where x.person_id = v_id and x.track = v_tr;
    if found and d ? 'base' and not coalesce((d->>'force')::boolean, false)
       and w.updated_at is distinct from nullif(d->>'base', '')::timestamptz then
      return jsonb_build_object('error', 'conflict', 'updated_at', w.updated_at);
    end if;
    insert into ys_works (person_id, track) values (v_id, v_tr) on conflict do nothing;
    update ys_works x set
      title    = coalesce(d->>'title', x.title),
      pen_name = coalesce(d->>'pen_name', x.pen_name),
      intro    = coalesce(d->>'intro', x.intro),
      pages    = coalesce(d->'pages', x.pages),
      -- 동의한 뒤 글·그림을 고치면 동의가 풀림
      confirmed_at = case when (d ? 'pages' and d->'pages' is distinct from x.pages)
                            or (d ? 'title' and d->>'title' is distinct from x.title)
                          then null else x.confirmed_at end,
      updated_at = now()
    where x.person_id = v_id and x.track = v_tr
    returning * into w;
    return jsonb_build_object('ok', true, 'confirmed_at', w.confirmed_at, 'updated_at', w.updated_at);

  when 'confirm' then
    v_id := case when staff and coalesce(d->>'id', '') <> '' then (d->>'id')::uuid else me.id end;
    update ys_works set confirmed_at = case when (d->>'on')::boolean then now() else null end
     where person_id = v_id and track = v_tr
    returning * into w;
    if not found then return jsonb_build_object('error', '먼저 한 쪽이라도 써 주세요.'); end if;
    return jsonb_build_object('ok', true, 'confirmed_at', w.confirmed_at);

  -- ===== 현황판 (강사·운영자) =====
  when 'board' then
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    return jsonb_build_object('rows', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'track', tr,
               'title', w2.title, 'confirmed', w2.confirmed_at is not null, 'updated_at', w2.updated_at)
               || coalesce(ys_sum(w2), jsonb_build_object('npages', 0, 'chars', 0, 'imgs', 0, 'open_notes', 0))
             order by tr, p.name)
        from ys_people p cross join unnest(p.tracks) tr
        left join ys_works w2 on w2.person_id = p.id and w2.track = tr
       where p.active), '[]'::jsonb));

  -- ===== 참여자 관리 (운영자) =====
  -- 운영자 백업: 사람(PIN 제외)·작품·책 정보·회차 사진·사진첩 목록 전체
  when 'backup' then
    if me.role <> 'admin' then return jsonb_build_object('error', '운영자만 할 수 있어요.'); end if;
    return jsonb_build_object('app', 'gagok-story', 'made_at', now(),
      'people', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'role', x.role, 'tracks', to_jsonb(x.tracks), 'phone', x.phone,
                   'approved', x.approved, 'active', x.active, 'consent', x.consent, 'created_at', x.created_at) order by x.name), '[]'::jsonb) from ys_people x),
      'works',  (select coalesce(jsonb_agg(to_jsonb(x) order by x.track, x.person_id), '[]'::jsonb) from ys_works x),
      'books',  (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from ys_books x),
      'photos', (select coalesce(jsonb_agg(to_jsonb(x) order by x.track, x.session_no, x.created_at), '[]'::jsonb) from ys_photos x),
      'album',  (select coalesce(jsonb_agg(to_jsonb(x) order by x.person_id, x.created_at), '[]'::jsonb) from ys_album x),
      'materials', (select coalesce(jsonb_agg(to_jsonb(x) order by x.track, x.session_no, x.created_at), '[]'::jsonb) from ys_materials x),
      'notes',  (select coalesce(jsonb_agg(to_jsonb(x) order by x.person_id, x.kind), '[]'::jsonb) from ys_notes x),
      'pins',   (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb) from ys_pins x),
      'styles', (select coalesce(jsonb_agg(to_jsonb(x) order by x.ord), '[]'::jsonb) from ys_styles x),
      'votes',  (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from ys_votes x),
      'settings', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from ys_settings x),
      'answers', (select coalesce(jsonb_agg(to_jsonb(x) order by x.act, x.updated_at), '[]'::jsonb) from ys_answers x));

  when 'people' then
    if me.role <> 'admin' then return jsonb_build_object('error', '운영자만 볼 수 있어요.'); end if;
    return jsonb_build_object('people', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'role', p.role, 'tracks', to_jsonb(p.tracks), 'phone', p.phone,
               'approved', p.approved, 'created_at', p.created_at,
               'active', p.active, 'locked', p.locked_until > now(), 'consent', p.consent) order by p.approved, p.role desc, p.name)
        from ys_people p), '[]'::jsonb));

  -- 가입 승인 / 거절(삭제)
  when 'person_approve' then
    if me.role <> 'admin' then return jsonb_build_object('error', '운영자만 할 수 있어요.'); end if;
    if coalesce((d->>'ok')::boolean, false) then
      update ys_people set approved = true where id = (d->>'id')::uuid and role = 'member';
    else
      delete from ys_people where id = (d->>'id')::uuid and role = 'member' and not approved;
    end if;
    return jsonb_build_object('ok', true);

  when 'person_save' then
    if me.role <> 'admin' then return jsonb_build_object('error', '운영자만 할 수 있어요.'); end if;
    if coalesce(d->>'pin', '') <> '' and (length(d->>'pin') < 4 or length(d->>'pin') > 40) then
      return jsonb_build_object('error', '비밀번호는 4자 이상이에요.'); end if;
    if coalesce(d->>'phone', '') <> '' and regexp_replace(d->>'phone', '[^0-9]', '', 'g') !~ '^01[0-9]{8,9}$' then
      return jsonb_build_object('error', '휴대폰 번호를 숫자로 적어 주세요. 예) 01012345678'); end if;
    -- 로그인은 띄어쓰기를 무시하므로 띄어쓰기만 다른 이름도 같은 이름으로 봄
    if coalesce(trim(d->>'name'), '') <> '' and exists (
         select 1 from ys_people x
          where replace(x.name, ' ', '') = replace(trim(d->>'name'), ' ', '')
            and x.id::text <> coalesce(d->>'id', '')) then
      return jsonb_build_object('error', '같은 이름(띄어쓰기만 다른 이름 포함)이 이미 있어요. 뒤에 숫자나 구분할 말을 붙여 주세요.');
    end if;
    begin
      if coalesce(d->>'id', '') = '' then
        if coalesce(d->>'pin', '') = '' then return jsonb_build_object('error', '비밀번호를 정해 주세요.'); end if;
        insert into ys_people (name, phone, pin_hash, role, tracks)
        values (trim(d->>'name'), nullif(regexp_replace(coalesce(d->>'phone', ''), '[^0-9]', '', 'g'), ''),
                extensions.crypt(d->>'pin', extensions.gen_salt('bf')),
                coalesce(nullif(d->>'role', ''), 'member'),
                coalesce((select array_agg(x) from jsonb_array_elements_text(d->'tracks') x
                           where x in ('story')), '{}'));
      else
        update ys_people set
          name   = coalesce(nullif(trim(d->>'name'), ''), name),
          phone  = case when d ? 'phone' then nullif(regexp_replace(d->>'phone', '[^0-9]', '', 'g'), '') else phone end,
          role   = coalesce(nullif(d->>'role', ''), role),
          tracks = case when d ? 'tracks' then coalesce((select array_agg(x) from jsonb_array_elements_text(d->'tracks') x
                          where x in ('story')), '{}') else tracks end,
          active = coalesce((d->>'active')::boolean, active),
          pin_hash = case when coalesce(d->>'pin', '') <> ''
                          then extensions.crypt(d->>'pin', extensions.gen_salt('bf')) else pin_hash end,
          fails = 0, locked_until = null
        where id = (d->>'id')::uuid;
      end if;
    exception when unique_violation then
      return jsonb_build_object('error', '같은 이름이 이미 있어요. 뒤에 숫자나 구분할 말을 붙여 주세요.');
    end;
    return jsonb_build_object('ok', true);

  -- ===== 책 만들기 (트랙별 합본) =====
  when 'book' then
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    return jsonb_build_object(
      'settings', coalesce((select data from ys_books where track = v_tr), '{}'::jsonb),
      'works', coalesce((
        select jsonb_agg(to_jsonb(w2) || jsonb_build_object('name', p.name) || ys_sum(w2) order by p.name)
          from ys_works w2 join ys_people p on p.id = w2.person_id
         where w2.track = v_tr and p.active and jsonb_array_length(w2.pages) > 0), '[]'::jsonb));

  when 'book_save' then
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    if v_tr not in ('story') then return jsonb_build_object('error', '과정을 골라 주세요.'); end if;
    insert into ys_books (track, data) values (v_tr, coalesce(d->'data', '{}'::jsonb))
    on conflict (track) do update set data = excluded.data;
    return jsonb_build_object('ok', true);

  -- ===== 사진 업로드 허가 =====
  when 'ticket' then
    delete from ys_tickets where expires_at < now();
    if (select count(*) from ys_tickets where person_id = me.id) >= (case when staff then 400 else 40 end) then
      return jsonb_build_object('error', '사진을 너무 많이 올렸어요. 10분 뒤 다시 해 주세요.'); end if;
    if coalesce(d->>'kind', 'img') = 'doc' and not staff then return jsonb_build_object('error', '교육자료는 강사·운영자만 올릴 수 있어요.'); end if;
    insert into ys_tickets (person_id, kind) values (me.id, case when coalesce(d->>'kind', 'img') = 'doc' then 'doc' else 'img' end) returning id into v_id;
    return jsonb_build_object('ticket', v_id);

  -- ===== 교육자료 =====
  when 'materials' then
    if v_tr not in ('story','all') then return jsonb_build_object('error', '과정을 골라 주세요.'); end if;
    if not staff and v_tr <> 'all' and not (v_tr = any(me.tracks)) then
      return jsonb_build_object('error', '참여한 과정의 자료만 볼 수 있어요.'); end if;
    return jsonb_build_object('materials', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'track', x.track, 'no', x.session_no, 'title', x.title, 'kind', x.kind,
               'url', x.url, 'fname', x.fname, 'bytes', x.bytes, 'mime', x.mime, 'at', x.created_at) order by x.track, x.session_no, x.ord, x.created_at)
        from ys_materials x where x.track = v_tr or x.track = 'all'), '[]'::jsonb));

  when 'material_add' then
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    if v_tr not in ('story','all') then return jsonb_build_object('error', '과정을 골라 주세요.'); end if;
    if coalesce(trim(d->>'title'), '') = '' or coalesce(d->>'url', '') = '' then return jsonb_build_object('error', '제목과 파일(또는 링크)이 필요해요.'); end if;
    if coalesce(d->>'kind', 'file') = 'link' and d->>'url' !~ '^https?://' then return jsonb_build_object('error', '링크는 http:// 또는 https:// 로 시작해야 해요.'); end if;
    insert into ys_materials (track, session_no, title, kind, url, fname, bytes, mime)
    values (v_tr, case when v_tr = 'all' then 0 else coalesce((d->>'no')::int, 0) end, trim(d->>'title'),
            case when coalesce(d->>'kind', 'file') = 'link' then 'link' else 'file' end, d->>'url', d->>'fname', (d->>'bytes')::bigint, d->>'mime')
    returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id);

  when 'material_set' then  -- 제목 바꾸기·옮기기
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    update ys_materials set
      title = coalesce(nullif(trim(d->>'title'), ''), title),
      track = case when v_tr in ('story','all') then v_tr else track end,
      session_no = case when v_tr = 'all' then 0 when v_tr in ('story') then coalesce((d->>'no')::int, 0) else session_no end
     where id = (d->>'mid')::uuid;
    return jsonb_build_object('ok', true);

  when 'material_order' then  -- 한 칸 안의 순서를 통째로 저장 (ids 순서대로 0,1,2…)
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    update ys_materials m set ord = o.i - 1
      from (select value::uuid as id, ordinality as i from jsonb_array_elements_text(d->'ids') with ordinality) o
     where m.id = o.id;
    return jsonb_build_object('ok', true);

  when 'material_del' then
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    delete from ys_materials where id = (d->>'mid')::uuid;
    return jsonb_build_object('ok', true);

  -- ===== 회차 사진 =====
  -- 그 과정의 회차별·구분 안 함 사진 + 전체 공용 사진을 함께 돌려줌 (track 'all'이면 전체 공용만)
  when 'photos' then
    if v_tr not in ('story','all') then return jsonb_build_object('error', '과정을 골라 주세요.'); end if;
    if not staff and v_tr <> 'all' and not (v_tr = any(me.tracks)) then
      return jsonb_build_object('error', '참여한 과정의 사진만 볼 수 있어요.'); end if;
    return jsonb_build_object(
      'photos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'track', x.track, 'no', x.session_no, 'url', x.url, 'thumb', x.thumb, 'w', x.w, 'h', x.h)
                 order by x.track, x.session_no, x.created_at) from ys_photos x where x.track = v_tr or x.track = 'all'), '[]'::jsonb),
      'taken', coalesce((select jsonb_agg(a.src_photo) from ys_album a where a.person_id = v_owner and a.src_photo is not null), '[]'::jsonb));

  when 'photo_add' then
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    if v_tr not in ('story','all') then return jsonb_build_object('error', '과정을 골라 주세요.'); end if;
    insert into ys_photos (track, session_no, url, thumb, w, h)
    values (v_tr, case when v_tr = 'all' then 0 else coalesce((d->>'no')::int, 0) end, d->>'url', d->>'thumb', (d->>'w')::int, (d->>'h')::int) returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id);

  when 'photo_move' then  -- 다른 과정·회차(또는 구분 안 함·전체 공용)로 옮기기
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    if v_tr not in ('story','all') then return jsonb_build_object('error', '옮길 곳을 골라 주세요.'); end if;
    update ys_photos set track = v_tr, session_no = case when v_tr = 'all' then 0 else coalesce((d->>'no')::int, 0) end
     where id = (d->>'pid')::uuid;
    return jsonb_build_object('ok', true);

  when 'photo_set' then  -- 돌린 사진으로 바꾸기
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    update ys_photos set url = d->>'url', thumb = d->>'thumb', w = (d->>'w')::int, h = (d->>'h')::int
     where id = (d->>'pid')::uuid;
    return jsonb_build_object('ok', true);

  when 'photo_del' then
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    delete from ys_photos where id = (d->>'pid')::uuid;
    return jsonb_build_object('ok', true);

  -- ===== 내 사진첩 =====
  when 'album' then
    return jsonb_build_object('album', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'url', a.url, 'thumb', a.thumb, 'w', a.w, 'h', a.h, 'src', a.src_photo)
             order by a.created_at desc) from ys_album a where a.person_id = v_owner), '[]'::jsonb));

  when 'album_add' then
    if coalesce(d->>'src', '') <> '' then
      select * into ph from ys_photos where id = (d->>'src')::uuid;
      if not found then return jsonb_build_object('error', '이 사진은 지워졌어요.'); end if;
      if not staff and ph.track <> 'all' and not (ph.track = any(me.tracks)) then return jsonb_build_object('error', '참여한 과정의 사진만 담을 수 있어요.'); end if;
      select id into v_aid from ys_album where person_id = v_owner and src_photo = ph.id limit 1;
      if v_aid is null then
        insert into ys_album (person_id, url, thumb, w, h, src_photo)
        values (v_owner, ph.url, ph.thumb, ph.w, ph.h, ph.id) returning id into v_aid;
      end if;
    else
      if coalesce(d->>'url', '') = '' then return jsonb_build_object('error', '사진이 없어요.'); end if;
      if (select count(*) from ys_album where person_id = v_owner) >= 300 then
        return jsonb_build_object('error', '사진첩이 가득 찼어요 (300장). 안 쓰는 사진을 빼 주세요.'); end if;
      insert into ys_album (person_id, url, thumb, w, h)
      values (v_owner, d->>'url', d->>'thumb', (d->>'w')::int, (d->>'h')::int) returning id into v_aid;
    end if;
    return jsonb_build_object('ok', true, 'item', (select jsonb_build_object('id', a.id, 'url', a.url, 'thumb', a.thumb, 'w', a.w, 'h', a.h, 'src', a.src_photo)
                                                  from ys_album a where a.id = v_aid));

  when 'album_set' then  -- 돌린 사진으로 바꾸기 (내 사본만)
    update ys_album set url = d->>'url', thumb = d->>'thumb', w = (d->>'w')::int, h = (d->>'h')::int
     where id = (d->>'aid')::uuid and (person_id = me.id or staff);
    return jsonb_build_object('ok', true);

  when 'album_del' then
    delete from ys_album where id = (d->>'aid')::uuid and (person_id = me.id or staff);
    return jsonb_build_object('ok', true);

  -- ===== AI 교정 (api/proof.js 서버 함수가 부름) =====
  -- 교정 전: 로그인과 오늘 남은 횟수만 확인 (횟수는 줄이지 않음)
  when 'proof_check' then
    -- 글 주인(참여자)이 AI 교정에 동의했는지 (강사가 대신 교정할 때도 참여자 기준)
    if exists (select 1 from ys_people x where x.id = v_owner and x.role = 'member'
                and coalesce((x.consent->>'ai')::boolean, false) = false) then
      return jsonb_build_object('error', case when v_owner = me.id
        then 'AI 기능을 쓰려면 먼저 동의가 필요해요.'
        else '이 분은 AI 기능에 동의하지 않았어요. 동의를 받은 뒤에 써 주세요.' end);
    end if;
    if not staff and coalesce((select n from ys_proof where person_id = me.id
                                and day = (now() at time zone 'Asia/Seoul')::date), 0) >= 20 then
      return jsonb_build_object('error', '오늘 AI 교정은 20번까지 쓸 수 있어요. 내일 다시 해 주세요.'); end if;
    return jsonb_build_object('ok', true);

  -- 교정이 성공했을 때만 1번 셈
  when 'proof_use' then
    insert into ys_proof (person_id, day, n) values (me.id, (now() at time zone 'Asia/Seoul')::date, 1)
    on conflict (person_id, day) do update set n = ys_proof.n + 1
    returning n into v_n;
    return jsonb_build_object('ok', true, 'used', v_n);

  -- ===== AI 그림·AI 인터뷰 (api/image.js, api/interview.js 서버 함수가 부름) =====
  -- 쓰기 전: 동의와 오늘 남은 횟수 확인 (차감하지 않음). 참여자 하루 한도: 그림 10장, 인터뷰 80번
  when 'ai_check' then
    if coalesce(d->>'kind', '') not in ('image', 'interview') then return jsonb_build_object('error', '종류를 알 수 없어요.'); end if;
    if exists (select 1 from ys_people x where x.id = v_owner and x.role = 'member'
                and coalesce((x.consent->>'ai')::boolean, false) = false) then
      return jsonb_build_object('error', case when v_owner = me.id
        then 'AI 기능을 쓰려면 먼저 동의가 필요해요.'
        else '이 분은 AI 기능에 동의하지 않았어요. 동의를 받은 뒤에 써 주세요.' end);
    end if;
    if staff then return jsonb_build_object('ok', true, 'left', null); end if;
    v_n := (case when d->>'kind' = 'image' then 10 else 80 end)
           - coalesce((select n from ys_usage where person_id = me.id and kind = d->>'kind'
                       and day = (now() at time zone 'Asia/Seoul')::date), 0);
    if v_n <= 0 then
      return jsonb_build_object('error', case when d->>'kind' = 'image'
        then '오늘 AI 그림은 다 만들었어요 (하루 10장). 내일 다시 해 주세요.'
        else '오늘 AI 인터뷰 횟수를 다 썼어요 (하루 80번). 내일 이어서 해 주세요.' end, 'left', 0);
    end if;
    return jsonb_build_object('ok', true, 'left', v_n);

  when 'ai_use' then
    if coalesce(d->>'kind', '') not in ('image', 'interview') then return jsonb_build_object('error', '종류를 알 수 없어요.'); end if;
    insert into ys_usage (person_id, day, kind, n) values (me.id, (now() at time zone 'Asia/Seoul')::date, d->>'kind', 1)
    on conflict (person_id, day, kind) do update set n = ys_usage.n + 1
    returning n into v_n;
    return jsonb_build_object('ok', true, 'used', v_n);

  -- ===== 개인 메모 (AI 인터뷰 · 12쪽 구성표) =====
  when 'note_get' then
    if coalesce(d->>'kind', '') not in ('interview', 'plan') then return jsonb_build_object('error', '종류를 알 수 없어요.'); end if;
    return jsonb_build_object('data', coalesce((select data from ys_notes where person_id = v_owner and kind = d->>'kind'), '{}'::jsonb));

  when 'note_save' then
    if coalesce(d->>'kind', '') not in ('interview', 'plan') then return jsonb_build_object('error', '종류를 알 수 없어요.'); end if;
    if length(coalesce(d->'data', '{}'::jsonb)::text) > 200000 then return jsonb_build_object('error', '메모가 너무 길어요.'); end if;
    insert into ys_notes (person_id, kind, data, updated_at) values (v_owner, d->>'kind', coalesce(d->'data', '{}'::jsonb), now())
    on conflict (person_id, kind) do update set data = excluded.data, updated_at = now();
    return jsonb_build_object('ok', true);

  -- ===== 그림체 투표 =====
  when 'styles' then
    return jsonb_build_object(
      'styles', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'prompt', s.prompt, 'url', s.sample_url, 'thumb', s.sample_thumb,
                   'votes', (select count(*) from ys_votes vv where vv.style_id = s.id)) order by s.ord, s.created_at) from ys_styles s), '[]'::jsonb),
      'mine', (select style_id from ys_votes where person_id = me.id),
      'picked', (select value from ys_settings where key = 'style'),
      'voters', (select count(*) from ys_votes));

  when 'style_save' then
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    if length(trim(coalesce(d->>'name', ''))) = 0 then return jsonb_build_object('error', '그림체 이름을 적어 주세요.'); end if;
    if coalesce(d->>'sid', '') = '' then
      insert into ys_styles (name, prompt, sample_url, sample_thumb, ord)
      values (trim(d->>'name'), coalesce(d->>'prompt', ''), nullif(d->>'url', ''), nullif(d->>'thumb', ''),
              coalesce((select max(ord) + 1 from ys_styles), 0)) returning id into v_id;
    else
      v_id := (d->>'sid')::uuid;
      update ys_styles set name = trim(d->>'name'), prompt = coalesce(d->>'prompt', ''),
             sample_url = case when d ? 'url' then nullif(d->>'url', '') else sample_url end,
             sample_thumb = case when d ? 'thumb' then nullif(d->>'thumb', '') else sample_thumb end
       where id = v_id;
      -- 정해진 그림체를 고치면 정한 내용도 같이 바뀜
      update ys_settings set value = jsonb_build_object('id', v_id, 'name', trim(d->>'name'), 'prompt', coalesce(d->>'prompt', ''))
       where key = 'style' and value->>'id' = v_id::text;
    end if;
    return jsonb_build_object('ok', true, 'id', v_id);

  when 'style_del' then
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    delete from ys_settings where key = 'style' and value->>'id' = d->>'sid';
    delete from ys_styles where id = (d->>'sid')::uuid;
    return jsonb_build_object('ok', true);

  when 'vote' then
    if coalesce(d->>'sid', '') = '' then delete from ys_votes where person_id = me.id; return jsonb_build_object('ok', true); end if;
    insert into ys_votes (person_id, style_id) values (me.id, (d->>'sid')::uuid)
    on conflict (person_id) do update set style_id = excluded.style_id, at = now();
    return jsonb_build_object('ok', true);

  when 'style_pick' then
    if not staff then return jsonb_build_object('error', '권한이 없어요.'); end if;
    if coalesce(d->>'sid', '') = '' then delete from ys_settings where key = 'style'; return jsonb_build_object('ok', true); end if;
    insert into ys_settings (key, value)
    select 'style', jsonb_build_object('id', s.id, 'name', s.name, 'prompt', s.prompt) from ys_styles s where s.id = (d->>'sid')::uuid
    on conflict (key) do update set value = excluded.value;
    return jsonb_build_object('ok', true);

  -- ===== 이야기 지도 =====
  when 'pins' then
    return jsonb_build_object('pins', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'lat', x.lat, 'lng', x.lng, 'place', x.place, 'era', x.era, 'memo', x.memo,
             'name', p.name, 'mine', x.person_id = me.id, 'at', x.created_at) order by x.created_at)
             from ys_pins x join ys_people p on p.id = x.person_id where p.active), '[]'::jsonb));

  when 'pin_add' then
    if length(trim(coalesce(d->>'place', ''))) = 0 then return jsonb_build_object('error', '장소 이름을 적어 주세요.'); end if;
    if (select count(*) from ys_pins where person_id = me.id) >= 50 then return jsonb_build_object('error', '장소는 한 사람이 50곳까지 남길 수 있어요.'); end if;
    insert into ys_pins (person_id, lat, lng, place, era, memo)
    values (me.id, (d->>'lat')::float8, (d->>'lng')::float8, left(trim(d->>'place'), 60), left(coalesce(d->>'era', ''), 40), left(coalesce(d->>'memo', ''), 600))
    returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id);

  when 'pin_set' then
    update ys_pins set place = left(trim(coalesce(d->>'place', place)), 60), era = left(coalesce(d->>'era', era), 40), memo = left(coalesce(d->>'memo', memo), 600),
           lat = coalesce((d->>'lat')::float8, lat), lng = coalesce((d->>'lng')::float8, lng)
     where id = (d->>'pid')::uuid and (person_id = me.id or staff);
    return jsonb_build_object('ok', true);

  when 'pin_del' then
    delete from ys_pins where id = (d->>'pid')::uuid and (person_id = me.id or staff);
    return jsonb_build_object('ok', true);

  -- ===== 수업 활동 (오늘 수업 탭 ↔ 수업 화면 class.html) =====
  when 'answer_get' then
    return jsonb_build_object('answers', coalesce((select jsonb_object_agg(a.act, jsonb_build_object('data', a.data, 'at', a.updated_at))
             from ys_answers a where a.person_id = v_owner), '{}'::jsonb));

  when 'answer_save' then
    if coalesce(d->>'act', '') !~ '^[a-z0-9_]{1,40}$' then return jsonb_build_object('error', '활동 이름이 잘못됐어요.'); end if;
    if length(coalesce(d->'data', '{}'::jsonb)::text) > 20000 then return jsonb_build_object('error', '글이 너무 길어요.'); end if;
    insert into ys_answers (person_id, act, data, updated_at) values (v_owner, d->>'act', coalesce(d->'data', '{}'::jsonb), now())
    on conflict (person_id, act) do update set data = excluded.data, updated_at = now();
    return jsonb_build_object('ok', true);

  -- 수업 화면용: 활동 답 + 참여자 + 지도 장소를 한 번에 (강사·운영자)
  when 'class_live' then
    if not staff then return jsonb_build_object('error', '강사·운영자만 볼 수 있어요.'); end if;
    return jsonb_build_object(
      'answers', coalesce((select jsonb_agg(jsonb_build_object('act', a.act, 'id', p.id, 'name', p.name, 'data', a.data, 'at', a.updated_at) order by a.updated_at)
                 from ys_answers a join ys_people p on p.id = a.person_id
                 where p.active and a.act in (select jsonb_array_elements_text(coalesce(d->'acts', '[]'::jsonb)))), '[]'::jsonb),
      'members', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'approved', p.approved,
                   'ai', coalesce((p.consent->>'ai')::boolean, false)) order by p.created_at)
                 from ys_people p where p.active and p.role = 'member'), '[]'::jsonb),
      'pins', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'lat', x.lat, 'lng', x.lng, 'place', x.place, 'era', x.era, 'memo', x.memo, 'name', p.name, 'pid', p.id) order by x.created_at)
                 from ys_pins x join ys_people p on p.id = x.person_id where p.active), '[]'::jsonb),
      -- AI 인터뷰 진행 현황 (대답 수·정리 여부만, 내용은 보내지 않음)
      'iv', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
                 'answers', (select count(*) from jsonb_array_elements(coalesce(n.data->'msgs', '[]'::jsonb)) m where m->>'r' = 'me'),
                 'sum', coalesce(n.data->>'summary', '') <> '', 'at', n.updated_at))
                 from ys_notes n join ys_people p on p.id = n.person_id where n.kind = 'interview' and p.active), '[]'::jsonb),
      'now', now());

  else
    return jsonb_build_object('error', '알 수 없는 요청이에요: ' || coalesce(p_action, ''));
  end case;
end $$;

revoke all on function public.ys_api(text, text, jsonb) from public;
revoke all on function public.ys_login(text, text, boolean) from public;
revoke all on function public.ys_ticket_ok(text) from public;
revoke all on function public.ys_sum(public.ys_works) from public;
grant execute on function public.ys_api(text, text, jsonb) to anon, authenticated;
grant execute on function public.ys_login(text, text, boolean) to anon, authenticated;
grant execute on function public.ys_ticket_ok(text) to anon, authenticated;

-- ---------- 사진 저장소 (공개 읽기, 업로드는 허가표가 있을 때만) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ys-book', 'ys-book', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "ys_book_upload" on storage.objects;
create policy "ys_book_upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'ys-book' and public.ys_ticket_ok(name));

-- 교육자료 저장소: 파일 50MB까지, 종류 제한 없음 (강사·운영자만 올림)
insert into storage.buckets (id, name, public, file_size_limit)
values ('ys-docs', 'ys-docs', true, 52428800)
on conflict (id) do nothing;
drop policy if exists "ys_docs_upload" on storage.objects;
create policy "ys_docs_upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'ys-docs' and public.ys_doc_ticket_ok(name));

-- ---------- 기본 책 정보 (책 만들기에서 고칠 수 있음) ----------
insert into public.ys_books (track, data) values
  ('story', jsonb_build_object('title', '가곡동 이야기책', 'subtitle', 'AI와 함께 쓰고 그린 우리 동네 이야기', 'color', '#2F5D8A'))
on conflict (track) do nothing;

update public.ys_books set data = jsonb_build_object(
    'publisher', '밀양시 도시재생지원센터 가곡재생팀', 'date', '2026년 12월',
    'greeting', '', 'credits', '', 'isbn', '',
    'bleed', false, 'pad4', true, 'order', '[]'::jsonb, 'exclude', '[]'::jsonb) || data
 where not (data ? 'publisher');

-- ▼ 운영자 계정: 이름과 비밀번호를 바꾼 뒤 실행하세요. 로그인 후 비밀번호 변경도 가능합니다.
insert into public.ys_people (name, pin_hash, role, tracks)
values ('운영자', extensions.crypt('0000', extensions.gen_salt('bf')), 'admin', '{}')
on conflict (name) do nothing;
