'use client';

import { useActionState } from 'react';
import { createProject } from '@/app/actions/projects';
import { useToast } from '@/providers/ToastProvider';
import { useCurrentUser } from '@/providers/UserProvider';
import styles from '@/components/crm/ContactForm.module.css';

interface CreatedProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
}

interface ProjectFormProps {
  teamMembers: { id: string; full_name: string }[];
  onSuccess: (project: CreatedProject) => void;
}

export function ProjectForm({ teamMembers, onSuccess }: ProjectFormProps) {
  const user = useCurrentUser();
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = await createProject(formData);
    if ('error' in result) {
      error(result.error);
      return { error: result.error };
    }
    success('Project created');
    onSuccess(result.project as CreatedProject);
    return null;
  };

  const [state, formAction] = useActionState(handleSubmit, null);

  return (
    <form id="project-form" action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Name *</label>
        <input name="name" required className={styles.input} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Description</label>
        <textarea name="description" rows={3} className={styles.textarea} />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Priority</label>
          <select name="priority" defaultValue="medium" className={styles.select}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Owner</label>
          <select name="created_by" defaultValue={user.id} className={styles.select}>
            <option value="">None</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Target date</label>
        <input name="target_date" type="date" className={styles.input} />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
