'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ProjectForm } from './ProjectForm';
import { formatDate } from '@/lib/utils';
import { Plus, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import styles from '@/app/(app)/projects/projects.module.css';

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
};

interface ProjectsViewProps {
  projects: ProjectRow[];
  teamMembers: { id: string; full_name: string }[];
}

const statusColors: Record<string, 'accent' | 'success' | 'warning' | 'neutral'> = {
  active: 'accent',
  completed: 'success',
  on_hold: 'warning',
  archived: 'neutral',
};

export function ProjectsView({ projects, teamMembers }: ProjectsViewProps) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--space-4) var(--space-6) 0' }}>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          New project
        </Button>
      </div>
      <div className={styles.container}>
        {projects.length > 0 ? (
          <div className={styles.grid}>
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className={styles.cardLink}>
                <Card hoverable padding="md">
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>{project.name}</h3>
                    <StatusChip
                      label={project.status.replace('_', ' ')}
                      color={statusColors[project.status] || 'neutral'}
                    />
                  </div>
                  {project.description && (
                    <p className={styles.description}>{project.description}</p>
                  )}
                  <div className={styles.cardMeta}>
                    <span>{formatDate(project.created_at)}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <FolderOpen size={48} strokeWidth={1} />
            <h3>No projects yet</h3>
            <p>Create a project to organise related tasks.</p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>New project</Button>
          </div>
        )}
      </div>

      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New project"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="project-form">Save project</Button>
          </>
        }
      >
        <ProjectForm
          teamMembers={teamMembers}
          onSuccess={() => setShowCreate(false)}
        />
      </SlideOver>
    </>
  );
}
