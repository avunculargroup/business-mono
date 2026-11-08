// The canon types, buildImagePrompt and the brief linter live in @platform/shared
// (brandVisual.ts) because the web app previews prompts and pre-lints briefs with
// the same functions. Re-exported here so the image step's imports stay local.
export {
  DEFAULT_BRAND_MARK,
  activeLayouts,
  buildImagePrompt,
  buildPaletteBlock,
  toBrandVisual,
  type BrandMark,
  type BrandVisual,
  type Layout,
  type Motif,
  type PaletteEntry,
} from '@platform/shared';
