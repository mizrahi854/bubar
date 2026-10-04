-- Messages and customer card checks (runs after management_test.sql on the same database).
\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false); end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

insert into auth.users (id, phone, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000f1', '972509999999', '{"full_name":"נוי חדשה"}');

set role authenticated;
-- A brand-new customer writes to the business from its page
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
create temp table conv as select start_conversation('10000000-0000-0000-0000-000000000001') as id;
select pg_temp.check((select count(*) from conversations) = 1, 'customer opens a conversation (customer card created)');
insert into messages (conversation_id, business_id, sender, sender_user, body)
  values ((select id from conv), '10000000-0000-0000-0000-000000000001', 'customer', '00000000-0000-0000-0000-0000000000f1', 'היי, יש מקום מחר?');
do $$ begin
  insert into messages (conversation_id, business_id, sender, sender_user, body)
    values ((select id from conv), '10000000-0000-0000-0000-000000000001', 'business', '00000000-0000-0000-0000-0000000000f1', 'מתחזה לעסק');
  raise exception 'FAILED: customer wrote as business';
exception when insufficient_privilege then raise notice 'ok - a customer cannot write as the business';
end $$;
select pg_temp.check(start_conversation('10000000-0000-0000-0000-000000000001') = (select id from conv), 'the same conversation is reused');

-- The owner sees it, it is unread, and appears in the activity feed
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select last_message from conversations where id = (select id from conv)) = 'היי, יש מקום מחר?', 'conversation summary updated');
select pg_temp.check((select business_read_at is null and last_sender = 'customer' from conversations where id = (select id from conv)), 'unread for the business');
select pg_temp.check(exists (select 1 from activity where kind = 'message' and body like 'נוי חדשה:%'), 'customer message in the activity feed');
insert into messages (conversation_id, business_id, sender, sender_user, body)
  values ((select id from conv), '10000000-0000-0000-0000-000000000001', 'business', '00000000-0000-0000-0000-0000000000a1', 'כן! ב־10:00');
select pg_temp.check((select business_read_at is not null from conversations where id = (select id from conv)), 'replying marks it read for the business');

-- Staff of the business can read; other businesses and other customers cannot
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select count(*) from messages where conversation_id = (select id from conv)) = 2, 'staff read the business inbox');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) from messages) = 0 and (select count(*) from conversations) = 0, 'another business reads nothing');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((select count(*) from messages where conversation_id = (select id from conv)) = 0, 'another customer reads nothing');

-- Extended card and photos
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
update customers set tags = '{VIP,צבע}', birthday = '1994-03-12', preferences = 'גוון 7.1, רגישות לאמוניה'
  where user_id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.check((select 'VIP' = any(tags) from customers where user_id = '00000000-0000-0000-0000-0000000000f1'), 'tags saved on the customer card');
insert into customer_photos (business_id, customer_id, path, kind)
  select business_id, id, business_id || '/' || id || '/a.jpg', 'before' from customers where user_id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) from customer_photos) = 0, 'photos are private to the business');
reset role;
\echo ALL MESSAGES TESTS PASSED
