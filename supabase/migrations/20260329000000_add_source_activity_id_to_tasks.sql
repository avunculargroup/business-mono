-- Add source_activity_id to tasks table
-- Links a task back to the agent_activity row that triggered its creation.
-- The PM workflow passes the agent_activity.id as sourceActivityId when
-- dispatching via the pm-listener; without this column the insert fails with
-- "Could not find the 'source_activity_id' column of 'tasks' in the schema cache".

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source_activity_id UUID REFERENCES agent_activity(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_source_activity ON tasks(source_activity_id);
