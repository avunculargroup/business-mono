'use client';

import { useState } from 'react';
import type { z } from 'zod';
import type { ClosingContent } from '@/lib/decks/schema';
import { InspectorField, useSaveField, type InspectorBaseProps } from './shared';

interface Props extends InspectorBaseProps {
  content: z.infer<typeof ClosingContent>;
}

export function ClosingInspector({ content, deckId, slideId, onContentChange }: Props) {
  const save = useSaveField(deckId, slideId, onContentChange);
  const [headline, setHeadline] = useState(content.headline);
  const [subheadline, setSubheadline] = useState(content.subheadline);
  const [cta, setCta] = useState(content.cta);
  const [contactEmail, setContactEmail] = useState(content.contactEmail);
  const [contactPhone, setContactPhone] = useState(content.contactPhone);

  return (
    <>
      <InspectorField label="Headline" value={headline} onChange={setHeadline} onBlur={() => save({ headline })} placeholder="Thank You..." multiline />
      <InspectorField label="Subheadline" value={subheadline} onChange={setSubheadline} onBlur={() => save({ subheadline })} placeholder="Optional message..." />
      <InspectorField label="Call to action" value={cta} onChange={setCta} onBlur={() => save({ cta })} placeholder="Book a call..." />
      <InspectorField label="Contact email" value={contactEmail} onChange={setContactEmail} onBlur={() => save({ contactEmail })} placeholder="hello@company.com" />
      <InspectorField label="Contact phone" value={contactPhone} onChange={setContactPhone} onBlur={() => save({ contactPhone })} placeholder="+61 4xx xxx xxx" />
    </>
  );
}
