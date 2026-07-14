import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { SignalClient } from '@platform/signal';
import { createLogger } from '../lib/logger.js';

const client = new SignalClient();
const log = createLogger('get-simon-profile');

export const getSimonProfile = createTool({
  id: 'get_simon_profile',
  description: "Read Simon's current Signal profile state via contacts self-lookup.",
  inputSchema: z.object({}),
  execute: async () => {
    const signalNumber = process.env['SIGNAL_CLI_NUMBER'] ?? '';
    log.info({ signalNumber }, 'fetching profile');

    try {
      const contacts = await client.getContacts();
      const self = contacts.find(c => c.number === signalNumber);

      if (!self) {
        log.warn('self-contact not found in contacts list');
        return {
          success: true,
          found: false,
          message: `Account ${signalNumber} not found in contacts list. Profile state cannot be read via this method.`,
        };
      }

      log.info(
        { profile_name: self.profile_name, profile: self.profile, name: self.name },
        'self-contact found',
      );

      return {
        success: true,
        found: true,
        number: self.number,
        uuid: self.uuid,
        name: self.name,
        profileName: self.profile_name,
        givenName: self.profile?.given_name,
        familyName: self.profile?.lastname,
        about: self.profile?.about,
        hasAvatar: self.profile?.has_avatar,
        lastUpdated: self.profile?.last_updated_timestamp,
      };
    } catch (err) {
      log.error({ err }, 'failed to fetch contacts');
      return {
        success: false,
        error: `Failed to read profile: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
