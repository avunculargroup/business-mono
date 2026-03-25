import { createTool } from '@mastra/core';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';
import { SignalClient } from '@platform/signal';

const client = new SignalClient();
const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

export const editSimonProfile = createTool({
  id: 'edit_simon_profile',
  description: "Update Simon's Signal profile (name, bio, emoji, avatar). Requires ALLOW_PROFILE_EDITS=true env var.",
  inputSchema: z.object({
    name: z.string().optional().describe('Signal display name (given name)'),
    familyName: z.string().optional().describe('Family name (optional)'),
    about: z.string().max(140).optional().describe('Profile bio / status text (max 140 chars)'),
    aboutEmoji: z.string().optional().describe('Single emoji shown alongside bio'),
    avatarPath: z.string().optional().describe('Absolute path to a PNG/JPG image file'),
  }),
  execute: async ({ context }) => {
    if (process.env['ALLOW_PROFILE_EDITS'] !== 'true') {
      return {
        success: false,
        updatedFields: [] as string[],
        error: 'Profile edits are disabled. Set ALLOW_PROFILE_EDITS=true to enable.',
      };
    }

    const { name, familyName, about, aboutEmoji, avatarPath } = context;
    if (!name && !familyName && !about && !aboutEmoji && !avatarPath) {
      return {
        success: false,
        updatedFields: [] as string[],
        error: 'At least one field must be provided.',
      };
    }

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
        }
      }
      base64Avatar = imageBuffer.toString('base64');
    }

    // Signal API requires name even for partial updates — fetch current if not provided
    let resolvedName = name;
    if (!resolvedName) {
      try {
        const current = await client.getProfile();
        resolvedName = current.name ?? '';
      } catch {
        resolvedName = '';
      }
    }

    await client.updateProfile({
      name: resolvedName,
      ...(familyName !== undefined ? { familyName } : {}),
      ...(about !== undefined ? { about } : {}),
      ...(aboutEmoji !== undefined ? { aboutEmoji } : {}),
      ...(base64Avatar !== undefined ? { base64Avatar } : {}),
    });

    const updatedFields = [
      ...(name ? ['name'] : []),
      ...(familyName !== undefined ? ['familyName'] : []),
      ...(about !== undefined ? ['about'] : []),
      ...(aboutEmoji !== undefined ? ['aboutEmoji'] : []),
      ...(avatarPath ? ['avatar'] : []),
    ];

    return {
      success: true,
      updatedFields,
      ...(warnings.length ? { warnings } : {}),
    };
  },
});
