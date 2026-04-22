'use client';

import { useState } from 'react';
import type { z } from 'zod';
import type { TitleContent } from '@/lib/decks/schema';
import { InspectorField, useSaveField, type InspectorBaseProps } from './shared';

interface Props extends InspectorBaseProps {
  content: z.infer<typeof TitleContent>;
}

export function TitleInspector({ content, deckId, slideId, onContentChange }: Props) {
  const save = useSaveField(deckId, slideId, onContentChange);
  const [headline, setHeadline] = useState(content.headline);
  const [subheadline, setSubheadline] = useState(content.subheadline);
  const [presenter, setPresenter] = useState(content.presenter);
  const [date, setDate] = useState(content.date);

  return (
    <>
      <InspectorField label="Headline" value={headline} onChange={setHeadline} onBlur={() => save({ headline })} placeholder="Presentation title..." multiline />
      <InspectorField label="Subheadline" value={subheadline} onChange={setSubheadline} onBlur={() => save({ subheadline })} placeholder="Optional subtitle..." />
      <InspectorField label="Presenter" value={presenter} onChange={setPresenter} onBlur={() => save({ presenter })} placeholder="Name..." />
      <InspectorField label="Date" value={date} onChange={setDate} onBlur={() => save({ date })} placeholder="e.g. April 2026" />
    </>
  );
}
