// The active brand_visual row as production holds it: the v1.0 seed in
// supabase/migrations/20261108000000_add_brand_visual.sql, updated in place to
// v1.1 by 20261108100000_brand_visual_v1_1.sql, to v1.2 by
// 20261109100000_brand_visual_v1_2.sql and to v1.3 by
// 20261109300000_brand_visual_v1_3.sql. Mirrored here so the image-step tests
// exercise the canon that actually ships. If a migration changes the canon,
// change this too. `motifs` (v1.0) and the inactive v1.1 layouts stay on the
// row because old images reference them.
export const BRAND_VISUAL_ROW = {
  id: 'bv-1',
  version: '1.3',
  is_active: true,
  style_block: `A bold two-colour linocut print, shown as a flat, straight-on scan of the printed
sheet that fills the whole frame: black ink and one flat gold on bright off-white
paper. Strong, simple shapes cut with confidence: solid black masses, crisp white
gouge lines carved through them, visible carving marks, and the slightly uneven
ink texture of hand printing. Gold is a second printed colour laid down in large
flat shapes, not a thin accent. One iconic subject, big and instantly
recognisable, with a silhouette that still reads at thumbnail size. Graphic,
confident and striking, like a classic travel poster or a woodcut book cover.`,
  palette: [
  {
    "role": "Paper",
    "hex": "#FAFAF8",
    "usage": "Bright off-white, unprinted areas clean and even. Not cream, not aged, not yellowed."
  },
  {
    "role": "Ink",
    "hex": "#1A1915",
    "usage": "Solid black printed masses and carved line work."
  },
  {
    "role": "Gold",
    "hex": "#C9A84C",
    "usage": "A flat second printed colour in large shapes. It may cover up to a third of the image."
  }
],
  composition_block: `One subject, and make it big: it fills 60 to 80 percent of the frame height.
Simple and bold enough to recognise in half a second on a phone. Place it
according to the layout below, never small and never lost in empty space. Black
and gold together cover roughly a third to two thirds of the image. Print
full-bleed on the paper: no borders, frames, margins, mounts or black bars. Keep
the bottom-right corner (roughly the lowest and rightmost 15 percent of the
frame) as unprinted paper.`,
  prohibited_block: `Never include: text, letters, numbers, labels, logos, watermarks or signatures.
Coins of any kind, currency symbols, gold bars, piles of money, rockets, moons,
bulls or bears, price charts, candlesticks, arrows pointing up or down, trading
screens. People's faces, hands holding phones, office stock-photo scenes. Neon,
dark backgrounds, colour beyond the palette, 3D renders, photorealism, digital
vector polish, cartoon, comic, caricature or childlike doodle styles, mascots,
paper texture or film grain.
Pencil sketch, fine hatching, construction or guide lines, unfinished drawing.
Photographs, 3D, gradients, airbrushing. Any colour other than black and gold.
Borders, frames, letterboxing or bars.
A photograph of a print: no table, desk or background surface, no visible paper
edges or corners, no perspective or tilt, no shadows or lighting on the paper.`,
  prohibited_terms: ["$", "arrow", "bear", "bull", "candlestick", "chart", "coin", "coins", "lambo", "moon", "rocket", "₿"],
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
    "is_active": false
  },
  {
    "key": "low_horizon",
    "label": "Low horizon",
    "description": "One horizon line in the lower third; the subject is small on it, with wide open paper above.",
    "is_active": false
  },
  {
    "key": "close_detail",
    "label": "Close detail",
    "description": "A tight close-up of one part of an object, running off at least one edge of the frame.",
    "is_active": false
  },
  {
    "key": "small_in_space",
    "label": "Small in space",
    "description": "A small subject placed well off-centre in a large empty field.",
    "is_active": false
  },
  {
    "key": "hero_left",
    "label": "Hero left",
    "description": "The subject is large and sits left of centre, filling most of the frame height; bold open space to the right.",
    "is_active": true
  },
  {
    "key": "close_crop",
    "label": "Close crop",
    "description": "The subject is so close that the frame edges cut it off; it fills the whole frame.",
    "is_active": true
  },
  {
    "key": "diagonal",
    "label": "Diagonal",
    "description": "The subject runs on a strong diagonal from lower left to upper right, top to bottom of the frame.",
    "is_active": true
  },
  {
    "key": "against_gold",
    "label": "Against gold",
    "description": "A large black silhouette set against one big flat gold shape behind it, such as a disc, a band or a field.",
    "is_active": true
  }
],
  style_anchor_paths: [] as string[],
  default_aspect_ratio: '16:9',
  brand_mark: { enabled: true, position: 'bottom_right', height_pct: 9, margin_pct: 4, opacity: 1 },
};
