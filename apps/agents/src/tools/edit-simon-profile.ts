import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';
import { SignalClient } from '@platform/signal';

const client = new SignalClient();
const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const LOG_TAG = '[edit-simon-profile]';

export const editSimonProfile = createTool({
  id: 'edit_simon_profile',
  description: "Update Simon's Signal profile (name, bio, avatar).",
  inputSchema: z.object({
    name: z.string().describe('Signal display name (given name) — always required'),
    about: z.string().max(140).optional().describe('Profile bio / status text (max 140 chars)'),
    avatarPath: z.string().optional().describe('Absolute path to a PNG/JPG image file'),
  }),
  execute: async (context) => {
    const { name, about, avatarPath } = context;

    console.log(`${LOG_TAG} Starting profile update — fields requested:`, {
      name,
      about: about ?? '(not set)',
      avatarPath: avatarPath ?? '(not set)',
    });

    // Avatar processing
    let base64Avatar: string | undefined;
    const warnings: string[] = [];
    if (avatarPath) {
      if (!existsSync(avatarPath)) {
        return {
          success: false,
          updatedFields: [] as string[],
          error: `Avatar file not found: ${avatarPath}`,
        };
      }
      const ext = extname(avatarPath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        return {
          success: false,
          updatedFields: [] as string[],
          error: `Unsupported avatar format "${ext}". Use PNG or JPG.`,
        };
      }
      const imageBuffer = readFileSync(avatarPath);
      // PNG dimension check: bytes 16–19 are width, 20–23 are height (big-endian uint32)
      if (ext === '.png' && imageBuffer.length > 24) {
        const width = imageBuffer.readUInt32BE(16);
        const height = imageBuffer.readUInt32BE(20);
        if (width !== height || width !== 512) {
          warnings.push(`Avatar is ${width}×${height}px — recommended 512×512px square for best display.`);
          console.warn(`${LOG_TAG} Avatar dimensions: ${width}x${height}px (recommended 512x512)`);
        }
      }
      base64Avatar = imageBuffer.toString('base64');
      console.log(`${LOG_TAG} Avatar encoded: ${imageBuffer.length} bytes from ${avatarPath}`);
    }

    // Verify account is registered in signal-cli before attempting update
    const signalNumber = process.env['SIGNAL_CLI_NUMBER'] ?? '';
    let registeredAccounts: string[] = [];
    try {
      registeredAccounts = await client.getAccounts();
      console.log(`${LOG_TAG} Registered accounts in signal-cli:`, registeredAccounts);
    } catch (err) {
      console.warn(`${LOG_TAG} Could not fetch accounts list (non-fatal):`, err);
    }

    if (registeredAccounts.length > 0 && !registeredAccounts.includes(signalNumber)) {
      console.error(`${LOG_TAG} Account mismatch! SIGNAL_CLI_NUMBER=${signalNumber} not in registered accounts:`, registeredAccounts);
      return {
        success: false,
        updatedFields: [] as string[],
        error: `Account mismatch: SIGNAL_CLI_NUMBER (${signalNumber}) is not registered in signal-cli. Registered accounts: ${registeredAccounts.join(', ')}`,
      };
    }

    // Perform the update
    console.log(`${LOG_TAG} Calling updateProfile:`, JSON.stringify({
      name,
      ...(about !== undefined ? { about } : {}),
      ...(base64Avatar !== undefined ? { avatar: '(base64 omitted)' } : {}),
    }));

    let httpStatus: number;
    try {
      const result = await client.updateProfile({
        name,
        ...(about !== undefined ? { about } : {}),
        ...(base64Avatar !== undefined ? { base64Avatar } : {}),
      });
      httpStatus = result.httpStatus;
      console.log(`${LOG_TAG} updateProfile returned HTTP ${httpStatus}`);
    } catch (err) {
      console.error(`${LOG_TAG} updateProfile API call failed:`, err);
      return {
        success: false,
        updatedFields: [] as string[],
        error: `Failed to update profile: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Verify update via contacts self-lookup
    let verified = false;
    let verificationWarning: string | undefined;
    try {
      const contacts = await client.getContacts();
      const self = contacts.find(c => c.number === signalNumber);
      if (!self) {
        verificationWarning = 'Self-contact not found in contacts list — cannot verify profile state';
        console.warn(`${LOG_TAG} ${verificationWarning}`);
      } else {
        const profileName = self.profile?.given_name ?? self.profile_name ?? self.name;
        if (profileName === name) {
          verified = true;
          console.log(`${LOG_TAG} Verification passed: profile name matches "${name}"`);
        } else {
          verificationWarning = `Profile read-back mismatch: expected "${name}", got "${profileName}"`;
          console.warn(`${LOG_TAG} ${verificationWarning}`);
        }
      }
    } catch (err) {
      verificationWarning = `Could not verify profile update: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`${LOG_TAG} ${verificationWarning}`);
    }

    const updatedFields = [
      'name',
      ...(about !== undefined ? ['about'] : []),
      ...(avatarPath ? ['avatar'] : []),
    ];

    console.log(`${LOG_TAG} Profile update complete. Fields: [${updatedFields.join(', ')}], verified: ${verified}`);

    return {
      success: true,
      httpStatus,
      verified,
      updatedFields,
      registeredAccount: registeredAccounts[0] ?? signalNumber,
      ...(verificationWarning ? { verificationWarning } : {}),
      ...(warnings.length ? { warnings } : {}),
    };
  },
});
