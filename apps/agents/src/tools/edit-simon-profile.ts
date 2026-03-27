import { createTool } from '@mastra/core';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';
import { SignalClient } from '@platform/signal';

const client = new SignalClient();
const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const LOG_TAG = '[edit-simon-profile]';

export const editSimonProfile = createTool({
  id: 'edit_simon_profile',
  description: "Update Simon's Signal profile (name, bio, avatar). Requires ALLOW_PROFILE_EDITS=true env var.",
  inputSchema: z.object({
    name: z.string().describe('Signal display name (given name) — always required'),
    about: z.string().max(140).optional().describe('Profile bio / status text (max 140 chars)'),
    avatarPath: z.string().optional().describe('Absolute path to a PNG/JPG image file'),
  }),
  execute: async ({ context }) => {
    const allowProfileEdits = (process.env['ALLOW_PROFILE_EDITS'] ?? '').replace(/^["']|["']$/g, '');
    if (allowProfileEdits !== 'true') {
      console.warn(`${LOG_TAG} Profile edits disabled (ALLOW_PROFILE_EDITS !== 'true')`);
      return {
        success: false,
        updatedFields: [] as string[],
        error: 'Profile edits are disabled. Set ALLOW_PROFILE_EDITS=true to enable.',
      };
    }

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

    // Perform the update
    console.log(`${LOG_TAG} Calling updateProfile:`, JSON.stringify({
      name,
      ...(about !== undefined ? { about } : {}),
      ...(base64Avatar !== undefined ? { avatar: '(base64 omitted)' } : {}),
    }));

    try {
      await client.updateProfile({
        name,
        ...(about !== undefined ? { about } : {}),
        ...(base64Avatar !== undefined ? { base64Avatar } : {}),
      });
    } catch (err) {
      console.error(`${LOG_TAG} updateProfile API call failed:`, err);
      return {
        success: false,
        updatedFields: [] as string[],
        error: `Failed to update profile: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const updatedFields = [
      'name',
      ...(about !== undefined ? ['about'] : []),
      ...(avatarPath ? ['avatar'] : []),
    ];

    console.log(`${LOG_TAG} Profile update complete. Fields: [${updatedFields.join(', ')}]`);

    return {
      success: true,
      updatedFields,
      ...(warnings.length ? { warnings } : {}),
    };
  },
});
