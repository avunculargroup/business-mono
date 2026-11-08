import { describe, it, expect, vi } from 'vitest';
import { buildImageRequest, generateImage, ImageApiError, parseImageResponse } from './openrouterImage.js';

const PNG_B64 = Buffer.from('fake-png').toString('base64');

function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buildImageRequest', () => {
  it('builds a prompt-only body with n = 1', () => {
    expect(buildImageRequest({ model: 'm', prompt: 'p', aspectRatio: '16:9' })).toEqual({
      model: 'm',
      prompt: 'p',
      aspect_ratio: '16:9',
      n: 1,
    });
  });

  it('sends at most four reference images as input_references', () => {
    const body = buildImageRequest({ model: 'm', prompt: 'p', aspectRatio: '16:9', referenceUrls: ['a', 'b', 'c', 'd', 'e'] });
    expect(body.input_references).toEqual(['a', 'b', 'c', 'd'].map((url) => ({ type: 'image_url', image_url: { url } })));
  });
});

describe('parseImageResponse', () => {
  it('decodes b64_json and reads cost and id', () => {
    const parsed = parseImageResponse({ id: 'gen-1', data: [{ b64_json: PNG_B64, media_type: 'image/png' }], usage: { cost: 0.04 } });
    expect(parsed.image.toString()).toBe('fake-png');
    expect(parsed).toMatchObject({ mediaType: 'image/png', costUsd: 0.04, generationRef: 'gen-1' });
  });

  it('throws when there is no image', () => {
    expect(() => parseImageResponse({ data: [] })).toThrow(/no image/);
  });
});

describe('generateImage', () => {
  const params = { model: 'm', prompt: 'p', aspectRatio: '16:9' };

  it('posts with a bearer key and returns the image', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { data: [{ b64_json: PNG_B64 }] }));
    const out = await generateImage(params, { apiKey: 'k', fetchImpl });
    expect(out.referencesDropped).toBe(false);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/images');
    expect(init.headers.Authorization).toBe('Bearer k');
  });

  it('retries prompt-only once when references were rejected with a 400', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(400, 'input_references not supported'))
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ b64_json: PNG_B64 }] }));
    const out = await generateImage({ ...params, referenceUrls: ['a'] }, { apiKey: 'k', fetchImpl });
    expect(out.referencesDropped).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[1]![1].body)).not.toHaveProperty('input_references');
  });

  it('does not retry a 400 that had no references, or any other error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(400, 'bad aspect'));
    await expect(generateImage(params, { apiKey: 'k', fetchImpl })).rejects.toBeInstanceOf(ImageApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const fetch500 = vi.fn().mockResolvedValue(jsonResponse(500, 'down'));
    await expect(generateImage({ ...params, referenceUrls: ['a'] }, { apiKey: 'k', fetchImpl: fetch500 })).rejects.toThrow(/500/);
    expect(fetch500).toHaveBeenCalledTimes(1);
  });

  it('reports a timeout without retrying', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    await expect(generateImage(params, { apiKey: 'k', fetchImpl, timeoutMs: 1000 })).rejects.toThrow(/timed out after 1s/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
