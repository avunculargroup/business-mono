// The active brand_visual row as production holds it: the v1.0 seed in
// supabase/migrations/20261108000000_add_brand_visual.sql, updated in place to
// v1.1 by 20261108100000_brand_visual_v1_1.sql. Mirrored here so the image-step
// tests exercise the canon that actually ships. If either migration changes the
// canon, change this too. `motifs` is v1.0's retired list, kept on the row.
export const BRAND_VISUAL_ROW = {
  id: 'bv-1',
  version: '1.1',
  is_active: true,
  style_block: `A hand-drawn sketch in graphite pencil and fine ink on bright, fresh cartridge
paper. Every drawing is deliberately unfinished. The part of the subject that is
known or certain is drawn in full: confident line, light cross-hatching, and the
single gold accent. The part that is uncertain, unbuilt or unknown is left as
faint construction lines only: guidelines, measured marks, an outline that stops
partway. The edge where finished drawing gives way to construction lines is the
point of the picture. It should look like an architect's working sketch, drawn by
a skilled hand to think something through, not to decorate. Considered and
quietly confident, with a clear point of view.`,
  palette: [
  {
    "role": "Paper",
    "hex": "#FAFAF8",
    "usage": "Bright near-white paper. Not cream, not aged, not yellowed, not parchment. Clean and even."
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
  composition_block: `Follow the layout given below exactly. Never centre a single upright object in a
wide frame. Prefer subjects with a horizontal extent that suit a landscape frame.
Keep every important element inside the central 80% of the frame. Leave the
bottom-right corner (roughly the lowest and rightmost 15% of the frame) as empty
paper.`,
  prohibited_block: `Never include: text, letters, numbers, labels, logos, watermarks or signatures.
Coins of any kind, currency symbols, gold bars, piles of money, rockets, moons,
bulls or bears, price charts, candlesticks, arrows pointing up or down, trading
screens. People's faces, hands holding phones, office stock-photo scenes. Neon,
dark backgrounds, colour beyond the palette, 3D renders, photorealism, digital
vector polish, cartoon, comic, caricature or childlike doodle styles, mascots,
paper texture or film grain.`,
  prohibited_terms: ["$", "arrow", "balance scale", "bear", "bull", "calendar", "candlestick", "chart", "chess", "chessboard", "clock", "coin", "coins", "compass", "crossroads", "hourglass", "jigsaw", "key", "keyhole", "ladder", "lambo", "light bulb", "lightbulb", "moon", "mountain peak", "padlock", "piggy bank", "puzzle", "rocket", "safe", "scales", "signpost", "stopwatch", "summit", "umbrella", "vault door", "₿"],
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
  layouts: [
  {
    "key": "left_third",
    "label": "Left third",
    "description": "Subject sits in the left third; open paper runs to the right, so the eye travels into space.",
    "is_active": true
  },
  {
    "key": "low_horizon",
    "label": "Low horizon",
    "description": "One horizon line in the lower third; the subject is small on it, with wide open paper above.",
    "is_active": true
  },
  {
    "key": "close_detail",
    "label": "Close detail",
    "description": "A tight close-up of one part of an object, running off at least one edge of the frame.",
    "is_active": true
  },
  {
    "key": "small_in_space",
    "label": "Small in space",
    "description": "A small subject placed well off-centre in a large empty field.",
    "is_active": true
  }
],
  style_anchor_paths: [] as string[],
  default_aspect_ratio: '16:9',
  brand_mark: { enabled: true, position: 'bottom_right', height_pct: 9, margin_pct: 4, opacity: 1 },
};
