'use client';

import { useMemo, useState, useTransition } from 'react';
import { SlideOver } from '@platform/ui/SlideOver';
import { Button } from '@platform/ui/Button';
import { FormSelect, FormTextarea } from '@platform/ui/FormField';
import { useToast } from '@platform/ui/ToastProvider';
import { activeMotifs, buildImagePrompt, lintImageBrief, type BrandVisual, type ImageBrief } from '@platform/shared';
import { requestImageRender } from '@/app/actions/contentImages';
import styles from './ImageSlot.module.css';

interface ImageBriefSlideOverProps {
  open: boolean;
  onClose: () => void;
  onQueued: () => void;
  contentItemId: string;
  canon: BrandVisual;
  initial: ImageBrief | null;
}

/**
 * Edit an image's brief and render it. The assembled prompt shows beneath the
 * fields, built by the same function the agents server uses, so what is shown
 * is exactly what will be sent. Lint flags show live, before a render is paid for.
 */
export function ImageBriefSlideOver({ open, onClose, onQueued, contentItemId, canon, initial }: ImageBriefSlideOverProps) {
  const motifs = activeMotifs(canon);
  const [motifKey, setMotifKey] = useState(initial?.motif_key ?? motifs[0]?.key ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [metaphor, setMetaphor] = useState(initial?.metaphor ?? '');
  const [composition, setComposition] = useState(initial?.composition ?? '');
  const [altText, setAltText] = useState(initial?.alt_text ?? '');
  const [isPending, startTransition] = useTransition();
  const { success, error } = useToast();

  const brief: ImageBrief = {
    skip: false,
    skip_reason: null,
    motif_key: motifKey || null,
    subject: subject.trim() || null,
    metaphor: metaphor.trim() || null,
    composition: composition.trim() || null,
    alt_text: altText.trim() || null,
  };
  const flags = lintImageBrief(brief, { motifs: canon.motifs, prohibitedTerms: canon.prohibitedTerms });

  const prompt = useMemo(() => {
    if (!canon.motifs.some((m) => m.key === motifKey)) return null;
    return buildImagePrompt(canon, brief, { aspectRatio: canon.defaultAspectRatio });
    // brief is rebuilt each render from the fields listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canon, motifKey, subject, metaphor, composition, altText]);

  const selected = canon.motifs.find((m) => m.key === motifKey);

  const handleRender = () => {
    startTransition(async () => {
      const result = await requestImageRender(contentItemId, {
        motif_key: motifKey,
        subject,
        metaphor,
        composition,
        alt_text: altText,
      });
      if ('error' in result) {
        error(result.error);
        return;
      }
      success('Rendering a new image. It replaces the current one on every draft that shares it.');
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
        <FormSelect
          name="motif_key"
          label="Motif"
          hint={selected ? `${selected.description}. Use when: ${selected.use_when}` : undefined}
          value={motifKey}
          onChange={(e) => setMotifKey(e.target.value)}
        >
          {motifs.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </FormSelect>
        <FormTextarea
          name="subject"
          label="Subject"
          hint="What is drawn, concretely. Objects and places, no text or figures."
          rows={2}
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <FormTextarea
          name="metaphor"
          label="Metaphor"
          hint="How the motif carries the post's idea."
          rows={2}
          maxLength={200}
          value={metaphor}
          onChange={(e) => setMetaphor(e.target.value)}
        />
        <FormTextarea
          name="composition"
          label="Composition note"
          hint="Optional. Keep the bottom-right corner empty for the mark."
          rows={2}
          maxLength={200}
          value={composition}
          onChange={(e) => setComposition(e.target.value)}
        />
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
          <pre className={styles.prompt}>{prompt ?? 'Choose a motif to see the prompt.'}</pre>
          <span className={styles.caption}>Canon v{canon.version}</span>
        </div>
      </div>
    </SlideOver>
  );
}
