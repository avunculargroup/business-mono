import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { SignalClient } from '@platform/signal';

const client = new SignalClient();
const LOG_TAG = '[get-simon-profile]';

export const getSimonProfile = createTool({
  id: 'get_simon_profile',
  description: "Read Simon's current Signal profile state via contacts self-lookup.",
  inputSchema: z.object({}),
  execute: async () => {
    const signalNumber = process.env['SIGNAL_CLI_NUMBER'] ?? '';
    console.log(`${LOG_TAG} Fetching profile for ${signalNumber}`);

    try {
      const contacts = await client.getContacts();
      const self = contacts.find(c => c.number === signalNumber);

      if (!self) {
        console.warn(`${LOG_TAG} Self-contact not found in contacts list`);
        return {
          success: true,
          found: false,
          message: `Account ${signalNumber} not found in contacts list. Profile state cannot be read via this method.`,
        };
      }

      console.log(`${LOG_TAG} Self-contact found:`, JSON.stringify({
        profile_name: self.profile_name,
        profile: self.profile,
        name: self.name,
      }));

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
      console.error(`${LOG_TAG} Failed to fetch contacts:`, err);
      return {
        success: false,
        error: `Failed to read profile: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
