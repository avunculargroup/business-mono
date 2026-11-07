// Thin client for OpenRouter's Image API (POST /api/v1/images). The request
// builder and response parser are pure; the fetch is separate and injectable.
//
// Field names (from OpenRouter's Image API docs, Nov 2026): request `model`,
// `prompt`, `aspect_ratio`, `n`, and `input_references` as
// [{ type: 'image_url', image_url: { url } }]; response `data[].b64_json`,
// `data[].media_type`, `usage.cost`, and an `id` where the provider returns one.
//
// Billing is all-or-nothing, so a failed call costs nothing. There is no retry
// on timeout; the one retry here is prompt-only after a 400 when reference
// images were sent, because an endpoint without reference support rejects the
// whole request rather than ignoring the field.

const IMAGES_URL = 'https://openrouter.ai/api/v1/images';
/** Generations of about 90 s have been observed for high-quality 16:9 renders. */
export const IMAGE_TIMEOUT_MS = 120_000;
/** At most this many style anchors are sent per call. */
export const MAX_REFERENCE_IMAGES = 4;

export interface ImageRequestParams {
  model: string;
  prompt: string;
  aspectRatio: string;
  referenceUrls?: string[];
}

export interface ImageRequestBody {
  model: string;
  prompt: string;
  aspect_ratio: string;
  n: 1;
  input_references?: Array<{ type: 'image_url'; image_url: { url: string } }>;
}

export function buildImageRequest(p: ImageRequestParams): ImageRequestBody {
  const body: ImageRequestBody = { model: p.model, prompt: p.prompt, aspect_ratio: p.aspectRatio, n: 1 };
  const refs = (p.referenceUrls ?? []).slice(0, MAX_REFERENCE_IMAGES);
  if (refs.length > 0) {
    body.input_references = refs.map((url) => ({ type: 'image_url', image_url: { url } }));
  }
  return body;
}

export interface ParsedImage {
  image: Buffer;
  mediaType: string | null;
  costUsd: number | null;
  generationRef: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

/** Parse a 2xx response body. Throws when it carries no image. */
export function parseImageResponse(json: unknown): ParsedImage {
  const body = (json ?? {}) as Json;
  const first = Array.isArray(body['data']) ? (body['data'][0] as Json | undefined) : undefined;
  const b64 = typeof first?.['b64_json'] === 'string' ? first['b64_json'] : null;
  if (!b64) throw new Error('Image API response carried no image data.');
  const cost = body['usage']?.['cost'];
  return {
    image: Buffer.from(b64, 'base64'),
    mediaType: typeof first?.['media_type'] === 'string' ? first['media_type'] : null,
    costUsd: typeof cost === 'number' && Number.isFinite(cost) ? cost : null,
    generationRef: typeof body['id'] === 'string' ? body['id'] : null,
  };
}

export class ImageApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ImageApiError';
  }
}

export interface GenerateImageOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface GeneratedImage extends ParsedImage {
  /** True when reference images were sent, rejected, and the render ran prompt-only. */
  referencesDropped: boolean;
}

async function post(body: ImageRequestBody, opts: GenerateImageOptions): Promise<ParsedImage> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(IMAGES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? IMAGE_TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ImageApiError(`Image render timed out after ${(opts.timeoutMs ?? IMAGE_TIMEOUT_MS) / 1000}s.`, null);
    }
    throw new ImageApiError(`Image API request failed: ${err instanceof Error ? err.message : String(err)}`, null);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ImageApiError(`Image API returned ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  return parseImageResponse(await res.json());
}

/** Render one image. Throws ImageApiError on any failure. */
export async function generateImage(params: ImageRequestParams, opts: GenerateImageOptions): Promise<GeneratedImage> {
  const body = buildImageRequest(params);
  try {
    return { ...(await post(body, opts)), referencesDropped: false };
  } catch (err) {
    if (body.input_references && err instanceof ImageApiError && err.status === 400) {
      const { input_references: _dropped, ...promptOnly } = body;
      return { ...(await post(promptOnly, opts)), referencesDropped: true };
    }
    throw err;
  }
}
