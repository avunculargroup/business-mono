'use client';

import { useActionState } from 'react';
import { createTask } from '@/app/actions/tasks';
import { useToast } from '@/providers/ToastProvider';
import { useCurrentUser } from '@/providers/UserProvider';
import styles from '@/components/crm/ContactForm.module.css';

interface TaskFormProps {
  projects: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
  contacts: { id: string; first_name: string; last_name: string }[];
  onSuccess: () => void;
}

export function TaskForm({ projects, teamMembers, contacts, onSuccess }: TaskFormProps) {
  const user = useCurrentUser();
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = await createTask(formData);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success('Task created');
    onSuccess();
    return null;
  };

  const [state, formAction] = useActionState(handleSubmit, null);

  return (
    <form id="task-form" action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Title *</label>
        <input name="title" required className={styles.input} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Description</label>
        <textarea name="description" rows={3} className={styles.textarea} />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Project</label>
          <select name="project_id" className={styles.select}>
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Contact</label>
          <select name="related_contact_id" className={styles.select}>
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
          <select name="assigned_to" defaultValue={user.id} className={styles.select}>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Priority</label>
          <select name="priority" defaultValue="medium" className={styles.select}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Due date</label>
        <input name="due_date" type="date" className={styles.input} />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
