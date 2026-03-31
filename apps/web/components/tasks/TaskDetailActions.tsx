'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { TaskForm } from './TaskForm';
import { Pencil } from 'lucide-react';

interface TaskDetailActionsProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    project_id: string | null;
    related_contact_id: string | null;
    assigned_to: string | null;
    priority: string;
    due_date: string | null;
    status: string;
  };
  projects: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
  contacts: { id: string; first_name: string; last_name: string }[];
}

export function TaskDetailActions({ task, projects, teamMembers, contacts }: TaskDetailActionsProps) {
  const [showEdit, setShowEdit] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
        <Pencil size={14} strokeWidth={1.5} />
        Edit
      </Button>

      <SlideOver
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit task"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="task-edit-form">Save changes</Button>
          </>
        }
      >
        <TaskForm
          mode="edit"
          defaultValues={task}
          projects={projects}
          teamMembers={teamMembers}
          contacts={contacts}
          onSuccess={() => {
            setShowEdit(false);
            router.refresh();
          }}
        />
      </SlideOver>
    </>
  );
}
