-- Beautigo management system: businesses, staff, services, hours, customers,
-- appointments, blocked time, waitlist, live activity and Google Calendar connections.
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to run once on a new project.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ───────────────────────────── Profiles ─────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    -- Supabase stores phones without '+'; the app uses E.164 everywhere
    case when coalesce(new.phone, '') = '' then null when left(new.phone, 1) = '+' then new.phone else '+' || new.phone end,
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────── Businesses & staff ─────────────────────────────

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  phone text not null default '',
  address text not null default '',
  timezone text not null default 'Asia/Jerusalem',
  cancel_hours int not null default 24 check (cancel_hours >= 0),
  slot_step_min int not null default 15 check (slot_step_min in (5, 10, 15, 20, 30, 60)),
  lead_min int not null default 30 check (lead_min >= 0),
  quick_replies text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  title text not null default '',
  color text not null default '#6d4aff',
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  professional_id uuid references public.professionals (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

-- Staff invites by phone: the person signs in with that phone and claims the invite.
create table public.business_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  phone text not null,
  professional_id uuid references public.professionals (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  duration_min int not null check (duration_min between 5 and 600),
  buffer_min int not null default 0 check (buffer_min between 0 and 120),
  price numeric(10, 2) not null default 0 check (price >= 0),
  approval text not null default 'auto' check (approval in ('auto', 'manual')),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.professional_services (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (professional_id, service_id)
);

-- Weekly hours and breaks in the business's local time (minutes from midnight).
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  kind text not null default 'work' check (kind in ('work', 'break')),
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_min int not null check (start_min between 0 and 1439),
  end_min int not null check (end_min between 1 and 1440),
  check (end_min > start_min)
);

-- ───────────────────────────── Customers & appointments ─────────────────────────────

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  full_name text not null check (length(trim(full_name)) >= 2),
  phone text not null default '',
  email text,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create unique index customers_business_phone on public.customers (business_id, phone) where phone <> '';
create unique index customers_business_user on public.customers (business_id, user_id) where user_id is not null;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  professional_id uuid not null references public.professionals (id),
  service_id uuid references public.services (id) on delete set null,
  customer_id uuid not null references public.customers (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  buffer_min int not null default 0,
  block_ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  service_name text not null,
  price numeric(10, 2) not null default 0,
  note text not null default '',
  source text not null default 'manual' check (source in ('online', 'manual')),
  cancel_reason text,
  google_event_id text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- The database itself refuses two active appointments that overlap for the same professional.
  constraint appointments_no_overlap exclude using gist (
    professional_id with =,
    tstzrange(starts_at, block_ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'))
);
create index appointments_business_time on public.appointments (business_id, starts_at);
create index appointments_customer on public.appointments (customer_id);

create table public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  professional_id uuid not null references public.professionals (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  source text not null default 'manual' check (source in ('manual', 'google')),
  external_id text,
  check (ends_at > starts_at)
);
create index blocked_times_pro on public.blocked_times (professional_id, starts_at);

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  professional_id uuid references public.professionals (id) on delete set null,
  date_from date not null,
  date_to date not null,
  part_of_day text not null default 'any' check (part_of_day in ('any', 'morning', 'noon', 'evening')),
  note text not null default '',
  status text not null default 'waiting' check (status in ('waiting', 'notified', 'booked', 'cancelled')),
  notified_at timestamptz,
  offered_start timestamptz,
  created_at timestamptz not null default now(),
  check (date_to >= date_from)
);
create index waitlist_business on public.waitlist (business_id, status);

create table public.activity (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  customer_id uuid references public.customers (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  waitlist_id uuid references public.waitlist (id) on delete set null,
  created_at timestamptz not null default now()
);
create index activity_business on public.activity (business_id, id desc);

-- Tokens live here and are never readable from the browser (RLS on, no policies).
create table public.google_connections (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  google_email text,
  calendar_id text not null default 'primary',
  calendar_name text,
  -- Busy times from this calendar are imported as blocked time for this professional (optional).
  professional_id uuid references public.professionals (id) on delete set null,
  refresh_token text,
  access_token text,
  access_expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected', 'error')),
  last_sync_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

-- ───────────────────────────── Helpers ─────────────────────────────

create or replace function public.is_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members where business_id = b and user_id = auth.uid());
$$;

create or replace function public.is_owner(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members where business_id = b and user_id = auth.uid() and role = 'owner');
$$;

-- Staff see only their own column; owners see everything.
create or replace function public.can_see_professional(b uuid, p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from business_members m
    where m.business_id = b and m.user_id = auth.uid()
      and (m.role = 'owner' or m.professional_id = p)
  );
$$;

create or replace function public.set_appointment_times() returns trigger
language plpgsql as $$
begin
  new.block_ends_at := new.ends_at + make_interval(mins => new.buffer_min);
  new.updated_at := now();
  return new;
end $$;

create trigger appointments_times before insert or update of starts_at, ends_at, buffer_min, status
  on public.appointments for each row execute function public.set_appointment_times();

-- An appointment may only reference a customer, professional and service of the same business.
create or replace function public.check_appointment_refs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from customers where id = new.customer_id and business_id = new.business_id)
     or not exists (select 1 from professionals where id = new.professional_id and business_id = new.business_id)
     or (new.service_id is not null and not exists (select 1 from services where id = new.service_id and business_id = new.business_id)) then
    raise exception 'נתוני התור אינם שייכים לעסק' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger appointments_refs before insert or update of customer_id, professional_id, service_id, business_id
  on public.appointments for each row execute function public.check_appointment_refs();

-- Creating a business makes the creator its owner.
create or replace function public.add_owner_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into business_members (business_id, user_id, role) values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end $$;

create trigger businesses_owner after insert on public.businesses
  for each row execute function public.add_owner_membership();

-- ───────────────────────────── Availability ─────────────────────────────

create or replace function public.available_slots(
  p_business uuid, p_service uuid, p_day date, p_professional uuid default null, p_exclude uuid default null
) returns table (starts_at timestamptz, professional_id uuid)
language sql stable security definer set search_path = public as $$
  with b as (select * from businesses where id = p_business),
  s as (select * from services where id = p_service and business_id = p_business and active),
  pros as (
    select p.id from professionals p
    join professional_services ps on ps.professional_id = p.id and ps.service_id = p_service
    where p.business_id = p_business and p.active and (p_professional is null or p.id = p_professional)
  ),
  windows as (
    select w.professional_id,
      ((p_day + make_interval(mins => w.start_min)) at time zone b.timezone) as ws,
      ((p_day + make_interval(mins => w.end_min)) at time zone b.timezone) as we
    from working_hours w, b
    where w.kind = 'work' and w.weekday = extract(dow from p_day)::int
      and w.professional_id in (select id from pros)
  ),
  candidates as (
    select w.professional_id, t as starts_at,
      t + make_interval(mins => s.duration_min + s.buffer_min) as block_end
    from windows w, s, b,
      generate_series(w.ws, w.we - make_interval(mins => s.duration_min + s.buffer_min), make_interval(mins => b.slot_step_min)) as t
  )
  select c.starts_at, c.professional_id
  from candidates c, b
  where c.starts_at >= now() + make_interval(mins => b.lead_min)
    and c.starts_at <= now() + interval '90 days'
    and not exists (
      select 1 from working_hours br
      where br.professional_id = c.professional_id and br.kind = 'break' and br.weekday = extract(dow from p_day)::int
        and tstzrange(((p_day + make_interval(mins => br.start_min)) at time zone b.timezone), ((p_day + make_interval(mins => br.end_min)) at time zone b.timezone))
            && tstzrange(c.starts_at, c.block_end)
    )
    and not exists (
      select 1 from blocked_times x
      where x.professional_id = c.professional_id and tstzrange(x.starts_at, x.ends_at) && tstzrange(c.starts_at, c.block_end)
    )
    and not exists (
      select 1 from appointments a
      where a.professional_id = c.professional_id and a.status in ('pending', 'confirmed')
        and (p_exclude is null or a.id <> p_exclude)
        and tstzrange(a.starts_at, a.block_ends_at) && tstzrange(c.starts_at, c.block_end)
    )
  order by c.starts_at, c.professional_id;
$$;

-- ───────────────────────────── Booking RPCs ─────────────────────────────

-- Online booking by a signed-in customer (phone OTP or Google).
create or replace function public.book_online(
  p_business uuid, p_service uuid, p_start timestamptz, p_professional uuid default null,
  p_full_name text default null, p_phone text default null, p_note text default ''
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_service services;
  v_pro uuid;
  v_customer uuid;
  v_profile profiles;
  v_id uuid;
begin
  if v_uid is null then raise exception 'יש להתחבר כדי לקבוע תור' using errcode = '28000'; end if;
  select * into v_service from services where id = p_service and business_id = p_business and active;
  if not found then raise exception 'השירות אינו זמין'; end if;

  select professional_id into v_pro from available_slots(p_business, p_service, (p_start at time zone (select timezone from businesses where id = p_business))::date, p_professional)
    where starts_at = p_start
    order by (select count(*) from appointments a where a.professional_id = available_slots.professional_id and a.starts_at::date = p_start::date)
    limit 1;
  if v_pro is null then raise exception 'המועד כבר לא פנוי' using errcode = 'P0001', hint = 'slot_taken'; end if;

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

  insert into appointments (business_id, professional_id, service_id, customer_id, starts_at, ends_at, buffer_min,
                            status, service_name, price, note, source, created_by)
  values (p_business, v_pro, v_service.id, v_customer, p_start, p_start + make_interval(mins => v_service.duration_min),
          v_service.buffer_min, case when v_service.approval = 'manual' then 'pending' else 'confirmed' end,
          v_service.name, v_service.price, coalesce(p_note, ''), 'online', v_uid)
  returning id into v_id;

  -- A customer who books from the waitlist is taken off it
  update waitlist set status = 'booked'
    where business_id = p_business and customer_id = v_customer and status in ('waiting', 'notified')
      and (service_id is null or service_id = v_service.id);
  return v_id;
exception when exclusion_violation then
  raise exception 'המועד כבר לא פנוי' using errcode = 'P0001', hint = 'slot_taken';
end $$;

-- Customer joins the waitlist when nothing suitable is free.
create or replace function public.join_waitlist(
  p_business uuid, p_service uuid, p_date_from date, p_date_to date, p_part text default 'any',
  p_professional uuid default null, p_full_name text default null, p_phone text default null, p_note text default ''
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_customer uuid;
  v_profile profiles;
  v_id uuid;
begin
  if v_uid is null then raise exception 'יש להתחבר כדי להצטרף לרשימת ההמתנה' using errcode = '28000'; end if;
  select * into v_profile from profiles where id = v_uid;
  select id into v_customer from customers where business_id = p_business and user_id = v_uid;
  if v_customer is null then
    insert into customers (business_id, user_id, full_name, phone, email)
    values (p_business, v_uid, coalesce(nullif(trim(p_full_name), ''), nullif(v_profile.full_name, ''), 'לקוח/ה'),
            coalesce(nullif(p_phone, ''), v_profile.phone, ''), v_profile.email)
    returning id into v_customer;
  end if;
  insert into waitlist (business_id, customer_id, service_id, professional_id, date_from, date_to, part_of_day, note)
  values (p_business, v_customer, p_service, p_professional, p_date_from, p_date_to, coalesce(p_part, 'any'), coalesce(p_note, ''))
  returning id into v_id;
  return v_id;
end $$;

-- Cancellation by the customer (within policy) or by business staff.
create or replace function public.cancel_appointment(p_id uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  a appointments;
  b businesses;
  is_staff boolean;
begin
  select * into a from appointments where id = p_id for update;
  if not found then raise exception 'התור לא נמצא'; end if;
  select * into b from businesses where id = a.business_id;
  is_staff := can_see_professional(a.business_id, a.professional_id);
  if not is_staff then
    if not exists (select 1 from customers c where c.id = a.customer_id and c.user_id = auth.uid()) then
      raise exception 'אין הרשאה לבטל את התור' using errcode = '42501';
    end if;
    if a.starts_at - now() < make_interval(hours => b.cancel_hours) then
      raise exception 'אפשר לבטל עד % שעות לפני התור', b.cancel_hours;
    end if;
  end if;
  if a.status not in ('pending', 'confirmed') then raise exception 'אי אפשר לבטל תור במצב הזה'; end if;
  update appointments set status = 'cancelled', cancel_reason = nullif(p_reason, '') where id = p_id;
end $$;

-- Claim staff invites that match the signed-in phone number.
create or replace function public.claim_invites() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_phone text;
  n int := 0;
  r business_invites;
begin
  select coalesce(phone, '') into v_phone from profiles where id = auth.uid();
  if v_phone = '' then return 0; end if;
  for r in select * from business_invites where regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g') loop
    insert into business_members (business_id, user_id, role, professional_id)
    values (r.business_id, auth.uid(), 'staff', r.professional_id) on conflict do nothing;
    delete from business_invites where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Non-secret Google Calendar status for the business's members.
create or replace function public.google_status(p_business uuid)
returns table (google_email text, calendar_id text, calendar_name text, professional_id uuid, status text, last_sync_at timestamptz, last_error text)
language sql stable security definer set search_path = public as $$
  select g.google_email, g.calendar_id, g.calendar_name, g.professional_id, g.status, g.last_sync_at, g.last_error
  from google_connections g where g.business_id = p_business and is_member(p_business);
$$;

-- ───────────────────────────── Activity feed ─────────────────────────────

create or replace function public.log_activity(p_business uuid, p_kind text, p_title text, p_body text,
  p_customer uuid default null, p_appointment uuid default null, p_waitlist uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into activity (business_id, kind, title, body, customer_id, appointment_id, waitlist_id)
  values (p_business, p_kind, p_title, p_body, p_customer, p_appointment, p_waitlist);
$$;

create or replace function public.fmt_local(t timestamptz, tz text) returns text
language sql stable as $$ select to_char(t at time zone tz, 'DD/MM HH24:MI') $$;

create or replace function public.on_customer_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_activity(new.business_id, 'customer_registered', 'רישום לקוח חדש', new.full_name || ' נרשם/ה למערכת', new.id);
  return new;
end $$;
create trigger customers_activity after insert on public.customers for each row execute function public.on_customer_insert();

create or replace function public.on_appointment_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_tz text;
  v_pro text;
  w record;
begin
  select full_name into v_name from customers where id = new.customer_id;
  select timezone into v_tz from businesses where id = new.business_id;
  select name into v_pro from professionals where id = new.professional_id;
  if tg_op = 'INSERT' then
    perform log_activity(new.business_id, 'appointment_booked',
      case when new.status = 'pending' then 'בקשת תור חדשה' else 'זימון תור' end,
      v_name || ' הזמינ/ה תור ל' || new.service_name || ' אצל ' || v_pro || ' · ' || fmt_local(new.starts_at, v_tz),
      new.customer_id, new.id);
    return new;
  end if;

  if new.status = 'cancelled' and old.status in ('pending', 'confirmed') then
    perform log_activity(new.business_id, 'appointment_cancelled', 'ביטול תור',
      v_name || ' · ' || new.service_name || ' · ' || fmt_local(new.starts_at, v_tz), new.customer_id, new.id);
    -- Free slot → offer it to matching people on the waitlist (most recent request last)
    for w in
      select wl.id, c.full_name from waitlist wl join customers c on c.id = wl.customer_id
      where wl.business_id = new.business_id and wl.status = 'waiting'
        and (wl.service_id is null or wl.service_id = new.service_id)
        and (wl.professional_id is null or wl.professional_id = new.professional_id)
        and (new.starts_at at time zone v_tz)::date between wl.date_from and wl.date_to
        and (wl.part_of_day = 'any'
          or (wl.part_of_day = 'morning' and extract(hour from new.starts_at at time zone v_tz) < 12)
          or (wl.part_of_day = 'noon' and extract(hour from new.starts_at at time zone v_tz) between 12 and 16)
          or (wl.part_of_day = 'evening' and extract(hour from new.starts_at at time zone v_tz) >= 17))
      order by wl.created_at
    loop
      update waitlist set status = 'notified', notified_at = now(), offered_start = new.starts_at where id = w.id;
      perform log_activity(new.business_id, 'waitlist_slot_opened', 'רשימת המתנה',
        'התפנה מקום ב־' || fmt_local(new.starts_at, v_tz) || ' — ' || w.full_name || ' ממתינ/ה ל' || new.service_name,
        null, new.id, w.id);
    end loop;
  elsif new.starts_at <> old.starts_at and new.status in ('pending', 'confirmed') then
    perform log_activity(new.business_id, 'appointment_rescheduled', 'שינוי מועד',
      v_name || ' · ' || fmt_local(old.starts_at, v_tz) || ' ← ' || fmt_local(new.starts_at, v_tz), new.customer_id, new.id);
  elsif new.status <> old.status and new.status = 'confirmed' and old.status = 'pending' then
    perform log_activity(new.business_id, 'appointment_approved', 'תור אושר', v_name || ' · ' || new.service_name, new.customer_id, new.id);
  elsif new.status <> old.status and new.status = 'no_show' then
    perform log_activity(new.business_id, 'appointment_no_show', 'לא הגיע/ה', v_name || ' · ' || new.service_name, new.customer_id, new.id);
  end if;
  return new;
end $$;
create trigger appointments_activity after insert or update on public.appointments
  for each row execute function public.on_appointment_change();

create or replace function public.on_waitlist_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select full_name into v_name from customers where id = new.customer_id;
  perform log_activity(new.business_id, 'waitlist_joined', 'רשימת המתנה',
    v_name || ' נכנס/ה לרשימת ההמתנה', new.customer_id, null, new.id);
  return new;
end $$;
create trigger waitlist_activity after insert on public.waitlist for each row execute function public.on_waitlist_insert();

-- ───────────────────────────── Row Level Security ─────────────────────────────

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.professionals enable row level security;
alter table public.business_members enable row level security;
alter table public.business_invites enable row level security;
alter table public.services enable row level security;
alter table public.professional_services enable row level security;
alter table public.working_hours enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.blocked_times enable row level security;
alter table public.waitlist enable row level security;
alter table public.activity enable row level security;
alter table public.google_connections enable row level security;

create policy "own profile" on public.profiles for select using (id = auth.uid());
create policy "update own profile" on public.profiles for update using (id = auth.uid());
create policy "members read profiles of their customers" on public.profiles for select using (
  exists (select 1 from customers c where c.user_id = profiles.id and is_member(c.business_id))
);

-- Public catalogue (needed by the online booking page)
create policy "businesses are public" on public.businesses for select using (true);
create policy "create own business" on public.businesses for insert with check (owner_id = auth.uid());
create policy "owner updates business" on public.businesses for update using (is_owner(id));
create policy "owner deletes business" on public.businesses for delete using (is_owner(id));

create policy "pros are public" on public.professionals for select using (true);
create policy "owner manages pros" on public.professionals for all using (is_owner(business_id)) with check (is_owner(business_id));

create policy "services are public" on public.services for select using (true);
create policy "owner manages services" on public.services for all using (is_owner(business_id)) with check (is_owner(business_id));

create policy "pro services are public" on public.professional_services for select using (true);
create policy "owner manages pro services" on public.professional_services for all
  using (is_owner((select business_id from professionals p where p.id = professional_id)))
  with check (is_owner((select business_id from professionals p where p.id = professional_id)));

create policy "hours are public" on public.working_hours for select using (true);
create policy "owner manages hours" on public.working_hours for all
  using (is_owner((select business_id from professionals p where p.id = professional_id)))
  with check (is_owner((select business_id from professionals p where p.id = professional_id)));

create policy "members read members" on public.business_members for select using (is_member(business_id) or user_id = auth.uid());
create policy "owner manages members" on public.business_members for all using (is_owner(business_id)) with check (is_owner(business_id));

create policy "owner manages invites" on public.business_invites for all using (is_owner(business_id)) with check (is_owner(business_id));

create policy "members read customers" on public.customers for select using (is_member(business_id) or user_id = auth.uid());
create policy "members add customers" on public.customers for insert with check (is_member(business_id));
create policy "members edit customers" on public.customers for update using (is_member(business_id));
create policy "owner deletes customers" on public.customers for delete using (is_owner(business_id));

create policy "read appointments" on public.appointments for select using (
  can_see_professional(business_id, professional_id)
  or exists (select 1 from customers c where c.id = customer_id and c.user_id = auth.uid())
);
create policy "staff create appointments" on public.appointments for insert
  with check (can_see_professional(business_id, professional_id));
create policy "staff update appointments" on public.appointments for update
  using (can_see_professional(business_id, professional_id))
  with check (can_see_professional(business_id, professional_id));

create policy "staff read blocks" on public.blocked_times for select using (is_member(business_id));
create policy "staff manage own blocks" on public.blocked_times for all
  using (can_see_professional(business_id, professional_id))
  with check (can_see_professional(business_id, professional_id));

create policy "read waitlist" on public.waitlist for select using (
  is_member(business_id) or exists (select 1 from customers c where c.id = customer_id and c.user_id = auth.uid())
);
create policy "members manage waitlist" on public.waitlist for all using (is_member(business_id)) with check (is_member(business_id));

create policy "members read activity" on public.activity for select using (is_member(business_id));
-- google_connections: no policies on purpose — only the server (service role) touches tokens.

grant usage on schema public to anon, authenticated;
grant select on public.businesses, public.professionals, public.services, public.professional_services, public.working_hours to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.google_connections from anon, authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.available_slots(uuid, uuid, date, uuid, uuid) to anon, authenticated;
grant execute on function public.book_online(uuid, uuid, timestamptz, uuid, text, text, text) to authenticated;
grant execute on function public.join_waitlist(uuid, uuid, date, date, text, uuid, text, text, text) to authenticated;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;
grant execute on function public.claim_invites() to authenticated;
grant execute on function public.google_status(uuid) to authenticated;
revoke execute on function public.log_activity(uuid, text, text, text, uuid, uuid, uuid) from public, anon, authenticated;

-- Live updates for the activity feed and calendar
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.activity, public.appointments, public.waitlist;
  end if;
end $$;
