import type { ArtefactType, ClientWriteRepository, Fact } from '@platform/data';
import type { Json } from '@platform/db';
import type { ClientAdapterContext } from './context';

/**
 * The entire write surface of `apps/client`.
 *
 * Two methods. Neither accepts free text, and neither can be given any: the
 * tables behind them have no column a sentence could land in. That is the
 * general advice boundary expressed as a schema rather than as a rule anyone
 * has to remember.
 *
 * If a third method appears here, the question to ask is not "is this write
 * safe" but "is the boundary still architectural". It stops being architectural
 * the moment the answer depends on reviewing the caller.
 */
export function createClientWriteRepository(
  adapter: ClientAdapterContext,
): ClientWriteRepository {
  return {
    async acknowledgeDisclosure(input): Promise<void> {
      const { error } = await adapter.client.from('client_disclosures').insert({
        client_user_id: adapter.principal.userId,
        document_id: input.documentId,
        // Denormalised deliberately: versions get superseded, and the audit
        // trail has to say which text was on screen when the box was ticked.
        document_version: input.documentVersion,
        ...(input.ipAddress ? { ip_address: input.ipAddress } : {}),
      });

      // A repeat acknowledgement of a version already acknowledged is not an
      // error — a double-submit, a second tab. The unique index makes it a
      // no-op and the gate is already satisfied, so swallowing 23505 here is
      // correct rather than lenient.
      if (error && error.code !== '23505') throw error;
    },

    async recordGeneration(input: {
      templateId: string;
      templateVersion: string;
      artefactType: ArtefactType;
      factSnapshot: Fact[];
      event: 'created' | 'facts_refreshed' | 'exported';
    }): Promise<void> {
      const { error } = await adapter.client.from('prepare_generations').insert({
        account_id: adapter.principal.accountId,
        template_id: input.templateId,
        template_version: input.templateVersion,
        artefact_type: input.artefactType,
        // BTS's own market data, not the client's circumstances. What went out,
        // so that a template later found wrong can be traced to who received it
        // and what was current when they did.
        // Fact[] is structurally JSON but TypeScript will not widen a typed
        // interface to the Json index signature. The cast is the assertion that
        // a Fact holds only strings, which its own type already guarantees.
        fact_snapshot: input.factSnapshot as unknown as Json,
        event: input.event,
      });

      if (error) throw error;
    },
  };
}
