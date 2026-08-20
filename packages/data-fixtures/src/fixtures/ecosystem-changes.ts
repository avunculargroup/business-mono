import type { EcosystemChange, WatchHealth } from '@platform/data';
import { at, todayAt } from './anchor';
import { DIRECTOR, WATCHED } from './entities';

/**
 * Ecosystem signals.
 *
 * The claim this surface makes is that a change carries a compliance
 * classification from the moment it is detected, not from the moment someone
 * tries to send it to a client. So the set needs both a change the promotion
 * gate lets through and one it refuses — with one showing a classification that
 * has not run, because "unclassified" is a third state and the gate fails
 * closed on it.
 *
 * Nothing here carries a valence. A release is an event, not good news;
 * `severity` is the publisher's own word, which is a fact rather than an
 * opinion.
 */
export function ecosystemChanges(anchor: Date): EcosystemChange[] {
  return [
    {
      // ── Neutral: promotable, so the gate is visibly a gate and not a wall.
      id: 'ch-release',
      changeType: 'release',
      title: `${WATCHED.signingProject.name} 4.2 released`,
      summary:
        'Adds a second confirmation step to the key-rotation flow and deprecates the older backup format.',
      severity: 'minor',
      materiality: 3,
      complianceClass: 'neutral',
      status: 'acknowledged',
      pinned: false,
      clientRelevant: true,
      curatorNote: null,
      occurredAt: todayAt(anchor, 4),
      detectedAt: todayAt(anchor, 8),
      externalUrl: 'https://orrery-signer.example.com/releases/4-2',
      entityName: WATCHED.signingProject.name,
      productServiceId: WATCHED.signingProject.id,
      advisorPartnerId: null,
      productSlug: WATCHED.signingProject.slug,
      advisorSlug: null,
      watchLabel: `${WATCHED.signingProject.name} releases`,
      watchType: 'github_release',
    },
    {
      // ── Compliance-sensitive: the gate refuses this one, with copy that says
      // why. Without a row like this the principle is an annotation pointing at
      // nothing.
      id: 'ch-fees',
      changeType: 'pricing',
      title: `${WATCHED.custodyProvider.name} changed its fee schedule`,
      summary:
        'The published schedule replaced a flat annual fee with a tiered one. The tiers themselves are not stated on the public page.',
      severity: 'major',
      materiality: 4,
      complianceClass: 'general_advice',
      status: 'new',
      pinned: true,
      clientRelevant: false,
      curatorNote:
        'Do not send this out as-is. A fee comparison is a recommendation in everything but name, and we would be making it without knowing what each client is actually on.',
      occurredAt: at(anchor, -2),
      detectedAt: at(anchor, -2),
      externalUrl: null,
      entityName: WATCHED.custodyProvider.name,
      productServiceId: WATCHED.custodyProvider.id,
      advisorPartnerId: null,
      productSlug: WATCHED.custodyProvider.slug,
      advisorSlug: null,
      watchLabel: `${WATCHED.custodyProvider.name} pricing page`,
      watchType: 'page_diff',
    },
    {
      // ── Unclassified: the classifier has not run. Distinct from neutral, and
      // the gate refuses it too. This is the row that proves the gate fails
      // closed rather than treating a missing verdict as an absent objection.
      id: 'ch-unclassified',
      changeType: 'attestation',
      title: `${WATCHED.custodyProvider.name} published a new reserve attestation`,
      summary: 'A scheduled attestation appeared on the provider’s trust page.',
      severity: 'minor',
      materiality: 2,
      complianceClass: null,
      status: 'new',
      pinned: false,
      clientRelevant: false,
      curatorNote: null,
      occurredAt: at(anchor, -4),
      detectedAt: at(anchor, -4),
      externalUrl: 'https://lachlan-vault.example.com/trust/attestations',
      entityName: WATCHED.custodyProvider.name,
      productServiceId: WATCHED.custodyProvider.id,
      advisorPartnerId: null,
      productSlug: WATCHED.custodyProvider.slug,
      advisorSlug: null,
      watchLabel: `${WATCHED.custodyProvider.name} attestations`,
      watchType: 'attestation',
    },
  ];
}

/** Failing first, then stale, then healthy — the order the live view returns. */
export function watchHealth(anchor: Date): WatchHealth[] {
  return [
    {
      id: 'w-attestation',
      label: `${WATCHED.custodyProvider.name} attestations`,
      watchType: 'attestation',
      health: 'failing',
      checkFrequency: 'daily',
      consecutiveFailures: 4,
      lastCheckedAt: at(anchor, -4),
      lastChangeAt: at(anchor, -4),
      daysSinceCheck: 4,
      entityName: WATCHED.custodyProvider.name,
      ownerName: DIRECTOR,
    },
    {
      id: 'w-pricing',
      label: `${WATCHED.custodyProvider.name} pricing page`,
      watchType: 'page_diff',
      health: 'stale',
      checkFrequency: 'daily',
      consecutiveFailures: 0,
      lastCheckedAt: at(anchor, -2),
      lastChangeAt: at(anchor, -2),
      daysSinceCheck: 2,
      entityName: WATCHED.custodyProvider.name,
      ownerName: DIRECTOR,
    },
    {
      id: 'w-releases',
      label: `${WATCHED.signingProject.name} releases`,
      watchType: 'github_release',
      health: 'healthy',
      checkFrequency: 'daily',
      consecutiveFailures: 0,
      lastCheckedAt: todayAt(anchor, 8),
      lastChangeAt: todayAt(anchor, 8),
      daysSinceCheck: 0,
      entityName: WATCHED.signingProject.name,
      ownerName: DIRECTOR,
    },
  ];
}
