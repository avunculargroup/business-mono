import { StatusChip } from '@/components/ui/StatusChip';
import { NEWS_CATEGORY_LABELS } from '@platform/shared';
import type { NewsCategory } from '@platform/shared';

const categoryColors: Record<NewsCategory, 'warning' | 'success' | 'neutral' | 'accent'> = {
  regulatory:    'warning',
  corporate:     'success',
  macro:         'neutral',
  international: 'accent',
};

interface CategoryChipProps {
  category: NewsCategory;
}

export function CategoryChip({ category }: CategoryChipProps) {
  return (
    <StatusChip
      label={NEWS_CATEGORY_LABELS[category] ?? category}
      color={categoryColors[category] ?? 'neutral'}
    />
  );
}
