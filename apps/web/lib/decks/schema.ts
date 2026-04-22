import { z } from 'zod';

// ──────────────────────────────────────────────────────────
// Shared field schemas
// ──────────────────────────────────────────────────────────

const richText = z.string().default('');

const agendaItem = z.object({
  label: z.string(),
  duration: z.string().optional(),
});

const kpiMetric = z.object({
  label: z.string(),
  value: z.string(),
  change: z.string().optional(),
  changePositive: z.boolean().optional(),
});

// ──────────────────────────────────────────────────────────
// Per-template content schemas
// ──────────────────────────────────────────────────────────

export const TitleContent = z.object({
  headline: richText,
  subheadline: z.string().default(''),
  presenter: z.string().default(''),
  date: z.string().default(''),
  logoAssetId: z.string().uuid().nullable().default(null),
});

export const SectionContent = z.object({
  sectionNumber: z.string().default(''),
  title: richText,
  subtitle: z.string().default(''),
});

export const AgendaContent = z.object({
  title: z.string().default('Agenda'),
  items: z.array(agendaItem).default([]),
});

export const TwoColumnContent = z.object({
  title: richText,
  leftHeading: z.string().default(''),
  leftBody: richText,
  rightHeading: z.string().default(''),
  rightBody: richText,
});

export const ImageCaptionContent = z.object({
  title: richText,
  assetId: z.string().uuid().nullable().default(null),
  focalPointX: z.number().min(0).max(100).default(50),
  focalPointY: z.number().min(0).max(100).default(50),
  caption: z.string().default(''),
  captionPosition: z.enum(['below', 'overlay']).default('below'),
});

export const KpiGridContent = z.object({
  title: richText,
  metrics: z.array(kpiMetric).default([]),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
});

export const QuoteContent = z.object({
  quote: richText,
  attribution: z.string().default(''),
  role: z.string().default(''),
});

export const ClosingContent = z.object({
  headline: richText,
  subheadline: z.string().default(''),
  cta: z.string().default(''),
  contactEmail: z.string().default(''),
  contactPhone: z.string().default(''),
  logoAssetId: z.string().uuid().nullable().default(null),
});

// ──────────────────────────────────────────────────────────
// Discriminated union for a slide
// ──────────────────────────────────────────────────────────

export const SlideSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('title'), content: TitleContent }),
  z.object({ type: z.literal('section'), content: SectionContent }),
  z.object({ type: z.literal('agenda'), content: AgendaContent }),
  z.object({ type: z.literal('two_column'), content: TwoColumnContent }),
  z.object({ type: z.literal('image_caption'), content: ImageCaptionContent }),
  z.object({ type: z.literal('kpi_grid'), content: KpiGridContent }),
  z.object({ type: z.literal('quote'), content: QuoteContent }),
  z.object({ type: z.literal('closing'), content: ClosingContent }),
]);

export type Slide =
  | { type: 'title'; content: z.infer<typeof TitleContent> }
  | { type: 'section'; content: z.infer<typeof SectionContent> }
  | { type: 'agenda'; content: z.infer<typeof AgendaContent> }
  | { type: 'two_column'; content: z.infer<typeof TwoColumnContent> }
  | { type: 'image_caption'; content: z.infer<typeof ImageCaptionContent> }
  | { type: 'kpi_grid'; content: z.infer<typeof KpiGridContent> }
  | { type: 'quote'; content: z.infer<typeof QuoteContent> }
  | { type: 'closing'; content: z.infer<typeof ClosingContent> };

// ──────────────────────────────────────────────────────────
// DB row shape (as stored / returned from Supabase)
// ──────────────────────────────────────────────────────────

export interface DeckSlideRow {
  id: string;
  deck_id: string;
  type: string;
  order_index: number;
  content_json: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeckRow {
  id: string;
  org_id: string;
  title: string;
  theme_id: string;
  status: string;
  aspect_ratio: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetRow {
  id: string;
  org_id: string;
  uploaded_by: string | null;
  bucket: string;
  path: string;
  filename: string;
  mime_type: string;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  created_at: string;
}

// ──────────────────────────────────────────────────────────
// Helper: parse a DB row's content_json into a typed Slide
// ──────────────────────────────────────────────────────────

export function parseSlideContent(row: DeckSlideRow): Slide {
  const result = SlideSchema.safeParse({
    type: row.type,
    content: row.content_json,
  });
  if (result.success) return result.data as Slide;
  // Fall back to empty defaults for the given type so the UI never crashes
  return getDefaultSlideContent(row.type as Slide['type']);
}

export function getDefaultSlideContent(type: Slide['type']): Slide {
  switch (type) {
    case 'title':        return { type, content: TitleContent.parse({}) };
    case 'section':      return { type, content: SectionContent.parse({}) };
    case 'agenda':       return { type, content: AgendaContent.parse({}) };
    case 'two_column':   return { type, content: TwoColumnContent.parse({}) };
    case 'image_caption':return { type, content: ImageCaptionContent.parse({}) };
    case 'kpi_grid':     return { type, content: KpiGridContent.parse({}) };
    case 'quote':        return { type, content: QuoteContent.parse({}) };
    case 'closing':      return { type, content: ClosingContent.parse({}) };
  }
}
