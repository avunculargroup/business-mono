'use client';

import { useActionState, useEffect } from 'react';
import { createTask, updateTask } from '@/app/actions/tasks';
import { useToast } from '@platform/ui/ToastProvider';
import { useCurrentUser } from '@/providers/UserProvider';
import styles from '@/components/crm/ContactForm.module.css';

interface TaskDefaultValues {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  related_contact_id: string | null;
  assigned_to: string | null;
  priority: string;
  due_date: string | null;
  status: string;
}

interface CreatedTask {
  id: string;
  slug: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  related_contact_id: string | null;
  project_id: string | null;
  assigned_to: string | null;
}

interface TaskFormProps {
  projects: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
  contacts: { id: string; first_name: string; last_name: string }[];
  onSuccess: (task?: CreatedTask) => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: TaskDefaultValues;
}

export function TaskForm({ projects, teamMembers, contacts, onSuccess, onPendingChange, mode = 'create', defaultValues }: TaskFormProps) {
  const user = useCurrentUser();
  const { success, error } = useToast();

  const formId = mode === 'edit' ? 'task-edit-form' : 'task-form';

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    if (mode === 'edit' && defaultValues) {
      const result = await updateTask(defaultValues.id, formData);
      if ('error' in result) {
        error(result.error!);
        return { error: result.error! };
      }
      success('Task updated');
      onSuccess();
      return null;
    }

    const result = await createTask(formData);
    if ('error' in result) {
      error(result.error!);
      return { error: result.error! };
    }
    success('Task created');
    onSuccess(result.task as CreatedTask);
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Title *</span>
        <input
          name="title"
          required
          defaultValue={defaultValues?.title ?? ''}
          className={styles.input}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Description</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ''}
          className={styles.textarea}
        />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Project</span>
          <select
            name="project_id"
            defaultValue={defaultValues?.project_id ?? ''}
            className={styles.select}
          >
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Contact</span>
          <select
            name="related_contact_id"
            defaultValue={defaultValues?.related_contact_id ?? ''}
            className={styles.select}
          >
            <option value="">None</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Assigned to</span>
          <select
            name="assigned_to"
            defaultValue={defaultValues?.assigned_to ?? user.id}
            className={styles.select}
          >
            <option value="">Unassigned</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Priority</span>
          <select
            name="priority"
            defaultValue={defaultValues?.priority ?? 'medium'}
            className={styles.select}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
      </div>

      {mode === 'edit' && (
        <label className={styles.field}>
          <span className={styles.label}>Status</span>
          <select
            name="status"
            defaultValue={defaultValues?.status ?? 'todo'}
            className={styles.select}
          >
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      )}

      <label className={styles.field}>
        <span className={styles.label}>Due date</span>
        <input
          name="due_date"
          type="date"
          defaultValue={defaultValues?.due_date ?? ''}
          className={styles.input}
        />
      </label>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
