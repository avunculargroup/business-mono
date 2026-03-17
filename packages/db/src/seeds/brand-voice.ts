import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

/**
 * Seed brand_assets from docs/brand-voice.md
 *
 * Parses the markdown into logical sections and upserts each as a
 * brand_assets record. The markdown file is the source of truth —
 * run this script whenever it changes to keep the database in sync.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx packages/db/src/seeds/brand-voice.ts
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const brandVoicePath = resolve(__dirname, '../../../../docs/brand-voice.md');
const markdown = readFileSync(brandVoicePath, 'utf-8');

// --- Parse markdown into sections by top-level headings (## ) ---

interface BrandSection {
  name: string;
  type: 'tone_of_voice' | 'style_guide' | 'other';
  content: string;
}

const SECTION_TYPE_MAP: Record<string, BrandSection['type']> = {
  'Company Identity': 'other',
  'Target Audience (Phased)': 'other',
  'Tone of Voice': 'tone_of_voice',
  'Content Style Rules': 'style_guide',
  'Required Terminology': 'style_guide',
  'Banned Terminology': 'style_guide',
  'Bitcoin Stance & Key Arguments': 'tone_of_voice',
  'Visual Identity': 'other',
  'Director Profiles': 'other',
  'Voice Calibration Sample': 'tone_of_voice',
};

function parseSections(md: string): BrandSection[] {
  const lines = md.split('\n');
  const sections: BrandSection[] = [];
  let currentHeading = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^## (.+)$/);
    if (match) {
      if (currentHeading && currentLines.length > 0) {
        sections.push({
          name: currentHeading,
          type: SECTION_TYPE_MAP[currentHeading] ?? 'other',
          content: currentLines.join('\n').trim(),
        });
      }
      currentHeading = match[1]!.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Push the last section
  if (currentHeading && currentLines.length > 0) {
    sections.push({
      name: currentHeading,
      type: SECTION_TYPE_MAP[currentHeading] ?? 'other',
      content: currentLines.join('\n').trim(),
    });
  }

  return sections;
}

// --- Also insert the full document as a single record ---

async function seed() {
  const supabaseUrl = process.env['SUPABASE_URL'];
  const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sections = parseSections(markdown);

  // Full document record
  const allRecords = [
    {
      name: 'Brand Voice — Complete',
      type: 'tone_of_voice' as const,
      content: markdown,
      is_active: true,
    },
    ...sections.map((s) => ({
      name: `Brand Voice — ${s.name}`,
      type: s.type,
      content: s.content,
      is_active: true,
    })),
  ];

  console.log(`Parsed ${sections.length} sections from brand-voice.md`);

  for (const record of allRecords) {
    // Upsert by name: deactivate any existing record with same name, then insert
    const { error: deactivateError } = await supabase
      .from('brand_assets')
      .update({ is_active: false })
      .eq('name', record.name)
      .eq('is_active', true);

    if (deactivateError) {
      console.error(`  Warning: failed to deactivate old "${record.name}": ${deactivateError.message}`);
    }

    const { error: insertError } = await supabase
      .from('brand_assets')
      .insert(record);

    if (insertError) {
      console.error(`  Error inserting "${record.name}": ${insertError.message}`);
    } else {
      console.log(`  ✓ ${record.name} (${record.type})`);
    }
  }

  console.log('Done.');
}

seed();
