create table if not exists patterns (
  id         text primary key,
  user_id    text not null,
  name       text not null,
  bpm        integer not null,
  swing      integer not null,
  tracks     text not null,
  created_at timestamptz not null default now()
);
create index if not exists patterns_user_id_idx on patterns (user_id);
