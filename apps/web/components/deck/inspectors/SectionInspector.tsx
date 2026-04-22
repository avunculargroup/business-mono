'use client';

import { useState } from 'react';
import type { z } from 'zod';
import type { SectionContent } from '@/lib/decks/schema';
import { InspectorField, useSaveField, type InspectorBaseProps } from './shared';

interface Props extends InspectorBaseProps {
  content: z.infer<typeof SectionContent>;
}

export function SectionInspector({ content, deckId, slideId, onContentChange }: Props) {
  const save = useSaveField(deckId, slideId, onContentChange);
  const [sectionNumber, setSectionNumber] = useState(content.sectionNumber);
  const [title, setTitle] = useState(content.title);
  const [subtitle, setSubtitle] = useState(content.subtitle);

  return (
    <>
      <InspectorField label="Section number" value={sectionNumber} onChange={setSectionNumber} onBlur={() => save({ sectionNumber })} placeholder="01" />
      <InspectorField label="Title" value={title} onChange={setTitle} onBlur={() => save({ title })} placeholder="Section title..." multiline />
      <InspectorField label="Subtitle" value={subtitle} onChange={setSubtitle} onBlur={() => save({ subtitle })} placeholder="Optional subtitle..." />
    </>
  );
}
