// The brand_visual v1.0 seed row, mirrored from
// supabase/migrations/20261108000000_add_brand_visual.sql so the image-step tests
// exercise the canon that actually ships. If the seed changes, change this too.
export const BRAND_VISUAL_V1_ROW = {
  id: 'bv-1',
  version: '1.0',
  is_active: true,
  style_block: `A hand-drawn sketch in graphite pencil and fine ink on warm off-white paper.
Loose, confident linework from a skilled hand: some lines drawn twice, light
construction lines left visible, light cross-hatching for shade. It should look
like a page from an architect's or engineer's sketchbook, drawn to think
something through. One focal idea with generous empty paper; the subject fills
no more than about 60% of the frame. Calm, considered and quietly confident.
Warm in tone, never cool.`,
  palette: [
  {
    "role": "Paper",
    "hex": "#FAFAF8",
    "usage": "warm off-white. Clean and even, no visible paper grain, stains or vignette."
  },
  {
    "role": "Main linework",
    "hex": "#1A1915",
    "usage": "warm near-black graphite and ink."
  },
  {
    "role": "Lighter strokes and hatching",
    "hex": "#6B6860",
    "usage": "warm grey."
  },
  {
    "role": "Accent",
    "hex": "#C9A84C",
    "usage": "a single light wash or stroke of muted gold on ONE element only."
  }
],
  composition_block: `Front-on or gentle three-quarter view; no dramatic perspective. Asymmetric
balance with clear empty paper on at least one side. Keep every important
element inside the central 80% of the frame, so the image survives platform
crops. Leave the bottom-right corner (roughly the lowest and rightmost 15% of
the frame) as empty paper.`,
  prohibited_block: `Never include: text, letters, numbers, labels, logos, watermarks or signatures.
Coins of any kind, currency symbols, gold bars, piles of money, rockets, moons,
bulls or bears, price charts, candlesticks, arrows pointing up or down, trading
screens. People's faces, hands holding phones, office stock-photo scenes. Neon,
dark backgrounds, colour beyond the palette, 3D renders, photorealism, digital
vector polish, cartoon, comic, caricature or childlike doodle styles, mascots,
paper texture or film grain.`,
  prohibited_terms: ['coin', 'coins', 'rocket', 'moon', 'chart', 'candlestick', 'arrow', '₿', '$', 'bull', 'bear', 'lambo'],
  motifs: [
  {
    "key": "ledger",
    "label": "Ledger",
    "description": "Ruled ledger lines, columns, a single highlighted entry",
    "use_when": "Accounting treatment, reporting, disclosure",
    "is_active": true
  },
  {
    "key": "vault",
    "label": "Vault",
    "description": "A simple vault door or strongbox in outline",
    "use_when": "Custody, preservation, security",
    "is_active": true
  },
  {
    "key": "balance",
    "label": "Balance",
    "description": "A two-pan balance scale, level or gently weighted",
    "use_when": "Risk management, trade-offs, policy decisions",
    "is_active": true
  },
  {
    "key": "architecture",
    "label": "Architecture",
    "description": "Columns, foundations, an elevation drawing",
    "use_when": "Treasury structure, governance frameworks",
    "is_active": true
  },
  {
    "key": "timepiece",
    "label": "Timepiece",
    "description": "Hourglass, clock face, long time horizons",
    "use_when": "Time preference, long-term holding, cycles",
    "is_active": true
  },
  {
    "key": "survey",
    "label": "Survey",
    "description": "Contour lines, compass, a surveyed boundary",
    "use_when": "Regulation, navigating unfamiliar ground",
    "is_active": true
  },
  {
    "key": "network",
    "label": "Network",
    "description": "Nodes joined by fine lines, evenly distributed",
    "use_when": "The Bitcoin network, decentralisation, adoption",
    "is_active": true
  },
  {
    "key": "instrument",
    "label": "Instrument",
    "description": "A gauge or measuring instrument, needle at rest",
    "use_when": "Indicators, measurement, monitoring",
    "is_active": true
  },
  {
    "key": "document",
    "label": "Document",
    "description": "Folded papers, a seal, a signed page (no legible text)",
    "use_when": "Policy, standards, legislation, board papers",
    "is_active": true
  },
  {
    "key": "horizon",
    "label": "Horizon",
    "description": "A single landscape line with a low sun or moon-free sky",
    "use_when": "Macro, monetary conditions, the long view",
    "is_active": true
  }
],
  style_anchor_paths: [] as string[],
  default_aspect_ratio: '16:9',
  brand_mark: { enabled: true, position: 'bottom_right', height_pct: 9, margin_pct: 4, opacity: 1 },
};
