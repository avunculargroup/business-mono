'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@platform/ui/Button';
import { ConfirmDialog } from '@platform/ui/ConfirmDialog';
import { StatusChip } from '@platform/ui/StatusChip';
import { useToast } from '@platform/ui/ToastProvider';
import { FormField } from '@platform/ui/FormField';
import { lintHeadline, lintKicker, type BrandVisual } from '@platform/shared';
import type { ContentImage, ContentImageRequest } from '@platform/data';
import {
  getImageDownloadUrl,
  promoteImageToStyleAnchor,
  removeImage,
  requestImageRecompose,
  requestImageRegenerate,
  saveImageAltText,
  selectImageCandidate,
} from '@/app/actions/contentImages';
import { ImageBriefSlideOver } from './ImageBriefSlideOver';
import styles from './ImageSlot.module.css';

export interface ImageSlotProps {
  contentItemId: string;
  /** The selected image with a short-lived signed URL, or null. */
  image: (ContentImage & { url: string | null }) | null;
  /** The run's other candidates, each with a short-lived signed URL. */
  candidates?: Array<ContentImage & { url: string | null }>;
  request: ContentImageRequest | null;
  canon: BrandVisual | null;
  /** The draft's copy, which a headline's figures are checked against. */
  postCopy?: string;
}

/** While a request is open the page re-reads itself on this cadence. */
const REFRESH_MS = 5000;

const VERDICT_CHIP: Record<string, { label: string; color: 'warning' | 'destructive' }> = {
  general_advice: { label: 'Alt text implies an outcome', color: 'warning' },
  personal_opinion: { label: 'Alt text reads as opinion', color: 'warning' },
};

const HEADLINE_CHIP: Record<string, { label: string; color: 'warning' | 'destructive' }> = {
  general_advice: { label: 'Headline implies an outcome', color: 'warning' },
  personal_opinion: { label: 'Headline reads as opinion', color: 'warning' },
};

const PROGRESS: Record<ContentImageRequest['action'], string> = {
  recheck_alt_text: 'Lex is checking the alt text.',
  regenerate: 'Rendering a new set of images. This can take a couple of minutes.',
  render_brief: 'Rendering the image. This can take a couple of minutes.',
  recompose: 'Updating the card.',
};

function isOpen(request: ContentImageRequest | null): boolean {
  return request !== null && (request.status === 'pending' || request.status === 'working');
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/**
 * The image on a social draft: the selected candidate's preview, alt text with
 * Lex's verdict, the actions a founder takes on it, and the run's other
 * candidates to choose from. Regenerate and render-with-brief run on the agents
 * server; the slot shows their progress and re-reads the page until they resolve.
 */
export function ImageSlot({ contentItemId, image, candidates = [], request, canon, postCopy = '' }: ImageSlotProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [isPending, startTransition] = useTransition();
  const [altText, setAltText] = useState(image?.altText ?? '');
  const [briefOpen, setBriefOpen] = useState(false);
  const [confirm, setConfirm] = useState<'remove' | 'anchor' | null>(null);
  const [isDownloading, startDownload] = useTransition();
  const busy = isOpen(request);

  // Signed on click (5 minutes, named for the platform crop) rather than reusing
  // the preview URL, so the browser saves a file instead of opening the image.
  const handleDownload = () => {
    if (!image) return;
    startDownload(async () => {
      const result = await getImageDownloadUrl(image.storagePath);
      if ('error' in result) {
        error(result.error ?? 'The image could not be downloaded.');
        return;
      }
      window.location.assign(result.url);
    });
  };

  useEffect(() => setAltText(image?.altText ?? ''), [image?.id, image?.altText]);

  // The card's words: edited here, recomposed on the agents server from the stored art.
  const [headline, setHeadline] = useState(image?.headline ?? '');
  const [kicker, setKicker] = useState(image?.kicker ?? '');
  const [showHeadline, setShowHeadline] = useState(image?.cardType === 'headline');
  const [headlineFlags, setHeadlineFlags] = useState<string[]>([]);
  const [kickerFlags, setKickerFlags] = useState<string[]>([]);
  useEffect(() => {
    setHeadline(image?.headline ?? '');
    setKicker(image?.kicker ?? '');
    setShowHeadline(image?.cardType === 'headline');
    setHeadlineFlags([]);
    setKickerFlags([]);
  }, [image?.id, image?.headline, image?.kicker, image?.cardType]);

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
  // v1.1+ images name a layout; v1.0 images a motif from the retired list.
  const styleLabel = image?.layout
    ? (canon?.layouts.find((l) => l.key === image.layout)?.label ?? image.layout)
    : image?.motifKey
      ? (canon?.motifs.find((m) => m.key === image.motifKey)?.label ?? image.motifKey)
      : null;
  const meta = image
    ? [
        styleLabel,
        image.modelId,
        image.brandVisualVersion ? `canon v${image.brandVisualVersion}` : null,
        image.costUsd !== null ? formatCost(image.costUsd) : null,
      ].filter(Boolean)
    : [];
  const chip = image?.altTextVerdict ? VERDICT_CHIP[image.altTextVerdict.classification] : undefined;
  const altDirty = altText.trim() !== (image?.altText ?? '').trim();
  const headlineChip = image?.headlineVerdict ? HEADLINE_CHIP[image.headlineVerdict.classification] : undefined;
  // A headline sits beside square art; an image-only render is 16:9 and cannot take one.
  const needsNewImage = showHeadline && image?.artAspect !== '1:1';
  const cardDirty =
    showHeadline !== (image?.cardType === 'headline') ||
    (showHeadline && (headline.trim() !== (image?.headline ?? '') || kicker.trim() !== (image?.kicker ?? '')));

  const saveCard = () => {
    if (showHeadline) {
      const lint = lintHeadline(headline, postCopy);
      setHeadlineFlags(lint.flags);
      // The kicker is optional: an empty one is no kicker, not a flag.
      const kickerLint = kicker.trim() ? lintKicker(kicker) : { ok: true, flags: [] };
      setKickerFlags(kickerLint.flags);
      if (!lint.ok || !kickerLint.ok) return;
    } else {
      setHeadlineFlags([]);
      setKickerFlags([]);
    }
    run(
      () => requestImageRecompose({ contentItemId, generationGroupId: groupId, showHeadline, headline, kicker }),
      'Updating the card on every draft that shares it.',
    );
  };

  return (
    <section className={styles.slot} aria-labelledby="image-slot-title">
      <span id="image-slot-title" className={styles.label}>
        Image
      </span>

      {busy && (
        <p className={styles.progress} role="status">
          {PROGRESS[request!.action] ?? PROGRESS.render_brief}
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
          {image.tension && <p className={styles.tension}>{image.tension}</p>}
          {image.reviewNote && <p className={styles.caption}>{image.reviewNote}</p>}
          {meta.length > 0 && <p className={styles.caption}>{meta.join(' · ')}</p>}

          {ai && (
            <fieldset className={styles.cardFields}>
              <legend className={styles.label}>Card</legend>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={showHeadline}
                  disabled={busy}
                  onChange={(e) => {
                    setShowHeadline(e.target.checked);
                    setHeadlineFlags([]);
                    setKickerFlags([]);
                  }}
                />
                Show headline
              </label>
              {needsNewImage ? (
                <div className={styles.needsImage}>
                  <p>Needs a new image to add a headline.</p>
                  <Button
                    variant="secondary"
                    disabled={busy || !canon}
                    onClick={() => run(() => requestImageRegenerate(contentItemId), 'Rendering a new set of images.')}
                  >
                    Regenerate image
                  </Button>
                </div>
              ) : (
                showHeadline && (
                  <>
                    <FormField
                      name="headline"
                      label="Headline"
                      hint="Three to six words, in sentence case, ending with a full stop or a question mark."
                      value={headline}
                      maxLength={120}
                      disabled={busy}
                      onChange={(e) => setHeadline(e.target.value)}
                    />
                    <FormField
                      name="kicker"
                      label="Kicker"
                      hint="Optional. The post's subject in one to three plain words, like Bitcoin security. Shown in capitals above the headline."
                      error={kickerFlags.length > 0 ? kickerFlags.join(' ') : undefined}
                      value={kicker}
                      maxLength={24}
                      disabled={busy}
                      onChange={(e) => setKicker(e.target.value)}
                    />
                  </>
                )
              )}
              {headlineFlags.length > 0 && (
                <ul className={styles.flags} role="alert" aria-label="Headline changes needed">
                  {headlineFlags.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              <div className={styles.altRow}>
                {image.cardType === 'headline' && image.headlineVerdict === null && <StatusChip label="Checking headline" />}
                {headlineChip && <StatusChip label={headlineChip.label} color={headlineChip.color} />}
                {!needsNewImage && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className={styles.altSave}
                    disabled={!cardDirty || busy}
                    loading={isPending}
                    onClick={saveCard}
                  >
                    Save card
                  </Button>
                )}
              </div>
              {headlineChip && image.headlineVerdict?.rationale && (
                <p className={styles.rationale}>{image.headlineVerdict.rationale}</p>
              )}
            </fieldset>
          )}

          <div className={styles.altField}>
            <label htmlFor="image-alt-text" className={styles.label}>
              Alt text
            </label>
            <textarea
              id="image-alt-text"
              className={styles.textarea}
              rows={3}
              maxLength={360}
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

          <div className={styles.actions}>
            <Button variant="secondary" onClick={handleDownload} loading={isDownloading} disabled={!image.url}>
              Download image
            </Button>
            {ai && (
              <>
                <Button
                  variant="secondary"
                  disabled={busy || !canon}
                  onClick={() => run(() => requestImageRegenerate(contentItemId), 'Rendering a new set of images.')}
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
              </>
            )}
          </div>
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

      {candidates.length > 0 && (
        <div className={styles.candidates}>
          <span className={styles.label}>{image ? 'Other options' : 'Options'}</span>
          <ul className={styles.candidateList}>
            {candidates.map((c, i) => (
              <li key={c.id} className={styles.candidate}>
                {c.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.candidateImage} src={c.url} alt={c.altText ?? `Option ${i + 1}`} />
                ) : (
                  <span className={styles.candidateMissing}>Preview unavailable</span>
                )}
                {c.tension && <p className={styles.candidateTension}>{c.tension}</p>}
                {c.reviewNote && <p className={styles.caption}>{c.reviewNote}</p>}
                <Button
                  variant="secondary"
                  size="sm"
                  className={styles.candidateUse}
                  disabled={busy || isPending || !c.generationGroupId}
                  aria-label={`Use option ${i + 1}${c.tension ? `: ${c.tension}` : ''}`}
                  onClick={() =>
                    run(
                      () => selectImageCandidate({ contentItemId, generationGroupId: c.generationGroupId ?? '' }),
                      'Image changed on every draft that shares it.',
                    )
                  }
                >
                  Use this image
                </Button>
              </li>
            ))}
          </ul>
        </div>
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
