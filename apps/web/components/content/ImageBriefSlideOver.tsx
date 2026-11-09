'use client';

import { useMemo, useState, useTransition } from 'react';
import { SlideOver } from '@platform/ui/SlideOver';
import { Button } from '@platform/ui/Button';
import { FormSelect, FormTextarea } from '@platform/ui/FormField';
import { useToast } from '@platform/ui/ToastProvider';
import {
  activeLayouts,
  buildImagePrompt,
  lintImageConcept,
  type BrandVisual,
  type ImageConcept,
} from '@platform/shared';
import { requestImageRender } from '@/app/actions/contentImages';
import styles from './ImageSlot.module.css';

interface ImageBriefSlideOverProps {
  open: boolean;
  onClose: () => void;
  onQueued: () => void;
  contentItemId: string;
  canon: BrandVisual;
  /** The concept to start from: the selected image's, or null for a blank brief. */
  initial: ImageConcept | null;
}

/**
 * Edit one image concept and render it. The new image joins the draft's
 * candidates and is selected. The assembled prompt shows beneath the fields,
 * built by the same function the agents server uses, so what is shown is
 * exactly what will be sent. Lint flags show live, before a render is paid for.
 */
export function ImageBriefSlideOver({ open, onClose, onQueued, contentItemId, canon, initial }: ImageBriefSlideOverProps) {
  const layouts = activeLayouts(canon);
  const startLayout = initial && layouts.some((l) => l.key === initial.layout) ? initial.layout : (layouts[0]?.key ?? '');
  const [tension, setTension] = useState(initial?.tension ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [symbol, setSymbol] = useState(initial?.symbol ?? '');
  const [twist, setTwist] = useState(initial?.twist ?? '');
  const [layout, setLayout] = useState(startLayout);
  const [altText, setAltText] = useState(initial?.alt_text ?? '');
  const [isPending, startTransition] = useTransition();
  const { success, error } = useToast();

  const concept: ImageConcept = {
    tension: tension.trim(),
    subject: subject.trim(),
    symbol: symbol.trim(),
    twist: twist.trim(),
    layout,
    alt_text: altText.trim(),
  };
  const flags = lintImageConcept(concept, { layouts, prohibitedTerms: canon.prohibitedTerms });

  const prompt = useMemo(() => {
    if (!canon.layouts.some((l) => l.key === layout)) return null;
    return buildImagePrompt(canon, concept, { aspectRatio: canon.defaultAspectRatio });
    // concept is rebuilt each render from the fields listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canon, layout, subject, symbol, twist]);

  const selected = layouts.find((l) => l.key === layout);

  const handleRender = () => {
    startTransition(async () => {
      const result = await requestImageRender(contentItemId, concept);
      if ('error' in result) {
        error(result.error);
        return;
      }
      success('Rendering this image. It becomes the selected image on every draft that shares it.');
      onQueued();
      onClose();
    });
  };

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Edit image brief"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleRender} loading={isPending} disabled={flags.length > 0}>
            Render with this brief
          </Button>
        </>
      }
    >
      <div className={styles.briefForm}>
        <FormTextarea
          name="tension"
          label="Tension"
          hint="The surprising, uneasy or unresolved idea in the post. Not its topic."
          rows={3}
          maxLength={200}
          value={tension}
          onChange={(e) => setTension(e.target.value)}
        />
        <FormTextarea
          name="symbol"
          label="Symbol"
          hint="An object, place or tool everyone already knows. Recognised in half a second on a phone."
          rows={2}
          maxLength={200}
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        />
        <FormTextarea
          name="twist"
          label="Twist"
          hint="One visible change that makes the symbol about this post."
          rows={2}
          maxLength={200}
          value={twist}
          onChange={(e) => setTwist(e.target.value)}
        />
        <FormTextarea
          name="subject"
          label="Subject"
          hint="One sentence: the symbol with its twist, as it will be printed. No text or figures."
          rows={2}
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <FormSelect
          name="layout"
          label="Layout"
          hint={selected?.description}
          value={layout}
          onChange={(e) => setLayout(e.target.value)}
        >
          {layouts.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </FormSelect>
        <FormTextarea
          name="alt_text"
          label="Alt text"
          hint="Describe the picture for a screen reader, not the post's argument."
          rows={3}
          maxLength={300}
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
        />

        {flags.length > 0 && (
          <ul className={styles.flags} aria-label="Change before rendering">
            {flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}

        <div className={styles.promptBlock}>
          <span className={styles.label}>Prompt sent to the image model</span>
          <pre className={styles.prompt}>{prompt ?? 'Choose a layout to see the prompt.'}</pre>
          <span className={styles.caption}>Canon v{canon.version}</span>
        </div>
      </div>
    </SlideOver>
  );
}
