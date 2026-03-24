'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ContactForm } from '@/components/crm/ContactForm';
import { TaskForm } from '@/components/tasks/TaskForm';
import { ContentForm } from '@/components/content/ContentForm';

type Modal = 'contact' | 'task' | 'content' | null;

interface QuickAddProps {
  companies: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
  projects: { id: string; name: string }[];
  contacts: { id: string; first_name: string; last_name: string }[];
}

export function QuickAdd({ companies, teamMembers, projects, contacts }: QuickAddProps) {
  const [open, setOpen] = useState<Modal>(null);
  const router = useRouter();

  const close = () => setOpen(null);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen('contact')}>+ Contact</Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen('task')}>+ Task</Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen('content')}>+ Content idea</Button>
      <Button variant="ghost" size="sm" onClick={() => router.push('/simon')}>+ Note</Button>

      <SlideOver
        open={open === 'contact'}
        onClose={close}
        title="New contact"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button variant="primary" type="submit" form="contact-form">Save contact</Button>
          </>
        }
      >
        <ContactForm companies={companies} teamMembers={teamMembers} onSuccess={close} />
      </SlideOver>

      <SlideOver
        open={open === 'task'}
        onClose={close}
        title="Add task"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button variant="primary" type="submit" form="task-form">Save task</Button>
          </>
        }
      >
        <TaskForm projects={projects} teamMembers={teamMembers} contacts={contacts} onSuccess={close} />
      </SlideOver>

      <SlideOver
        open={open === 'content'}
        onClose={close}
        title="New content idea"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button variant="primary" type="submit" form="content-form">Save</Button>
          </>
        }
      >
        <ContentForm teamMembers={teamMembers} onSuccess={close} />
      </SlideOver>
    </>
  );
}
