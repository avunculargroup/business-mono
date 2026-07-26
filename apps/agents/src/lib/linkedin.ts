/**
 * LinkedIn Posts API client.
 *
 * Text-only posting via the versioned REST Posts API. The caller supplies
 * the OAuth access token and author URN (urn:li:person:… for founders,
 * urn:li:organization:… for the company page) from social_credentials.
 * Spec: docs/features/linkedin-posting/feature-spec.md
 */

import { createLogger } from './logger.js';

const log = createLogger('linkedin');

const POSTS_URL = 'https://api.linkedin.com/rest/posts';

// Bump deliberately (LinkedIn retires versions after ~1 year); keep in sync
// with the version the app is approved against in the developer portal.
export const LINKEDIN_VERSION = '202506';

// The commentary field uses LinkedIn's "Little Text Format": these characters
// are reserved and must be backslash-escaped to render literally.
const LTF_RESERVED = /[\\|{}@[\]()<>#*_~]/g;

export function escapeLinkedInText(text: string): string {
  return text.replace(LTF_RESERVED, (ch) => `\\${ch}`);
}

export function linkedInPostUrl(postUrn: string): string {
  return `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}`;
}

export class LinkedInAuthError extends Error {
  constructor(authorUrn: string) {
    super(`LinkedIn auth failed for ${authorUrn}: 401 Unauthorized`);
    this.name = 'LinkedInAuthError';
  }
}

export interface CreatePostInput {
  accessToken: string;
  authorUrn: string;
  text: string;
}

export async function createLinkedInPost({
  accessToken,
  authorUrn,
  text,
}: CreatePostInput): Promise<{ postUrn: string }> {
  const res = await fetch(POSTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Linkedin-Version': LINKEDIN_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      commentary: escapeLinkedInText(text),
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  });

  if (res.status === 401) throw new LinkedInAuthError(authorUrn);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log.error({ status: res.status, body: body.slice(0, 500), authorUrn }, 'post creation failed');
    throw new Error(`LinkedIn post failed: ${res.status}`);
  }

  // The created post URN comes back in the x-restli-id header (201, no body).
  const postUrn = res.headers.get('x-restli-id');
  if (!postUrn) {
    throw new Error('LinkedIn post succeeded but no x-restli-id header returned');
  }
  log.info({ authorUrn, postUrn }, 'post created');
  return { postUrn };
}
