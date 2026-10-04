-- Messages between customers and a business, and an extended customer card
-- (tags, birthday, preferences, before/after photos). Run after the first migration.

-- ───────────────────────────── Extended customer card ─────────────────────────────

alter table public.customers
  add column if not exists tags text[] not null default '{}',
  add column if not exists birthday date,
  add column if not exists preferences text not null default '';

create table public.customer_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  -- Path inside the private storage bucket "customer-photos": <business_id>/<customer_id>/<file>
  path text not null,
  kind text not null default 'other' check (kind in ('before', 'after', 'other')),
  caption text not null default '',
  created_at timestamptz not null default now()
);
create index customer_photos_customer on public.customer_photos (customer_id, created_at desc);

alter table public.customer_photos enable row level security;
create policy "members manage customer photos" on public.customer_photos for all
  using (is_member(business_id)) with check (is_member(business_id));

-- ───────────────────────────── Messages ─────────────────────────────

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  last_message_at timestamptz not null default now(),
  last_message text not null default '',
  last_sender text check (last_sender in ('customer', 'business')),
  business_read_at timestamptz,
  customer_read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, customer_id)
);
create index conversations_business on public.conversations (business_id, last_message_at desc);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  sender text not null check (sender in ('customer', 'business')),
  sender_user uuid references auth.users (id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  appointment_id uuid references public.appointments (id) on delete set null,
  created_at timestamptz not null default now()
);
create index messages_conversation on public.messages (conversation_id, id);

create or replace function public.is_conversation_customer(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations v join customers cu on cu.id = v.customer_id
    where v.id = c and cu.user_id = auth.uid()
  );
$$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "members and the customer read conversations" on public.conversations for select
  using (is_member(business_id) or is_conversation_customer(id));
create policy "members start conversations" on public.conversations for insert
  with check (is_member(business_id));
create policy "members and the customer update read state" on public.conversations for update
  using (is_member(business_id) or is_conversation_customer(id));

create policy "members and the customer read messages" on public.messages for select
  using (is_member(business_id) or is_conversation_customer(conversation_id));

-- Members may write as the business; the customer may write as the customer — never the other way round.
create policy "write own side" on public.messages for insert with check (
  sender_user = auth.uid()
  and business_id = (select v.business_id from conversations v where v.id = conversation_id)
  and (
    (sender = 'business' and is_member(business_id))
    or (sender = 'customer' and is_conversation_customer(conversation_id))
  )
);

-- Customer side: open (or reuse) the conversation with a business. Creates the customer card if needed.
create or replace function public.start_conversation(p_business uuid, p_full_name text default null, p_phone text default null, p_appointment uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile profiles;
  v_customer uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'יש להתחבר כדי לשלוח הודעה' using errcode = '28000'; end if;
  if not exists (select 1 from businesses where id = p_business) then raise exception 'העסק לא נמצא'; end if;
  select * into v_profile from profiles where id = v_uid;
  select id into v_customer from customers where business_id = p_business and user_id = v_uid;
  if v_customer is null and coalesce(nullif(p_phone, ''), v_profile.phone) is not null then
    select id into v_customer from customers where business_id = p_business and phone = coalesce(nullif(p_phone, ''), v_profile.phone);
    if v_customer is not null then update customers set user_id = v_uid where id = v_customer; end if;
  end if;
  if v_customer is null then
    insert into customers (business_id, user_id, full_name, phone, email)
    values (p_business, v_uid, coalesce(nullif(trim(p_full_name), ''), nullif(v_profile.full_name, ''), 'לקוח/ה'),
            coalesce(nullif(p_phone, ''), v_profile.phone, ''), v_profile.email)
    returning id into v_customer;
  end if;
  insert into conversations (business_id, customer_id, appointment_id)
  values (p_business, v_customer, p_appointment)
  on conflict (business_id, customer_id) do update set appointment_id = coalesce(excluded.appointment_id, conversations.appointment_id)
  returning id into v_id;
  return v_id;
end $$;

-- Keep the conversation summary current and put customer messages in the activity feed.
create or replace function public.on_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  update conversations set
    last_message_at = new.created_at,
    last_message = left(new.body, 140),
    last_sender = new.sender,
    business_read_at = case when new.sender = 'business' then new.created_at else business_read_at end,
    customer_read_at = case when new.sender = 'customer' then new.created_at else customer_read_at end
  where id = new.conversation_id;
  if new.sender = 'customer' then
    select c.full_name into v_name from conversations v join customers c on c.id = v.customer_id where v.id = new.conversation_id;
    insert into activity (business_id, kind, title, body, customer_id)
    select new.business_id, 'message', 'הודעה חדשה', v_name || ': ' || left(new.body, 80), v.customer_id
    from conversations v where v.id = new.conversation_id;
  end if;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages for each row execute function public.on_message_insert();

grant select, insert, update on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select, insert, update, delete on public.customer_photos to authenticated;
grant execute on function public.start_conversation(uuid, text, text, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.conversations;
  end if;
end $$;

-- ───────────────────────────── Storage for customer photos ─────────────────────────────
-- Private bucket; files live under <business_id>/… and only that business's members can read or write them.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('customer-photos', 'customer-photos', false) on conflict (id) do nothing;
    execute $p$
      create policy "members read customer photos" on storage.objects for select to authenticated
        using (bucket_id = 'customer-photos' and public.is_member(((storage.foldername(name))[1])::uuid))
    $p$;
    execute $p$
      create policy "members upload customer photos" on storage.objects for insert to authenticated
        with check (bucket_id = 'customer-photos' and public.is_member(((storage.foldername(name))[1])::uuid))
    $p$;
    execute $p$
      create policy "members delete customer photos" on storage.objects for delete to authenticated
        using (bucket_id = 'customer-photos' and public.is_member(((storage.foldername(name))[1])::uuid))
    $p$;
  end if;
end $$;
