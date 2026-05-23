import { describe, it, expect, vi } from 'vitest';

const create = vi.fn();
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: { create },
  })),
}));

const { generateEmbedding } = await import('./openai.js');

describe('generateEmbedding tool', () => {
  it('calls OpenAI with the expected model + dimensions and returns the vector', async () => {
    const embedding = new Array(1536).fill(0).map((_, i) => i / 1536);
    create.mockResolvedValueOnce({ data: [{ embedding }] });

    const result = await generateEmbedding.execute!(
      { text: 'hello world' } as never,
      {} as never,
    );

    expect(create).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: 'hello world',
      dimensions: 1536,
    });
    expect(result).toEqual({ embedding });
    expect((result as { embedding: number[] }).embedding).toHaveLength(1536);
  });

  it('returns an empty array when OpenAI returns no data', async () => {
    create.mockResolvedValueOnce({ data: [] });
    const result = await generateEmbedding.execute!(
      { text: 'x' } as never,
      {} as never,
    );
    expect(result).toEqual({ embedding: [] });
  });
});
