'use client';

import { useState } from 'react';
import { VoiceTab } from './VoiceTab';
import { BrandView } from './BrandView';
import { VisualTab, type StyleAnchorView } from './VisualTab';
import type { BrandVisual } from '@platform/shared';
import type { BrandVoiceRow, SocialAccountRow, VoiceSnippetRow } from './voiceTypes';
import type { AccountGuidelinesRow, ContentFeedbackRow } from './FeedbackGuidelinesPanel';
import styles from '@/app/(app)/brand/voice.module.css';

type BrandAsset = { id: string; name: string; type: string; content: string | null };

interface BrandHubTabsProps {
  voice: BrandVoiceRow | null;
  snippets: VoiceSnippetRow[];
  accounts: SocialAccountRow[];
  assets: BrandAsset[];
  guidelines: AccountGuidelinesRow[];
  feedback: ContentFeedbackRow[];
  visual: { canon: BrandVisual | null; notes: string | null; anchors: StyleAnchorView[] };
}

type Tab = 'voice' | 'visual' | 'assets';

export function BrandHubTabs({ voice, snippets, accounts, assets, guidelines, feedback, visual }: BrandHubTabsProps) {
  const [tab, setTab] = useState<Tab>('voice');

  return (
    <>
      <div className={styles.tabs} role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'voice'}
          className={`${styles.tab} ${tab === 'voice' ? styles.tabActive : ''}`}
          onClick={() => setTab('voice')}
        >
          Voice
        </button>
        <button
          role="tab"
          aria-selected={tab === 'visual'}
          className={`${styles.tab} ${tab === 'visual' ? styles.tabActive : ''}`}
          onClick={() => setTab('visual')}
        >
          Visual
        </button>
        <button
          role="tab"
          aria-selected={tab === 'assets'}
          className={`${styles.tab} ${tab === 'assets' ? styles.tabActive : ''}`}
          onClick={() => setTab('assets')}
        >
          Assets
        </button>
      </div>

      {tab === 'voice' && (
        <VoiceTab
          voice={voice}
          snippets={snippets}
          accounts={accounts}
          guidelines={guidelines}
          feedback={feedback}
        />
      )}
      {tab === 'visual' && <VisualTab canon={visual.canon} notes={visual.notes} anchors={visual.anchors} />}
      {tab === 'assets' && <BrandView assets={assets} />}
    </>
  );
}
