-- Integration test for the management schema. Run against a scratch database:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/local_stubs.sql -f supabase/migrations/*.sql -f supabase/tests/management_test.sql
-- Every check raises an exception on failure.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false); end $$;

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;
set client_min_messages = notice;

insert into auth.users (id, phone, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', null, 'owner.a@example.com', '{"full_name":"בעלת עסק א"}'),
  ('00000000-0000-0000-0000-0000000000b1', null, 'owner.b@example.com', '{"full_name":"בעל עסק ב"}'),
  ('00000000-0000-0000-0000-0000000000c1', '972521111111', null, '{}'),
  ('00000000-0000-0000-0000-0000000000d1', '972502222222', null, '{"full_name":"אלונה לביא"}'),
  ('00000000-0000-0000-0000-0000000000e1', '972503333333', null, '{"full_name":"שיר בר"}');

select pg_temp.check((select count(*) from profiles) = 5, 'profiles are created for new auth users');
select pg_temp.check((select phone from profiles where id = '00000000-0000-0000-0000-0000000000d1') = '+972502222222', 'phone stored in E.164');

-- ── Owner A sets up a business ──
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into businesses (id, owner_id, name, slug, cancel_hours) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'סטודיו א', 'studio-a', 24);
select pg_temp.check(is_owner('10000000-0000-0000-0000-000000000001'), 'creator becomes owner');
insert into professionals (id, business_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'דניאל כהן'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'נועה לוי');
insert into services (id, business_id, name, duration_min, buffer_min, price) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'תספורת', 60, 10, 120);
insert into services (id, business_id, name, duration_min, buffer_min, price, approval) values
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'צבע', 90, 0, 300, 'manual');
insert into professional_services values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002');
insert into working_hours (professional_id, kind, weekday, start_min, end_min)
  select p, 'work', d, 540, 1080 from generate_series(0, 6) d,
    unnest(array['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002']::uuid[]) p;
insert into working_hours (professional_id, kind, weekday, start_min, end_min)
  select '20000000-0000-0000-0000-000000000001', 'break', d, 780, 840 from generate_series(0, 6) d;

-- ── Owner B cannot touch business A ──
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into businesses (id, owner_id, name, slug) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'סטודיו ב', 'studio-b');
do $$ begin
  insert into professionals (business_id, name) values ('10000000-0000-0000-0000-000000000001', 'פולש');
  raise exception 'FAILED: other owner inserted a professional';
exception when insufficient_privilege then raise notice 'ok - other owner cannot add staff to a foreign business';
end $$;

-- ── Availability (public) ──
reset role; set role anon; select pg_temp.as_user(null);
create temp table d as select (current_date + 3) as day;
grant select on d to anon, authenticated;
select pg_temp.check(
  (select count(*) from available_slots('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', (select day from d))) > 20,
  'anonymous visitors see free slots');
select pg_temp.check(
  not exists (select 1 from available_slots('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', (select day from d), '20000000-0000-0000-0000-000000000001') s
    where extract(hour from s.starts_at at time zone 'Asia/Jerusalem') * 60 + extract(minute from s.starts_at at time zone 'Asia/Jerusalem') between 780 - 70 + 1 and 839),
  'no slot (incl. 60 min + 10 min buffer) overlaps the 13:00–14:00 break');
select pg_temp.check(
  (select min(s.starts_at at time zone 'Asia/Jerusalem')::time from available_slots('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', (select day from d)) s) = '09:00',
  'first slot is 09:00 local time');
select pg_temp.check(
  (select max(s.starts_at at time zone 'Asia/Jerusalem')::time from available_slots('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', (select day from d)) s) = '16:45',
  'last slot leaves room for service + buffer before 18:00');
do $$ begin
  perform * from customers;
  raise exception 'FAILED: anon read customers';
exception when insufficient_privilege then raise notice 'ok - anonymous visitors cannot read customers';
end $$;

-- ── Customer books online ──
reset role; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
create temp table booked as
  select book_online('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    (((select day from d) + time '10:00') at time zone 'Asia/Jerusalem'), '20000000-0000-0000-0000-000000000001', null, null, 'השראה מצורפת') as id;
select pg_temp.check((select status from appointments where id = (select id from booked)) = 'confirmed', 'auto-approved service is confirmed');
select pg_temp.check((select price from appointments where id = (select id from booked)) = 120, 'price snapshot stored');
select pg_temp.check((select c.phone from appointments a join customers c on c.id = a.customer_id where a.id = (select id from booked)) = '+972502222222', 'online customer gets the E.164 phone from the account');
do $$ begin
  perform book_online('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    (((select day from d) + time '10:30') at time zone 'Asia/Jerusalem'), '20000000-0000-0000-0000-000000000001');
  raise exception 'FAILED: overlapping online booking accepted';
exception when raise_exception then
  if sqlerrm not like '%לא פנוי%' then raise; end if;
  raise notice 'ok - overlapping online booking is refused';
end $$;
create temp table pending_b as select book_online('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
    (((select day from d) + time '15:00') at time zone 'Asia/Jerusalem')) as id;
select pg_temp.check((select status from appointments where id = (select id from pending_b)) = 'pending',
  'manual-approval service starts as pending');

-- ── Owner sees activity; database refuses overlaps even for manual inserts ──
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) from activity where kind = 'customer_registered') = 1, 'new customer appears in the activity feed');
select pg_temp.check((select count(*) from activity where kind = 'appointment_booked') = 2, 'bookings appear in the activity feed');
do $$ begin
  insert into appointments (business_id, professional_id, customer_id, starts_at, ends_at, service_name)
  select '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', c.id,
    (((select day from d) + time '10:45') at time zone 'Asia/Jerusalem'), (((select day from d) + time '11:15') at time zone 'Asia/Jerusalem'), 'ידני'
  from customers c limit 1;
  raise exception 'FAILED: overlap inserted';
exception when exclusion_violation then raise notice 'ok - exclusion constraint blocks overlapping manual appointment';
end $$;
-- buffer: 10:00–11:00 + 10 min buffer blocks 11:00, frees 11:10
do $$ begin
  insert into appointments (business_id, professional_id, customer_id, starts_at, ends_at, service_name)
  select '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', c.id,
    (((select day from d) + time '11:00') at time zone 'Asia/Jerusalem'), (((select day from d) + time '11:30') at time zone 'Asia/Jerusalem'), 'ידני'
  from customers c limit 1;
  raise exception 'FAILED: buffer ignored';
exception when exclusion_violation then raise notice 'ok - buffer after the appointment is protected';
end $$;
insert into customers (business_id, full_name, phone) values ('10000000-0000-0000-0000-000000000001', 'לקוחה טלפונית', '0541234567');

-- Owner B cannot read A's customers, and cannot attach A's customer to its own appointment
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) from customers) = 0, 'another business sees none of these customers');
select pg_temp.check((select count(*) from appointments) = 0, 'another business sees none of these appointments');
select pg_temp.check((select count(*) from activity) = 0, 'another business sees none of this activity');

reset role;
create temp table a_customer as select id from customers where business_id = '10000000-0000-0000-0000-000000000001' limit 1;
grant select on a_customer to authenticated;
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into professionals (id, business_id, name) values ('20000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-000000000002', 'ספר ב');
do $$ begin
  insert into appointments (business_id, professional_id, customer_id, starts_at, ends_at, service_name)
  values ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000b2', (select id from a_customer),
    now() + interval '5 days', now() + interval '5 days 1 hour', 'x');
  raise exception 'FAILED: foreign customer attached';
exception when insufficient_privilege then raise notice 'ok - an appointment cannot reference another business''s customer';
end $$;

-- ── Staff invite: limited to own column ──
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into business_invites (business_id, phone, professional_id) values
  ('10000000-0000-0000-0000-000000000001', '+972-52-111-1111', '20000000-0000-0000-0000-000000000002');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check(claim_invites() = 1, 'staff claims invite by phone');
select pg_temp.check((select count(*) from appointments) = 1, 'staff sees only own column (the pending colour booking)');
select pg_temp.check(not is_owner('10000000-0000-0000-0000-000000000001'), 'staff is not owner');
do $$ begin
  update services set price = 1 where id = '30000000-0000-0000-0000-000000000001';
  if found then raise exception 'FAILED: staff changed price'; end if;
  raise notice 'ok - staff cannot change prices';
end $$;

-- ── Waitlist and cancellation ──
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select join_waitlist('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', (select day from d), (select day from d), 'morning');
do $$ begin
  perform cancel_appointment((select id from booked), 'ניסיון');
  raise exception 'FAILED: stranger cancelled';
exception when insufficient_privilege then raise notice 'ok - a different customer cannot cancel';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select cancel_appointment((select id from booked), 'לא מסתדר');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select status from appointments where id = (select id from booked)) = 'cancelled', 'customer cancelled within policy');
select pg_temp.check((select status from waitlist) = 'notified', 'matching waitlist entry is notified when the slot opens');
select pg_temp.check((select count(*) from activity where kind = 'waitlist_slot_opened') = 1, 'slot-opened event in the activity feed');
select pg_temp.check((select count(*) from activity where kind = 'appointment_cancelled') = 1, 'cancellation in the activity feed');
select pg_temp.check(exists (
  select 1 from available_slots('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', (select day from d), '20000000-0000-0000-0000-000000000001')
  where starts_at = (((select day from d) + time '10:00') at time zone 'Asia/Jerusalem')), 'cancelled slot is free again');

-- ── Secrets never reach the browser ──
reset role; insert into google_connections (business_id, refresh_token) values ('10000000-0000-0000-0000-000000000001', 'secret');
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform refresh_token from google_connections;
  raise exception 'FAILED: tokens readable';
exception when insufficient_privilege then raise notice 'ok - Google tokens are not readable by users';
end $$;
select pg_temp.check((select status from google_status('10000000-0000-0000-0000-000000000001')) = 'connected', 'owner reads non-secret Google status');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check(not exists (select 1 from google_status('10000000-0000-0000-0000-000000000001')), 'other business cannot read Google status');

reset role;
\echo ALL MANAGEMENT SCHEMA TESTS PASSED
