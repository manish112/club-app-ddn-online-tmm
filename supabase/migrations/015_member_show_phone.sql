alter table members
  add column if not exists show_phone_in_contact boolean not null default false;
