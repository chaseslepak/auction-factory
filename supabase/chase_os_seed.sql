-- Chase OS seed data
-- Run AFTER chase_os_init.sql AND AFTER scripts/chase-seed-users.ts has created
-- the four auth.users with the fixed UUIDs below.
-- Idempotent: safe to re-run.

-- Profile UUIDs (must match scripts/chase-seed-users.ts)
-- chase   = 11111111-1111-1111-1111-111111111111  (owner)
-- admin   = 22222222-2222-2222-2222-222222222222  (admin)
-- tm      = 33333333-3333-3333-3333-333333333333  (team_member)
-- client  = 44444444-4444-4444-4444-444444444444  (client)

-- ============================================================================
-- Roles (the auto-trigger inserts profiles with default 'client'; promote here)
-- ============================================================================
update profiles set role = 'owner',       display_name = 'Chase'      where id = '11111111-1111-1111-1111-111111111111';
update profiles set role = 'admin',       display_name = 'Avery (Admin)' where id = '22222222-2222-2222-2222-222222222222';
update profiles set role = 'team_member', display_name = 'Taylor (TM)'   where id = '33333333-3333-3333-3333-333333333333';
update profiles set role = 'client',      display_name = 'Jordan (Acme)' where id = '44444444-4444-4444-4444-444444444444';

-- ============================================================================
-- Companies
-- ============================================================================
insert into companies (id, name, domain, industry, status, notes, owner_id) values
  ('aaaaaaa1-0000-0000-0000-000000000001', 'Acme Holdings',     'acme.com',     'Holding Co',   'active',  'Primary client. Quarterly board meeting.', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaa1-0000-0000-0000-000000000002', 'Northwind Capital', 'northwind.vc', 'Venture',      'active',  'Active term sheet under negotiation.',     '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaa1-0000-0000-0000-000000000003', 'Stellar Robotics',  'stellar.tech', 'Robotics',     'active',  'Bridge round in progress.',                '22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

-- ============================================================================
-- People
-- ============================================================================
insert into people (id, full_name, email, phone, role_title, company_id, owner_id) values
  ('bbbbbbb1-0000-0000-0000-000000000001', 'Jordan Rivera',  'jordan@acme.com',     '+1-415-555-0101', 'CFO',           'aaaaaaa1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbb1-0000-0000-0000-000000000002', 'Morgan Lee',     'morgan@acme.com',     '+1-415-555-0102', 'COO',           'aaaaaaa1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbb1-0000-0000-0000-000000000003', 'Sam Patel',      'sam@northwind.vc',    '+1-212-555-0201', 'Partner',       'aaaaaaa1-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbb1-0000-0000-0000-000000000004', 'Riley Chen',     'riley@northwind.vc',  '+1-212-555-0202', 'Principal',     'aaaaaaa1-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222'),
  ('bbbbbbb1-0000-0000-0000-000000000005', 'Devon Park',     'devon@stellar.tech',  '+1-650-555-0301', 'CEO',           'aaaaaaa1-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222'),
  ('bbbbbbb1-0000-0000-0000-000000000006', 'Casey Brooks',   'casey@stellar.tech',  '+1-650-555-0302', 'Head of Ops',   'aaaaaaa1-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333')
on conflict (id) do nothing;

-- ============================================================================
-- Tasks (12 across statuses/priorities/urgencies)
-- ============================================================================
insert into tasks (id, title, description, company_id, submitted_by, assigned_to, priority, urgency, due_date, status, what_is_needed_from_chase, client_visible) values
  ('ccccccc1-0000-0000-0000-000000000001', 'Review Q2 board deck',
    'Acme Q2 board deck draft attached. Need final read for tone and numbers before Thursday.',
    'aaaaaaa1-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
    'high', 'today', now() + interval '6 hours', 'in_progress',
    'Final pass + sign-off; flag any sections to redo.', false),

  ('ccccccc1-0000-0000-0000-000000000002', 'Approve Stellar wire transfer',
    '$250k bridge tranche to Stellar. Wire instructions verified. Awaiting Chase approval.',
    'aaaaaaa1-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
    'critical', 'now', now() + interval '2 hours', 'triaged',
    'Verbal approval + sign DocuSign envelope.', false),

  ('ccccccc1-0000-0000-0000-000000000003', 'Draft response to Northwind term sheet',
    'Initial term sheet from Northwind has tighter liquidation pref than expected. Need counter.',
    'aaaaaaa1-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
    'high', 'this_week', now() + interval '3 days', 'in_progress',
    'Strategy call + redline preference language.', false),

  ('ccccccc1-0000-0000-0000-000000000004', 'Sign 1099-NEC batch',
    '17 contractor 1099s ready for signature in DocuSign.',
    null, '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
    'normal', 'this_week', now() + interval '4 days', 'inbox',
    'Sign envelope.', false),

  ('ccccccc1-0000-0000-0000-000000000005', 'Investor update — March',
    'Monthly investor letter draft ready for review.',
    null, '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
    'normal', 'this_week', now() + interval '5 days', 'in_progress',
    'Add personal note + approve send.', false),

  ('ccccccc1-0000-0000-0000-000000000006', 'Acme: revise SOW for Q3 retainer',
    'Acme wants to expand engagement scope. SOW v2 attached.',
    'aaaaaaa1-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333',
    'normal', 'this_week', now() + interval '7 days', 'inbox',
    'Confirm scope + countersign.', true),

  ('ccccccc1-0000-0000-0000-000000000007', 'Schedule annual physical',
    'Dr. Mendez office requested rescheduling. Open windows in calendar.',
    null, '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
    'low', 'whenever', now() + interval '14 days', 'inbox',
    'Pick a slot, book it.', false),

  ('ccccccc1-0000-0000-0000-000000000008', 'Decide: hire VP Eng candidate',
    'Final-round candidate (Avery K.) — references back, comp package modeled.',
    null, '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
    'high', 'this_week', now() + interval '2 days', 'blocked',
    'Yes/no decision + offer terms.', false),

  ('ccccccc1-0000-0000-0000-000000000009', 'File state tax extension',
    'CA extension form ready. Needs signature.',
    null, '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
    'high', 'today', now() + interval '8 hours', 'triaged',
    'Sign and submit.', false),

  ('ccccccc1-0000-0000-0000-000000000010', 'Reply to Stellar founder re: bridge timing',
    'Devon emailed asking when wire will land. Drafted response.',
    'aaaaaaa1-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
    'normal', 'today', now() + interval '4 hours', 'done',
    'Approve and send.', false),

  ('ccccccc1-0000-0000-0000-000000000011', 'Annual D&O insurance renewal',
    'Quotes received from 3 carriers. Spreadsheet attached.',
    null, '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
    'normal', 'this_week', now() + interval '10 days', 'done',
    'Pick carrier, sign binder.', false),

  ('ccccccc1-0000-0000-0000-000000000012', 'Old: travel reimbursement Q1',
    'Q1 travel reimb closed and processed.',
    null, '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
    'low', 'whenever', now() - interval '60 days', 'archived',
    'Closed.', false)
on conflict (id) do nothing;

-- ============================================================================
-- Task comments
-- ============================================================================
insert into task_comments (id, task_id, author_id, body) values
  ('ddddddd1-0000-0000-0000-000000000001', 'ccccccc1-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Slide 12 (forecast) needs Q3 update. Will replace before send.'),
  ('ddddddd1-0000-0000-0000-000000000002', 'ccccccc1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Tighten exec summary to half a page.'),
  ('ddddddd1-0000-0000-0000-000000000003', 'ccccccc1-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'Counter: 1x non-participating, no double dip on liquidation.'),
  ('ddddddd1-0000-0000-0000-000000000004', 'ccccccc1-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', 'Blocked on final ref check (1 still pending).')
on conflict (id) do nothing;

-- ============================================================================
-- Task attachments (placeholder paths)
-- ============================================================================
insert into task_attachments (id, task_id, uploaded_by, storage_path, filename, size_bytes, mime_type) values
  ('eeeeeee1-0000-0000-0000-000000000001', 'ccccccc1-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'tasks/ccccccc1.../q2-board-deck.pdf', 'q2-board-deck.pdf', 4231411, 'application/pdf'),
  ('eeeeeee1-0000-0000-0000-000000000002', 'ccccccc1-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'tasks/ccccccc3.../northwind-termsheet.pdf', 'northwind-termsheet.pdf', 1124002, 'application/pdf')
on conflict (id) do nothing;

-- ============================================================================
-- Decisions
-- ============================================================================
insert into decisions (id, title, context, options, recommendation, status, decided_by, company_id, client_visible, due_date) values
  ('fffffff1-0000-0000-0000-000000000001',
    'Approve $250k bridge to Stellar',
    'Stellar needs $250k bridge to extend runway 4 months until Series B close. Lead committed.',
    '[{"option":"Approve full $250k","pros":["Maintains pro-rata","Founder relationship"],"cons":["Concentration risk"]},{"option":"Approve $125k","pros":["Lower exposure"],"cons":["Founder may seek elsewhere"]},{"option":"Decline","pros":["Conserve capital"],"cons":["Lose option"]}]'::jsonb,
    'Approve full $250k contingent on lead writing the same on standard terms.',
    'pending', '11111111-1111-1111-1111-111111111111', 'aaaaaaa1-0000-0000-0000-000000000003', false, now() + interval '1 day'),

  ('fffffff1-0000-0000-0000-000000000002',
    'Hire VP Engineering — Avery K.',
    'Avery K. is the final candidate. Refs strong. Comp ask $290k base + 1.2% equity over 4yr.',
    '[{"option":"Offer at ask","pros":["Lock in fast"]},{"option":"Counter at $275k + 1.0%","pros":["Saves 50bps"],"cons":["May lose"]},{"option":"Pass"}]'::jsonb,
    'Counter at $280k + 1.1%; if no, take ask.',
    'pending', '11111111-1111-1111-1111-111111111111', null, false, now() + interval '3 days')
on conflict (id) do nothing;

-- ============================================================================
-- Deals
-- ============================================================================
insert into deals (id, company_id, name, value_cents, stage, probability, expected_close_date, owner_id, notes) values
  ('1deeeee1-0000-0000-0000-000000000001', 'aaaaaaa1-0000-0000-0000-000000000001', 'Acme retainer expansion', 18000000, 'negotiation', 70, current_date + 14, '11111111-1111-1111-1111-111111111111', 'SOW v2 in flight; awaiting countersign.')
on conflict (id) do nothing;

-- ============================================================================
-- Command queue
-- ============================================================================
insert into command_queue_items (id, title, body, source_type, source_id, status, assigned_to, snooze_until) values
  ('1ccccccc-0000-0000-0000-000000000001', 'Sign Stellar wire ($250k)',         'Critical — wire window closes 4pm.',                'task',     'ccccccc1-0000-0000-0000-000000000002', 'pending', '11111111-1111-1111-1111-111111111111', null),
  ('1ccccccc-0000-0000-0000-000000000002', 'Decision: $250k bridge to Stellar', 'Three options. Recommendation drafted.',            'decision', 'fffffff1-0000-0000-0000-000000000001', 'pending', '11111111-1111-1111-1111-111111111111', null),
  ('1ccccccc-0000-0000-0000-000000000003', 'Final read: Q2 board deck',         'Acme board meets Thursday. Deck attached.',         'task',     'ccccccc1-0000-0000-0000-000000000001', 'pending', '11111111-1111-1111-1111-111111111111', null),
  ('1ccccccc-0000-0000-0000-000000000004', 'Sign CA tax extension',             'One-page form. 5 minutes.',                         'task',     'ccccccc1-0000-0000-0000-000000000009', 'pending', '11111111-1111-1111-1111-111111111111', null),
  ('1ccccccc-0000-0000-0000-000000000005', 'Pick carrier for D&O renewal',      'Snoozed until tomorrow morning.',                   'task',     'ccccccc1-0000-0000-0000-000000000011', 'snoozed', '11111111-1111-1111-1111-111111111111', now() + interval '20 hours')
on conflict (id) do nothing;

-- ============================================================================
-- Activity log
-- ============================================================================
insert into activity_log (id, actor_id, action, entity_type, entity_id, metadata) values
  ('1aaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'task.created',  'task',     'ccccccc1-0000-0000-0000-000000000001', '{"title":"Review Q2 board deck"}'::jsonb),
  ('1aaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'task.assigned', 'task',     'ccccccc1-0000-0000-0000-000000000002', '{"to":"chase"}'::jsonb),
  ('1aaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'decision.opened','decision','fffffff1-0000-0000-0000-000000000001', '{}'::jsonb),
  ('1aaaaaaa-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'task.commented','task',     'ccccccc1-0000-0000-0000-000000000003', '{}'::jsonb),
  ('1aaaaaaa-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 'task.completed','task',     'ccccccc1-0000-0000-0000-000000000010', '{}'::jsonb),
  ('1aaaaaaa-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'queue.snoozed', 'queue',    '1ccccccc-0000-0000-0000-000000000005', '{"until":"tomorrow"}'::jsonb)
on conflict (id) do nothing;

-- ============================================================================
-- Mark sample tasks completed_at
-- ============================================================================
update tasks set completed_at = now() - interval '1 day'
  where id in ('ccccccc1-0000-0000-0000-000000000010','ccccccc1-0000-0000-0000-000000000011','ccccccc1-0000-0000-0000-000000000012')
  and completed_at is null;

-- ============================================================================
-- Client portal invite (so the client user can see Acme)
-- ============================================================================
insert into client_portal_invites (id, email, company_id, invited_by, token, accepted_at) values
  ('11111111-aaaa-0000-0000-000000000001', 'jordan@acme.com', 'aaaaaaa1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'seed-token-jordan-acme', now())
on conflict (id) do nothing;
