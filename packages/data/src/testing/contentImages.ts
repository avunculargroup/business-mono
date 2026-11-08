/**
 * The content-images conformance suite, written once and run against both
 * adapters.
 *
 * A run renders up to three image candidates for a draft and selects one. The
 * hard rule is that an unselected candidate never reaches anything that
 * consumes "the draft's image": the draft page's image, the copy-out download,
 * the email, any posting path. An adapter that returned the newest row instead
 * of the selected one would show a founder the image they did not pick, and
 * post it. That is the failure these cases exist to catch.
 */
import { describe, expect, it } from 'vitest';
import type { Bundle, RepositoryDomain } from '../bundle';
import { testReadContext } from './contract';

export interface ContentImagesScenario<K extends RepositoryDomain> {
  /** Appears in the test name, e.g. 'supabase' or 'fixtures'. */
  name: string;
  createBundle(): Bundle<K> | Promise<Bundle<K>>;
  /**
   * A social draft whose newest image row is an unselected candidate, with the
   * selected candidate written before it and a removed image from an earlier
   * run, so "newest" and "selected" disagree.
   */
  draftId: string;
  /** The generation group of that draft's selected candidate. */
  selectedGroupId: string;
}

export function describeContentImagesContract<K extends RepositoryDomain>(scenario: ContentImagesScenario<K>): void {
  const ctx = testReadContext();
  type WithDomain = Bundle<K> & Pick<import('../bundle').RepositoryDomains, 'content'>;
  const repo = async () => ((await scenario.createBundle()) as WithDomain).content;

  describe(`content images contract: ${scenario.name}`, () => {
    it('gives a draft its selected image, never the newest unselected candidate', async () => {
      const detail = await (await repo()).getDetail(ctx, scenario.draftId);
      if (!detail) throw new Error(`scenario draft ${scenario.draftId} is missing from ${scenario.name}`);
      expect(detail.image?.generationGroupId).toBe(scenario.selectedGroupId);
      expect(detail.image?.isSelected).toBe(true);
    });

    it('lists the other candidates unselected, and never the selected or a removed one', async () => {
      const detail = await (await repo()).getDetail(ctx, scenario.draftId);
      expect(detail!.imageCandidates.length).toBeGreaterThan(0);
      for (const candidate of detail!.imageCandidates) {
        expect(candidate.isSelected).toBe(false);
        expect(candidate.generationGroupId).not.toBe(scenario.selectedGroupId);
        expect(candidate.candidateSetId).toBe(detail!.image!.candidateSetId);
      }
    });

    it('offers only the selected image for download', async () => {
      const detail = await (await repo()).getDetail(ctx, scenario.draftId);
      const copy = await (await repo()).getSocialDraftCopy(ctx, scenario.draftId);
      expect(copy?.image?.storagePath).toBe(detail!.image!.storagePath);
      for (const candidate of detail!.imageCandidates) {
        expect(copy?.image?.storagePath).not.toBe(candidate.storagePath);
      }
    });
  });
}
