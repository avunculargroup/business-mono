import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { Plus, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import styles from './projects.module.css';

export default async function ProjectsPage() {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  const statusColors: Record<string, 'accent' | 'success' | 'warning' | 'neutral'> = {
    active: 'accent',
    completed: 'success',
    on_hold: 'warning',
    archived: 'neutral',
  };

  return (
    <>
      <PageHeader title="Projects">
        <Button variant="primary" size="sm">
          <Plus size={16} strokeWidth={1.5} />
          New project
        </Button>
      </PageHeader>
      <div className={styles.container}>
        {projects && projects.length > 0 ? (
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
          </div>
        )}
      </div>
    </>
  );
}
