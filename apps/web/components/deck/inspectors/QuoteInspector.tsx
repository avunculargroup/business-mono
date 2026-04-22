'use client';

import { useState } from 'react';
import type { z } from 'zod';
import type { QuoteContent } from '@/lib/decks/schema';
import { InspectorField, useSaveField, type InspectorBaseProps } from './shared';

interface Props extends InspectorBaseProps {
  content: z.infer<typeof QuoteContent>;
}

export function QuoteInspector({ content, deckId, slideId, onContentChange }: Props) {
  const save = useSaveField(deckId, slideId, onContentChange);
  const [quote, setQuote] = useState(content.quote);
  const [attribution, setAttribution] = useState(content.attribution);
  const [role, setRole] = useState(content.role);

  return (
    <>
      <InspectorField label="Quote" value={quote} onChange={setQuote} onBlur={() => save({ quote })} placeholder="The quote..." multiline />
      <InspectorField label="Attribution" value={attribution} onChange={setAttribution} onBlur={() => save({ attribution })} placeholder="Name..." />
      <InspectorField label="Role / company" value={role} onChange={setRole} onBlur={() => save({ role })} placeholder="Title, Company..." />
    </>
  );
}
