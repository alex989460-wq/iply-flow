CREATE TABLE public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'media',
  due_at timestamptz,
  remind_at timestamptz,
  remind_before_minutes integer not null default 0,
  notify_whatsapp boolean not null default false,
  notify_push boolean not null default true,
  notify_phone text,
  recurrence text not null default 'none',
  tags text[] not null default '{}',
  color text,
  checklist jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  completed_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select_own" ON public.tasks FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "tasks_insert_own" ON public.tasks FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "tasks_update_own" ON public.tasks FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "tasks_delete_own" ON public.tasks FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE INDEX tasks_owner_idx ON public.tasks(owner_id, status);
CREATE INDEX tasks_remind_idx ON public.tasks(remind_at) WHERE remind_at IS NOT NULL;

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();