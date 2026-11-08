'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@platform/ui/Button';
import { ConfirmDialog } from '@platform/ui/ConfirmDialog';
import { useToast } from '@platform/ui/ToastProvider';
import {
  buildImagePrompt,
  nextBrandVisualVersion,
  type BrandVisual,
  type ImageConcept,
  type Layout,
  type PaletteEntry,
} from '@platform/shared';
import { removeStyleAnchor, saveBrandVisual } from '@/app/actions/brandVisual';
import { ChipField } from './ChipField';
import styles from './VisualTab.module.css';

export interface StyleAnchorView {
  path: string;
  /** Short-lived signed URL, or null when the file could not be signed. */
  url: string | null;
}

interface VisualTabProps {
  canon: BrandVisual | null;
  notes: string | null;
  anchors: StyleAnchorView[];
}

/** The LinkedIn crop, used for the mark preview: the smaller of the two. */
const PREVIEW_W = 1200;
const PREVIEW_H = 627;

/** A concept to preview the prompt against, so edits can be checked without a render. */
function sampleConcept(layout: Layout | undefined): ImageConcept {
  return {
    tension: 'Nobody knows what will trigger it, only that the safe ground is shorter than it looks.',
    subject: 'A timber pier running out over open water',
    drawn: 'the near end of the pier, planks and pilings in full',
    undrawn: 'the far end, where the planks thin into pencil guidelines over the water',
    layout: layout?.key ?? '',
    alt_text: 'A pencil sketch of a pier whose far end is only outlined.',
  };
}

/**
 * Brand Hub → Visual: the canon every generated social image is assembled
 * from. Saving makes a new version; the prompt preview below uses the same
 * function the agents server does, against a sample brief.
 */
export function VisualTab({ canon, notes, anchors }: VisualTabProps) {
  if (!canon) {
    return (
      <p className={styles.empty}>
        There is no visual canon yet. It is seeded by the brand visual migration; once it has run, it can be edited here.
      </p>
    );
  }
  return <VisualCanonForm canon={canon} notes={notes} anchors={anchors} />;
}

function VisualCanonForm({ canon, notes: initialNotes, anchors }: { canon: BrandVisual; notes: string | null; anchors: StyleAnchorView[] }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [isPending, startTransition] = useTransition();
  const [confirmSave, setConfirmSave] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const [styleBlock, setStyleBlock] = useState(canon.styleBlock);
  const [palette, setPalette] = useState<PaletteEntry[]>(canon.palette);
  const [composition, setComposition] = useState(canon.compositionBlock);
  const [prohibitedBlock, setProhibitedBlock] = useState(canon.prohibitedBlock);
  const [terms, setTerms] = useState<string[]>(canon.prohibitedTerms);
  const [layouts, setLayouts] = useState<Layout[]>(canon.layouts);
  const [mark, setMark] = useState(canon.brandMark);
  const [notes, setNotes] = useState(initialNotes ?? '');

  const nextVersion = nextBrandVisualVersion(canon.version);

  const draft: BrandVisual = {
    ...canon,
    styleBlock: styleBlock.trim(),
    palette,
    compositionBlock: composition.trim(),
    prohibitedBlock: prohibitedBlock.trim(),
    prohibitedTerms: terms,
    layouts,
    brandMark: mark,
  };
  const previewLayout = layouts.find((l) => l.is_active && l.key.trim());
  const prompt = useMemo(
    () => (previewLayout ? buildImagePrompt(draft, sampleConcept(previewLayout), { aspectRatio: canon.defaultAspectRatio }) : null),
    // draft is rebuilt each render from the state listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [styleBlock, palette, composition, prohibitedBlock, layouts, previewLayout?.key],
  );

  const setPaletteAt = (i: number, patch: Partial<PaletteEntry>) =>
    setPalette((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setLayoutAt = (i: number, patch: Partial<Layout>) =>
    setLayouts((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const handleSave = () => {
    setConfirmSave(false);
    startTransition(async () => {
      const result = await saveBrandVisual({
        style_block: styleBlock,
        composition_block: composition,
        prohibited_block: prohibitedBlock,
        prohibited_terms: terms,
        palette,
        layouts,
        brand_mark: { enabled: mark.enabled, height_pct: mark.height_pct, margin_pct: mark.margin_pct },
        notes,
      });
      if ('error' in result) {
        error(result.error ?? 'The canon could not be saved.');
        return;
      }
      success(`Visual canon saved as v${result.version}. New images use it from the next render.`);
      router.refresh();
    });
  };

  const handleRemoveAnchor = (path: string) => {
    setRemoving(null);
    startTransition(async () => {
      const result = await removeStyleAnchor(path);
      if ('error' in result) {
        error(result.error ?? 'The anchor could not be removed.');
        return;
      }
      success('Style anchor removed.');
      router.refresh();
    });
  };

  return (
    <div className={styles.tab}>
      <p className={styles.intro}>
        Every generated social image is assembled from this canon and the day&rsquo;s brief. The model never sees
        anything else. Canon v{canon.version}.
      </p>

      <section className={styles.section}>
        <h2 className={styles.heading}>Style</h2>
        <textarea
          aria-label="Style block"
          className={styles.textarea}
          rows={7}
          value={styleBlock}
          onChange={(e) => setStyleBlock(e.target.value)}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Palette</h2>
        <ul className={styles.rows}>
          {palette.map((p, i) => (
            <li key={i} className={styles.paletteRow}>
              <span className={styles.swatch} style={{ background: /^#[0-9A-Fa-f]{6}$/.test(p.hex) ? p.hex : 'transparent' }} aria-hidden />
              <input
                aria-label={`Colour ${i + 1} role`}
                className={styles.input}
                value={p.role}
                onChange={(e) => setPaletteAt(i, { role: e.target.value })}
              />
              <input
                aria-label={`Colour ${i + 1} hex`}
                className={`${styles.input} ${styles.mono}`}
                value={p.hex}
                onChange={(e) => setPaletteAt(i, { hex: e.target.value })}
              />
              <input
                aria-label={`Colour ${i + 1} usage`}
                className={`${styles.input} ${styles.wide}`}
                value={p.usage}
                onChange={(e) => setPaletteAt(i, { usage: e.target.value })}
              />
              <Button
                variant="ghost"
                size="sm"
                className={styles.rowRemove}
                aria-label={`Remove colour ${p.role || i + 1}`}
                onClick={() => setPalette((prev) => prev.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="sm" onClick={() => setPalette((prev) => [...prev, { role: '', hex: '#', usage: '' }])}>
          Add colour
        </Button>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Composition</h2>
        <textarea
          aria-label="Composition block"
          className={styles.textarea}
          rows={5}
          value={composition}
          onChange={(e) => setComposition(e.target.value)}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Prohibited</h2>
        <textarea
          aria-label="Prohibited block"
          className={styles.textarea}
          rows={6}
          value={prohibitedBlock}
          onChange={(e) => setProhibitedBlock(e.target.value)}
        />
        <ChipField
          label="Terms the brief may not use"
          hint="Checked against every brief before a render. Not sent to the model."
          values={terms}
          onChange={setTerms}
          placeholder="Add a term"
          lowercase
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Layouts</h2>
        <p className={styles.hint}>
          The brief places every concept in one of these. Retire one by unticking it; images already made keep theirs.
        </p>
        <ul className={styles.rows}>
          {layouts.map((l, i) => (
            <li key={i} className={styles.layoutRow}>
              <input
                aria-label={`Layout ${i + 1} key`}
                className={`${styles.input} ${styles.mono}`}
                value={l.key}
                onChange={(e) => setLayoutAt(i, { key: e.target.value })}
              />
              <input
                aria-label={`Layout ${i + 1} label`}
                className={styles.input}
                value={l.label}
                onChange={(e) => setLayoutAt(i, { label: e.target.value })}
              />
              <input
                aria-label={`Layout ${i + 1} description`}
                className={`${styles.input} ${styles.wide}`}
                value={l.description}
                onChange={(e) => setLayoutAt(i, { description: e.target.value })}
              />
              <label className={styles.check}>
                <input type="checkbox" checked={l.is_active} onChange={(e) => setLayoutAt(i, { is_active: e.target.checked })} />
                Active
              </label>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setLayouts((prev) => [...prev, { key: '', label: '', description: '', is_active: true }])}
        >
          Add layout
        </Button>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Brand mark</h2>
        <p className={styles.hint}>Placed bottom-right on every crop by code after the render. The model never draws it.</p>
        <div className={styles.markControls}>
          <label className={styles.check}>
            <input type="checkbox" checked={mark.enabled} onChange={(e) => setMark({ ...mark, enabled: e.target.checked })} />
            Place the mark
          </label>
          <label className={styles.numberField}>
            Height, % of crop height
            <input
              type="number"
              className={`${styles.input} ${styles.mono}`}
              min={3}
              max={20}
              step={0.5}
              value={mark.height_pct}
              onChange={(e) => setMark({ ...mark, height_pct: Number(e.target.value) })}
            />
          </label>
          <label className={styles.numberField}>
            Margin, % of crop height
            <input
              type="number"
              className={`${styles.input} ${styles.mono}`}
              min={0}
              max={10}
              step={0.5}
              value={mark.margin_pct}
              onChange={(e) => setMark({ ...mark, margin_pct: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className={styles.markPreview} role="img" aria-label="Sample LinkedIn crop showing where the mark sits">
          {mark.enabled && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/bts-logo.svg"
              alt=""
              className={styles.markImage}
              style={{
                height: `${mark.height_pct}%`,
                bottom: `${mark.margin_pct}%`,
                // `right` is a share of the width; the margin is a share of the height.
                right: `${(mark.margin_pct * PREVIEW_H) / PREVIEW_W}%`,
              }}
            />
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Style anchors</h2>
        <p className={styles.hint}>
          Approved images the model is shown as references, without the mark. Up to eight are kept; the first four are sent.
          Add one from a draft&rsquo;s image with &ldquo;Use as style anchor&rdquo;.
        </p>
        {anchors.length === 0 ? (
          <p className={styles.empty}>No style anchors yet. Until there are, images rest on the prompt alone.</p>
        ) : (
          <ul className={styles.anchors}>
            {anchors.map((a, i) => (
              <li key={a.path} className={styles.anchor}>
                {a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={`Style anchor ${i + 1}`} className={styles.anchorImage} />
                ) : (
                  <span className={styles.anchorMissing}>File unavailable</span>
                )}
                <span className={styles.caption}>{i < 4 ? 'Sent with every render' : 'Kept, not sent'}</span>
                <Button variant="ghost" size="sm" onClick={() => setRemoving(a.path)} disabled={isPending}>
                  Remove anchor
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Prompt preview</h2>
        <p className={styles.hint}>The canon as it stands in this form, assembled against a sample brief. Nothing is rendered.</p>
        <pre className={styles.prompt} aria-label="Assembled prompt">
          {prompt ?? 'Make at least one layout active to preview the prompt.'}
        </pre>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Notes</h2>
        <textarea
          aria-label="Curator notes"
          className={styles.textarea}
          rows={3}
          value={notes}
          placeholder="Why the canon is the way it is"
          onChange={(e) => setNotes(e.target.value)}
        />
      </section>

      <div className={styles.saveRow}>
        <Button onClick={() => setConfirmSave(true)} loading={isPending}>
          Save canon
        </Button>
      </div>

      <ConfirmDialog
        open={confirmSave}
        onClose={() => setConfirmSave(false)}
        onConfirm={handleSave}
        title={`Save as v${nextVersion}?`}
        description="Images made from now on record this version. Images already made keep theirs."
        confirmLabel={`Save as v${nextVersion}`}
        loading={isPending}
      />
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && handleRemoveAnchor(removing)}
        title="Stop using this anchor?"
        description="Future renders are no longer shown it, and its copy is deleted. The draft it came from keeps its image."
        confirmLabel="Remove anchor"
        destructive
        loading={isPending}
      />
    </div>
  );
}
