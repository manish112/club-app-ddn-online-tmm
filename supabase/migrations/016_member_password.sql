alter table members
  add column if not exists password_hash text,
  add column if not exists password_salt text;
