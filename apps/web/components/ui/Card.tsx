import styles from './Card.module.css';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
  padding?: 'sm' | 'md' | 'lg';
}

export function Card({ children, className, hoverable, padding = 'md' }: CardProps) {
  return (
    <div className={cn(styles.card, styles[padding], hoverable && styles.hoverable, className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(styles.header, className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(styles.body, className)}>{children}</div>;
}
