/**
 * The live adapter. Domain implementations land one vertical at a time, each
 * composed over a `SupabaseAdapterContext`; `createSupabaseRepositories` arrives
 * with the first of them, since a bundle factory with no domains on it would be
 * scaffolding rather than code.
 */
export {
  createAdapterContext,
  resolveReadContext,
  type PlatformSupabaseClient,
  type SupabaseAdapterContext,
} from './adapterContext';
