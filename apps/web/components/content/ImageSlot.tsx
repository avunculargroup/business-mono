'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@platform/ui/Button';
import { ConfirmDialog } from '@platform/ui/ConfirmDialog';
import { StatusChip } from '@platform/ui/StatusChip';
import { useToast } from '@platform/ui/ToastProvider';
import type { BrandVisual } from '@platform/shared';
import type { ContentImage, ContentImageRequest } from '@platform/data';
import {
  promoteImageToStyleAnchor,
  removeImage,
  requestImageRegenerate,
  saveImageAltText,
} from '@/app/actions/contentImages';
import { ImageBriefSlideOver } from './ImageBriefSlideOver';
import styles from './ImageSlot.module.css';

export interface ImageSlotProps {
  contentItemId: string;
  /** The current image with a short-lived signed URL, or null. */
  image: (ContentImage & { url: string | null }) | null;
  request: ContentImageRequest | null;
  canon: BrandVisual | null;
}

/** While a request is open the page re-reads itself on this cadence. */
const REFRESH_MS = 5000;

const VERDICT_CHIP: Record<string, { label: string; color: 'warning' | 'destructive' }> = {
  general_advice: { label: 'Alt text implies an outcome', color: 'warning' },
  personal_opinion: { label: 'Alt text reads as opinion', color: 'warning' },
};

function isOpen(request: ContentImageRequest | null): boolean {
  return request !== null && (request.status === 'pending' || request.status === 'working');
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/**
 * The image on a social draft: preview, alt text with Lex's verdict, and the
 * actions a founder takes on it. Regenerate and render-with-brief run on the
 * agents server; the slot shows their progress and re-reads the page until
 * they resolve.
 */
export function ImageSlot({ contentItemId, image, request, canon }: ImageSlotProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [isPending, startTransition] = useTransition();
  const [altText, setAltText] = useState(image?.altText ?? '');
  const [briefOpen, setBriefOpen] = useState(false);
  const [confirm, setConfirm] = useState<'remove' | 'anchor' | null>(null);
  const busy = isOpen(request);

  useEffect(() => setAltText(image?.altText ?? ''), [image?.id, image?.altText]);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [busy, router]);

  const run = (fn: () => Promise<{ error?: string; success?: boolean }>, done: string) => {
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        error(result.error);
        return;
      }
      success(done);
      router.refresh();
    });
  };

  const ai = image?.source === 'ai_generated' && image.generationGroupId !== null;
  const groupId = image?.generationGroupId ?? '';
  const motif = canon?.motifs.find((m) => m.key === image?.brief?.motif_key);
  const meta = image
    ? [
        motif?.label ?? image.brief?.motif_key,
        image.modelId,
        image.brandVisualVersion ? `canon v${image.brandVisualVersion}` : null,
        image.costUsd !== null ? formatCost(image.costUsd) : null,
      ].filter(Boolean)
    : [];
  const chip = image?.altTextVerdict ? VERDICT_CHIP[image.altTextVerdict.classification] : undefined;
  const altDirty = altText.trim() !== (image?.altText ?? '').trim();

  return (
    <section className={styles.slot} aria-labelledby="image-slot-title">
      <span id="image-slot-title" className={styles.label}>
        Image
      </span>

      {busy && (
        <p className={styles.progress} role="status">
          {request!.action === 'recheck_alt_text'
            ? 'Lex is checking the alt text.'
            : 'Rendering a new image. This can take a couple of minutes.'}
        </p>
      )}
      {request?.status === 'failed' && request.error && (
        <p className={styles.failure} role="alert">
          The last image request did not finish: {request.error}
        </p>
      )}

      {image ? (
        <>
          {image.url ? (
            // Signed, short-lived storage URL: next/image would cache it past expiry.
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.preview} src={image.url} alt={image.altText ?? ''} />
          ) : (
            <p className={styles.missing}>The image file could not be loaded.</p>
          )}
          {meta.length > 0 && <p className={styles.caption}>{meta.join(' · ')}</p>}

          <div className={styles.altField}>
            <label htmlFor="image-alt-text" className={styles.label}>
              Alt text
            </label>
            <textarea
              id="image-alt-text"
              className={styles.textarea}
              rows={3}
              maxLength={300}
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              disabled={!ai}
            />
            <div className={styles.altRow}>
              {ai && image.altTextVerdict === null && <StatusChip label="Checking alt text" />}
              {chip && <StatusChip label={chip.label} color={chip.color} />}
              {ai && (
                <Button
                  size="sm"
                  variant="secondary"
                  className={styles.altSave}
                  disabled={!altDirty || busy}
                  loading={isPending}
                  onClick={() =>
                    run(
                      () => saveImageAltText({ contentItemId, generationGroupId: groupId, altText }),
                      'Alt text saved. Lex is checking it.',
                    )
                  }
                >
                  Save alt text
                </Button>
              )}
            </div>
            {chip && image.altTextVerdict?.rationale && (
              <p className={styles.rationale}>{image.altTextVerdict.rationale}</p>
            )}
          </div>

          {ai && (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                disabled={busy || !canon}
                onClick={() => run(() => requestImageRegenerate(contentItemId), 'Rendering a new image.')}
              >
                Regenerate image
              </Button>
              <Button variant="secondary" disabled={busy || !canon} onClick={() => setBriefOpen(true)}>
                Edit brief
              </Button>
              {!image.isStyleAnchor && (
                <Button variant="ghost" disabled={busy} onClick={() => setConfirm('anchor')}>
                  Use as style anchor
                </Button>
              )}
              <Button variant="ghost" disabled={busy} onClick={() => setConfirm('remove')}>
                Remove image
              </Button>
            </div>
          )}
        </>
      ) : canon ? (
        <div className={styles.empty}>
          <p>No image on this draft.</p>
          <Button variant="secondary" disabled={busy} onClick={() => setBriefOpen(true)}>
            Write an image brief
          </Button>
        </div>
      ) : (
        <p className={styles.empty}>
          Images need a visual canon. Set one up in <Link href="/brand">Brand Hub → Visual</Link>.
        </p>
      )}

      {canon && briefOpen && (
        <ImageBriefSlideOver
          open={briefOpen}
          onClose={() => setBriefOpen(false)}
          onQueued={() => router.refresh()}
          contentItemId={contentItemId}
          canon={canon}
          initial={image?.brief ?? null}
        />
      )}

      <ConfirmDialog
        open={confirm === 'anchor'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          run(
            () => promoteImageToStyleAnchor({ contentItemId, generationGroupId: groupId }),
            'Future images will be shown this one as a reference.',
          );
        }}
        title="Use this image to guide future images?"
        description="The image model is shown style anchors with every render. The copy kept is the version without the BTS mark."
        confirmLabel="Use as style anchor"
        loading={isPending}
      />
      <ConfirmDialog
        open={confirm === 'remove'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          run(() => removeImage({ contentItemId, generationGroupId: groupId }), 'Image removed.');
        }}
        title="Remove this image?"
        description="It comes off every draft that shares it, and its files are deleted. The record of how it was made is kept."
        confirmLabel="Remove image"
        destructive
        loading={isPending}
      />
    </section>
  );
}
