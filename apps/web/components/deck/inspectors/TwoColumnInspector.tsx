'use client';

import { useState } from 'react';
import type { z } from 'zod';
import type { TwoColumnContent } from '@/lib/decks/schema';
import { InspectorField, useSaveField, type InspectorBaseProps } from './shared';

interface Props extends InspectorBaseProps {
  content: z.infer<typeof TwoColumnContent>;
}

export function TwoColumnInspector({ content, deckId, slideId, onContentChange }: Props) {
  const save = useSaveField(deckId, slideId, onContentChange);
  const [title, setTitle] = useState(content.title);
  const [leftHeading, setLeftHeading] = useState(content.leftHeading);
  const [leftBody, setLeftBody] = useState(content.leftBody);
  const [rightHeading, setRightHeading] = useState(content.rightHeading);
  const [rightBody, setRightBody] = useState(content.rightBody);

  return (
    <>
      <InspectorField label="Slide title" value={title} onChange={setTitle} onBlur={() => save({ title })} placeholder="Slide title..." />
      <InspectorField label="Left heading" value={leftHeading} onChange={setLeftHeading} onBlur={() => save({ leftHeading })} placeholder="Optional heading..." />
      <InspectorField label="Left body" value={leftBody} onChange={setLeftBody} onBlur={() => save({ leftBody })} placeholder="Left column content..." multiline />
      <InspectorField label="Right heading" value={rightHeading} onChange={setRightHeading} onBlur={() => save({ rightHeading })} placeholder="Optional heading..." />
      <InspectorField label="Right body" value={rightBody} onChange={setRightBody} onBlur={() => save({ rightBody })} placeholder="Right column content..." multiline />
    </>
  );
}
