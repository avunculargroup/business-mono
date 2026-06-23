import { describe, it, expect } from 'vitest';
import { buildBeatRows } from './persist.js';
import type { PlannedBeat } from './schemas.js';

const beats: PlannedBeat[] = [
  {
    title: 'Volatility vs risk',
    core_message: 'A treasury horizon changes how volatility should be read.',
    rationale: 'Reframes the first objection.',
    prefer_thread: true,
  },
  {
    title: '',
    core_message: 'AU regulatory clarity is further along than people think.',
    rationale: '',
    prefer_thread: false,
  },
];

describe('buildBeatRows', () => {
  it('maps beats to rows with 1-based sequence and planned status', () => {
    const rows = buildBeatRows('camp-1', beats);
    expect(rows).toEqual([
      {
        campaign_id: 'camp-1',
        sequence: 1,
        title: 'Volatility vs risk',
        core_message: 'A treasury horizon changes how volatility should be read.',
        rationale: 'Reframes the first objection.',
        prefer_thread: true,
        status: 'planned',
      },
      {
        campaign_id: 'camp-1',
        sequence: 2,
        title: null,
        core_message: 'AU regulatory clarity is further along than people think.',
        rationale: null,
        prefer_thread: false,
        status: 'planned',
      },
    ]);
  });
});
