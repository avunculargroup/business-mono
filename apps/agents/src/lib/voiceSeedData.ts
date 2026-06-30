import type { ContentPolicy, VoiceProfile } from '@platform/voice';

// The company-voice canon, mapped from docs/brand-voice.md into the brand_voice
// table shape. This is the explicit, reviewable migration of the doc's
// voice-shaped content (tone, vocabulary, signature devices, format rules) into
// structured fields. The richer strategic content in the doc (detailed Bitcoin
// stance, objection handling, topic/thought-leader lists, the calibration
// sample) is NOT lost: the calibration sample and signature lines move to
// voice_snippets below, and the doc itself is retained until the parity gate
// confirms table-sourced output matches doc-sourced output.
//
// Edited in-app via Brand Hub after seeding; this is the initial v1.0 state.

export interface BrandVoiceSeed {
  profile: VoiceProfile;
  mission_summary: string;
  bitcoin_capitalisation_rule: string;
  content_policy: ContentPolicy;
  version: string;
}

export const BRAND_VOICE_SEED: BrandVoiceSeed = {
  version: '1.0',
  mission_summary:
    'We make Bitcoin work for businesses: education, payments infrastructure, and ' +
    'treasury management from strategy to custody. Australia’s dedicated, all-in-one ' +
    'Bitcoin business hub — Bitcoin-only (not “crypto”), relationship-first, globally ' +
    'connected for best-practice partnerships, and deeply rooted in Australian regulation.',
  bitcoin_capitalisation_rule:
    '“Bitcoin” (capital B) for the network, protocol, or technology; “bitcoin” ' +
    '(lowercase b) for the currency or unit — e.g. “The Bitcoin network secures your ' +
    'bitcoin holdings.” Never use “crypto”, “cryptocurrency”, or “digital assets” ' +
    'except in a strict compliance context. Enforced across all output.',
  content_policy: {
    topics_endorsed: [
      'Bitcoin treasury allocation strategies and governance frameworks',
      'Regulatory developments (Australian and global — ATO, ASIC, evolving frameworks)',
      'Corporate adoption trends and public company Bitcoin holdings',
      'Bitcoin payment implementations (POS, B2B invoicing, cross-border, salaries)',
      'Professional advisor education (accountants, lawyers, Big 4)',
      'Superannuation fund integration and SMSF considerations',
      'Custody best practices and security frameworks',
      'Economic cycles, inflation hedging, monetary policy impacts',
    ],
    topics_avoided: [
      'Price predictions or targets',
      'Altcoins and other cryptocurrencies',
      'DeFi (yield farming, liquidity pools, smart contracts)',
      'Memecoins and novelty tokens',
      'Political endorsements',
      'Specific trading strategies (day trading, arbitrage, leverage)',
      'NFTs and Web3 hype',
      'Scam/fraud recovery',
      'Personal investment advice (we focus on business/institutional)',
    ],
    aligned_voices: [
      'Michael Saylor',
      'Lyn Alden',
      'Daniel Batten',
      'Sam Roberts',
      'Theresa Morrison',
      'Lisa Hough',
      'Caitlin Long',
      'Steve Orenstein (Locate Technologies)',
      'Bayani Mills',
      'Sevan Tuna',
      'Electra Frost',
      'James Check (Checkmate)',
      'Jeff Booth',
      'Jason Pizzino',
      'Michael Pizzino',
      'Joe Nakamoto',
      'MicroStrategy',
      'Fidelity Digital Assets',
      'River Financial',
    ],
    contrarian_views: [
      'Warren Buffett',
      'Gold maximalists (Peter Schiff, Jim Rickards, Marc Faber)',
      'Jim Cramer',
      'Nouriel Roubini',
      'Paul Krugman',
      'Economists dismissing Bitcoin as a bubble (Robert Shiller, Joseph Stiglitz, Kenneth Rogoff)',
      'ESG critics (Alex de Vries/Digiconomist, Greenpeace, Christine Lagarde)',
    ],
  },
  profile: {
    persona:
      'The quietly confident dinner-party guest who really knows Bitcoin and business ' +
      'finance. Listens first, asks about your situation, then explains things clearly and ' +
      'practically — no jargon overload, no talking down, no hard sell. Knowledgeable, ' +
      'capable, warm, present, always putting the client first. By the end you feel ' +
      'informed and reassured, not overwhelmed.',
    tone_attributes: [
      'authoritative',
      'pragmatic',
      'warm',
      'plain-spoken',
      'calm',
      'client-first',
    ],
    vocabulary_do: [
      'Bitcoin treasury strategy',
      'reserve management',
      'strategic reserve asset',
      'corporate Bitcoin adoption',
      'balance sheet optimisation',
      'custody solutions',
      'compliance frameworks',
      'resilience',
      'preservation',
      'informed risk management',
      'education',
      'consultation',
      'implementation',
      'integration',
    ],
    vocabulary_avoid: [
      'to the moon',
      'moonshot',
      'explosive growth',
      'skyrocket',
      'bull run',
      'FOMO',
      'HODL',
      'diamond hands',
      'laser eyes',
      'guaranteed returns',
      'risk-free',
      'sure thing',
      'easy money',
      'get rich quick',
      'revolutionary',
      'game-changer',
      'disruptive',
      'speculative investment',
      'bet on Bitcoin',
      'gamble',
      'pump',
      'dump',
      'whale',
      'shitcoin',
      'crypto',
      'cryptocurrency',
    ],
    signature_devices: [
      'explain jargon the first time you use it',
      'no exclamation marks',
      'lead with the insight, not the background',
      'historical or narrative framing that builds to the point',
      'facts-first but emotionally resonant',
      'a dry, light-humour line to connect — never to show off',
      'let the point do the work',
    ],
    format_notes:
      'Semi-formal on LinkedIn, newsletters, blogs, and email; conversational on X. ' +
      'LinkedIn 200–400 words with hooks and short paragraphs; X single posts 100–250 ' +
      'chars, threads ~7 tweets; blogs 1,200–2,000 words; newsletters 400–800 words, ' +
      'skimmable with subheads. Emojis are fine on social, never in email or newsletters. ' +
      'Cite sources when available but prefer narrative with supporting data over ' +
      'data-heavy presentation.',
  },
};

export interface VoiceSnippetSeed {
  snippet_type: 'phrase' | 'opener' | 'closer' | 'transition' | 'paragraph' | 'full_post' | 'cta';
  body: string;
  curator_note: string;
  platform: 'linkedin' | 'twitter_x' | null;
  topic_tags: string[];
  is_starred: boolean;
}

// Company-canon exemplars (social_account_id = NULL). These demonstrate the
// voice rather than describe it — the highest-leverage input to on-voice
// generation. Drawn from the doc's Voice Calibration Sample and signature
// register. Each carries a curator note explaining what it teaches.
export const VOICE_SNIPPET_SEEDS: VoiceSnippetSeed[] = [
  {
    snippet_type: 'full_post',
    platform: null,
    is_starred: true,
    topic_tags: ['asset class', 'volatility', 'long-term horizon'],
    body:
      'In 6,600 years of history, only 6 asset-class stars have been born. In ancient ' +
      'times, the need for “assets” as we understand them today was extremely limited. ' +
      'Life was largely day-to-day; savings barely existed until agricultural societies ' +
      'let people store grain for the winter.\n\n' +
      'And then — drumroll please — in 2009, a mere 407 years after the last one, our ' +
      'first new asset class in over four centuries was born: Bitcoin.\n\n' +
      'Bitcoin is not a new spin on an old investment. It is not a tech stock or a fintech ' +
      'startup. There is no government issuance, no property registry, no corporation ' +
      'behind it. It is a 16-year-old, brand-new, world-transforming asset class that will ' +
      'carry at least as much power and impact as every major asset class before it.\n\n' +
      'After 6,600 years of asset-class evolution… please tell me again how much a 30% dip ' +
      'matters?',
    curator_note:
      'The calibration benchmark — the company voice at its best. A historical narrative ' +
      'arc builds context and authority; the language stays accessible, not academic; ' +
      'facts-first but emotionally resonant; and the close lands dry humour to reframe ' +
      'volatility. Aim for this level of clarity, confidence, and arc.',
  },
  {
    snippet_type: 'opener',
    platform: null,
    is_starred: false,
    topic_tags: ['asset class', 'history'],
    body: 'In 6,600 years of history, only 6 asset-class stars have been born.',
    curator_note:
      'Opens with a striking historical fact, not the asset — earns attention before ' +
      'Bitcoin is ever mentioned. The reframe-first move that suits a sceptical finance ' +
      'reader.',
  },
  {
    snippet_type: 'closer',
    platform: null,
    is_starred: false,
    topic_tags: ['volatility', 'long-term horizon'],
    body:
      'After 6,600 years of asset-class evolution… please tell me again how much a 30% ' +
      'dip matters?',
    curator_note:
      'Reframes volatility through a long-horizon lens and lands the dry-humour close. ' +
      'Confident without being aggressive — the point does the work.',
  },
  {
    snippet_type: 'phrase',
    platform: null,
    is_starred: false,
    topic_tags: ['monetary policy', 'humour'],
    body:
      'Bitcoin’s basically math that refuses to print more of itself, unlike some central ' +
      'banks.',
    curator_note:
      'The dry, light-humour register — used to connect, never to show off. Drop a line ' +
      'like this occasionally to be human, not clever.',
  },
];
