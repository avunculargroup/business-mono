// watch_type → adapter. The one place the scan learns what can be watched.
//
// A watch_type with no adapter registered is not an error state to log loudly:
// the DB CHECK admits all eight types, and the remaining ones land in later
// phases. The scan skips them and says so on the watch.

import type { EcosystemAdapter } from './types.js';
import { githubReleaseAdapter } from './adapters/githubRelease.js';
import { attestationAdapter } from './adapters/attestation.js';

const ADAPTERS: EcosystemAdapter[] = [githubReleaseAdapter, attestationAdapter];

const BY_TYPE = new Map(ADAPTERS.map((adapter) => [adapter.watchType, adapter]));

export function adapterFor(watchType: string): EcosystemAdapter | undefined {
  return BY_TYPE.get(watchType);
}

export function implementedWatchTypes(): string[] {
  return [...BY_TYPE.keys()];
}
