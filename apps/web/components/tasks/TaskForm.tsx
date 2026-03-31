'use client';

import { useActionState } from 'react';
import { createTask, updateTask } from '@/app/actions/tasks';
import { useToast } from '@/providers/ToastProvider';
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
  mode?: 'create' | 'edit';
  defaultValues?: TaskDefaultValues;
}

export function TaskForm({ projects, teamMembers, contacts, onSuccess, mode = 'create', defaultValues }: TaskFormProps) {
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

  const [state, formAction] = useActionState(handleSubmit, null);

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Title *</label>
        <input
          name="title"
          required
          defaultValue={defaultValues?.title ?? ''}
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ''}
          className={styles.textarea}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Project</label>
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
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Contact</label>
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
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Assigned to</label>
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
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Priority</label>
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
        </div>
      </div>

      {mode === 'edit' && (
        <div className={styles.field}>
          <label className={styles.label}>Status</label>
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
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label}>Due date</label>
        <input
          name="due_date"
          type="date"
          defaultValue={defaultValues?.due_date ?? ''}
          className={styles.input}
        />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
