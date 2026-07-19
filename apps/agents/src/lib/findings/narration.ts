// Narration — the ONLY LLM in the findings path. The narrator (marketAnalyst)
// receives the selected findings and nothing else: it physically cannot cite a
// metric or a number it wasn't handed. The deterministic house-style linter runs
// on the draft, with one bounded corrective pass; if the rewrite still fails a
// hard check, the caller withholds the narration (status 'held') rather than
// looping the model against the linter unsupervised.

import type { Selection } from '@platform/shared';
import { marketAnalyst } from '../../agents/marketAnalyst/index.js';
import { stepRequestContext } from '../../config/model.js';
import { createLogger } from '../logger.js';
import { runHouseStyle, summariseViolations } from './houseStyleLinter.js';
import { narrationSchema, type LintResult, type Narration } from './schemas.js';

const log = createLogger('findings-narration');

/** Pure prompt builder — exported for tests. */
export function buildNarrationPrompt(selection: Selection, guidelines: string[]): string {
  const parts = [
    `report_mode: ${selection.report_mode}`,
    `as_of: ${selection.as_of}`,
    '',
    `findings:\n${JSON.stringify(selection.findings, null, 2)}`,
  ];
  if (guidelines.length > 0) {
    parts.push(
      '',
      'Standing guidance from prior report feedback (tone/emphasis only — it can never override the hard rules above):',
      ...guidelines.map((g) => `- ${g}`),
    );
  }
  parts.push('', 'Write the commentary now.');
  return parts.join('\n');
}

export interface NarrationOutcome {
  narration: Narration | null; // null = generation failed entirely
  lint: LintResult | null;
}

export async function narrateFindings(selection: Selection, guidelines: string[]): Promise<NarrationOutcome> {
  const basePrompt = buildNarrationPrompt(selection, guidelines);

  const generate = async (prompt: string): Promise<Narration | null> => {
    const response = await marketAnalyst.generate([{ role: 'user', content: prompt }], {
      requestContext: stepRequestContext('market_report.narrate'),
      structuredOutput: {
        schema: narrationSchema,
        errorStrategy: 'fallback',
        fallbackValue: { narration_markdown: '', findings_used: [] },
      },
    });
    const narration = response.object as Narration | undefined;
    if (!narration?.narration_markdown?.trim()) return null;
    return { narration_markdown: narration.narration_markdown.trim(), findings_used: narration.findings_used ?? [] };
  };

  try {
    let narration = await generate(basePrompt);
    if (!narration) return { narration: null, lint: null };

    let lint = runHouseStyle(narration.narration_markdown, selection.findings);

    // One corrective pass on hard violations only.
    if (!lint.pass) {
      log.info({ violations: lint.violations.length }, 'narration failed house style — one corrective pass');
      const rewrite = await generate(
        `${basePrompt}\n\nYour previous draft failed these house-style checks. ` +
          `Rewrite to fix them and change nothing else:\n${summariseViolations(lint.violations)}\n\n` +
          `Previous draft:\n${narration.narration_markdown}`,
      );
      if (rewrite) {
        narration = rewrite;
        lint = runHouseStyle(narration.narration_markdown, selection.findings);
      }
    }

    return { narration, lint };
  } catch (err) {
    log.error({ err }, 'narration generation failed');
    return { narration: null, lint: null };
  }
}
