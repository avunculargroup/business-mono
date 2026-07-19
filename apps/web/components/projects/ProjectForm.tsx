'use client';

import { createProject } from '@/app/actions/projects';
import { useCurrentUser } from '@/providers/UserProvider';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormRow, FormSelect, FormTextarea, FormError } from '@/components/ui/FormField';
import styles from '@/components/ui/Form.module.css';

interface CreatedProject {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
}

interface ProjectFormProps {
  teamMembers: { id: string; full_name: string }[];
  onSuccess: (project: CreatedProject) => void;
  onPendingChange?: (pending: boolean) => void;
}

export function ProjectForm({ teamMembers, onSuccess, onPendingChange }: ProjectFormProps) {
  const user = useCurrentUser();
  const { state, formAction } = useEntityForm({
    mode: 'create',
    entityLabel: 'Project',
    create: createProject,
    onSuccess: (result) => onSuccess(result.project as CreatedProject),
    onPendingChange,
  });

  return (
    <form id="project-form" action={formAction} className={styles.form}>
      <FormField label="Name" name="name" required />

      <FormTextarea label="Description" name="description" rows={3} />

      <FormRow>
        <FormSelect label="Priority" name="priority" defaultValue="medium">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </FormSelect>
        <FormSelect label="Owner" name="created_by" defaultValue={user.id}>
          <option value="">None</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name}</option>
          ))}
        </FormSelect>
      </FormRow>

      <FormField label="Target date" name="target_date" type="date" />

      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}
