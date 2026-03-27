import { createTool } from '@mastra/core';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';
import { SignalClient, type ProfileInfo } from '@platform/signal';

const client = new SignalClient();
const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const LOG_TAG = '[edit-simon-profile]';

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
      console.warn(`${LOG_TAG} Profile edits disabled (ALLOW_PROFILE_EDITS !== 'true')`);
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

    console.log(`${LOG_TAG} Starting profile update — fields requested:`, {
      name: name ?? '(not set)',
      familyName: familyName ?? '(not set)',
      about: about ?? '(not set)',
      aboutEmoji: aboutEmoji ?? '(not set)',
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

    // Signal API requires name even for partial updates — fetch current if not provided
    let resolvedName = name;
    let profileBefore: ProfileInfo | undefined;
    if (!resolvedName) {
      try {
        profileBefore = await client.getProfile();
        resolvedName = profileBefore.name ?? '';
        console.log(`${LOG_TAG} Fetched current profile for name fallback:`, JSON.stringify(profileBefore));
      } catch (err) {
        console.error(`${LOG_TAG} Failed to fetch current profile for name fallback:`, err);
        return {
          success: false,
          updatedFields: [] as string[],
          error: 'Could not fetch current profile to resolve name. Provide name explicitly or retry later.',
        };
      }
    } else {
      // Fetch before-snapshot for comparison even when name is provided
      try {
        profileBefore = await client.getProfile();
        console.log(`${LOG_TAG} Profile before update:`, JSON.stringify(profileBefore));
      } catch (err) {
        console.warn(`${LOG_TAG} Could not fetch profile snapshot before update (proceeding anyway):`, err);
      }
    }

    // Perform the update
    console.log(`${LOG_TAG} Calling updateProfile:`, JSON.stringify({
      name: resolvedName,
      ...(familyName !== undefined ? { familyName } : {}),
      ...(about !== undefined ? { about } : {}),
      ...(aboutEmoji !== undefined ? { aboutEmoji } : {}),
      ...(base64Avatar !== undefined ? { avatar: '(base64 omitted)' } : {}),
    }));

    try {
      await client.updateProfile({
        name: resolvedName,
        ...(familyName !== undefined ? { familyName } : {}),
        ...(about !== undefined ? { about } : {}),
        ...(aboutEmoji !== undefined ? { aboutEmoji } : {}),
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

    // Post-update verification
    let profileAfter: ProfileInfo | undefined;
    const verificationWarnings: string[] = [];
    try {
      profileAfter = await client.getProfile();
      console.log(`${LOG_TAG} Profile after update:`, JSON.stringify(profileAfter));

      // Verify each field that was explicitly updated
      if (name && profileAfter.name !== name) {
        verificationWarnings.push(`name: expected "${name}", got "${profileAfter.name}"`);
      }
      if (familyName !== undefined && profileAfter.familyName !== familyName) {
        verificationWarnings.push(`familyName: expected "${familyName}", got "${profileAfter.familyName}"`);
      }
      if (about !== undefined && profileAfter.about !== about) {
        verificationWarnings.push(`about: expected "${about}", got "${profileAfter.about}"`);
      }
      if (aboutEmoji !== undefined && profileAfter.aboutEmoji !== aboutEmoji) {
        verificationWarnings.push(`aboutEmoji: expected "${aboutEmoji}", got "${profileAfter.aboutEmoji}"`);
      }

      if (verificationWarnings.length > 0) {
        console.warn(`${LOG_TAG} Verification mismatches:`, verificationWarnings);
      }
    } catch (err) {
      console.warn(`${LOG_TAG} Post-update verification fetch failed (update may have succeeded):`, err);
      verificationWarnings.push('Could not verify update — post-update profile fetch failed.');
    }

    const updatedFields = [
      ...(name ? ['name'] : []),
      ...(familyName !== undefined ? ['familyName'] : []),
      ...(about !== undefined ? ['about'] : []),
      ...(aboutEmoji !== undefined ? ['aboutEmoji'] : []),
      ...(avatarPath ? ['avatar'] : []),
    ];

    const allWarnings = [...warnings, ...verificationWarnings];
    const verified = verificationWarnings.length === 0 && profileAfter !== undefined;

    console.log(`${LOG_TAG} Profile update complete. Fields: [${updatedFields.join(', ')}], verified: ${verified}`);

    return {
      success: true,
      updatedFields,
      ...(profileBefore ? { before: profileBefore } : {}),
      ...(profileAfter ? { after: profileAfter } : {}),
      verified,
      ...(allWarnings.length ? { warnings: allWarnings } : {}),
    };
  },
});
