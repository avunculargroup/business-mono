-- Fix 1: Allow service_role to pass Realtime postgres_changes auth checks
--
-- Standard Supabase REST API calls bypass RLS when using the service_role key,
-- but postgres_changes Realtime subscriptions perform their own JWT-level auth
-- check via auth.role(). The original policies only allowed 'authenticated',
-- which rejected the service_role JWT — causing subscriptions to hang until
-- timeout (TIMED_OUT) and never reach SUBSCRIBED.

DROP POLICY IF EXISTS "agent_conversations_all" ON agent_conversations;
CREATE POLICY "agent_conversations_all" ON agent_conversations
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "agent_activity_all" ON agent_activity;
CREATE POLICY "agent_activity_all" ON agent_activity
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

-- Fix 2: Add created_at to v_open_tasks so agents can order by it
--
-- Simon's supabase_query tool calls v_open_tasks with orderBy: 'created_at'
-- but the view did not expose t.created_at, causing a column-not-found error.

CREATE OR REPLACE VIEW v_open_tasks AS
  SELECT
    t.id,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.due_date,
    t.reminder_at,
    t.source,
    t.parent_task_id,
    t.created_at,
    tm.full_name AS assigned_to_name,
    c.first_name || ' ' || c.last_name AS related_contact_name,
    p.name AS project_name
  FROM tasks t
  LEFT JOIN team_members tm ON tm.id = t.assigned_to
  LEFT JOIN contacts c ON c.id = t.related_contact_id
  LEFT JOIN projects p ON p.id = t.project_id
  WHERE t.status NOT IN ('done', 'cancelled');
