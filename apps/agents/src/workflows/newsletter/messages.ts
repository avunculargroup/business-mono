import type { StoryCandidate, ReviewedStory, TimeRange } from './schemas.js';

// Pure builders for the Signal messages Simon sends at each newsletter gate.
// Side-effect free so wording is unit-testable. The run-result handler sends
// the returned strings.

const TIME_RANGE_LABEL: Record<TimeRange, string> = {
  week: 'week',
  fortnight: 'fortnight',
  month: 'month',
};

// Adjective form for edition/title descriptors ("Weekly edition") as opposed to
// the noun form above used in "the past week" phrasing.
const EDITION_LABEL: Record<TimeRange, string> = {
  week: 'Weekly',
  fortnight: 'Fortnightly',
  month: 'Monthly',
};

export function editionLabel(timeRange: TimeRange): string {
  return EDITION_LABEL[timeRange];
}

const LETTERS = 'ABCDEFGHIJ';

export function buildGate1Message(args: {
  candidates: StoryCandidate[];
  recommendedIds: string[];
  timeRange: TimeRange;
}): string {
  const { candidates, recommendedIds, timeRange } = args;
  const recommended = candidates.filter((c) => recommendedIds.includes(c.story_id));
  const also = candidates.filter((c) => !recommendedIds.includes(c.story_id));

  const lines: string[] = [
    'Newsletter draft — story selection',
    '',
    `I've found ${candidates.length} candidate stories from the past ${TIME_RANGE_LABEL[timeRange]}.`,
    'Here are my top picks — reply to approve, swap, or adjust:',
    '',
    `✓ RECOMMENDED (${recommended.length} stories):`,
    '',
  ];

  recommended.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.working_title}`);
    lines.push(`   ${c.angle}`);
    lines.push(
      `   Data: ${c.data_completeness}/10 | Research needed: ${c.needs_research ? 'yes' : 'no'}`,
    );
    lines.push('');
  });

  if (also.length > 0) {
    lines.push('ALSO AVAILABLE:');
    also.forEach((c, i) => {
      lines.push(`${LETTERS[i] ?? '?'}. ${c.working_title} — ${c.angle}`);
    });
    lines.push('');
  }

  lines.push('Reply "go" to approve, or tell me what to change.');
  lines.push('(e.g. "swap 3 for B" or "drop story 2, add more on regulation")');
  return lines.join('\n');
}

/**
 * Sent when a run finds no stories worth running. There's nothing to approve,
 * so this isn't a gate prompt — it's a diagnostic that explains *why* it was
 * empty and what the director can do about it.
 */
export function buildNoStoriesMessage(args: { timeRange: TimeRange; poolSize: number }): string {
  const { timeRange, poolSize } = args;
  const label = TIME_RANGE_LABEL[timeRange];

  const diagnosis =
    poolSize === 0
      ? `I found nothing from the past ${label} relevant enough to build a newsletter from — no news or internal content in that window cleared the relevance bar.`
      : `I pulled ${poolSize} candidate item${poolSize === 1 ? '' : 's'} from the past ${label}, but none could be shaped into a story worth running.`;

  return [
    'Newsletter — no stories to run',
    '',
    diagnosis,
    '',
    "No approval needed — there's nothing to publish. A few things that might help:",
    '• Widen the window — ask for a "month" edition instead.',
    '• Check the news pipeline is ingesting (Researcher / news sources).',
    '• Add internal content the newsletter can draw on.',
  ].join('\n');
}

export function buildGate2Message(args: {
  stories: ReviewedStory[];
  totalWordCount: number;
  timeRange: TimeRange;
  overLengthIds: string[];
  held?: boolean;
}): string {
  const { stories, totalWordCount, timeRange, overLengthIds, held } = args;
  const lines: string[] = [
    held ? 'Newsletter on hold — still ready when you are' : 'Newsletter ready for review',
    '',
    `${stories.length} stories | ~${totalWordCount} words | ${EDITION_LABEL[timeRange]} edition`,
    '',
    'Editorial scorecard:',
  ];

  stories.forEach((s, i) => {
    const flag = overLengthIds.includes(s.story_id) || !s.review.passes_gate ? ' ⚠️' : '';
    lines.push(`Story ${i + 1} "${s.title}" — ${s.review.overall_score}/10${flag}`);
  });

  lines.push('');
  lines.push('Full draft attached. Reply:');
  lines.push('• "publish" to approve and save as draft in the content pipeline');
  lines.push('• "revise [story number]: [instruction]" to request a change');
  lines.push('• "hold" to pause without discarding');
  return lines.join('\n');
}

export function buildConfirmationMessage(args: {
  title: string;
  storyCount: number;
  totalWordCount: number;
  hqUrl: string;
  contentItemId: string;
}): string {
  const { title, storyCount, totalWordCount, hqUrl, contentItemId } = args;
  return [
    'Newsletter saved to content pipeline.',
    '',
    `"${title}" — ${storyCount} stories, ${totalWordCount} words`,
    'Status: Approved draft — ready to schedule',
    '',
    `View or schedule it in the platform: ${hqUrl}/content/${contentItemId}`,
  ].join('\n');
}
