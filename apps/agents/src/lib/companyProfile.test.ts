import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import { createFakeSupabase } from '../../test/mocks/supabase.js';

const fake = createFakeSupabase();
vi.mock('@platform/db', () => ({ get supabase() { return fake; } }));

const { loadCompanyIdentity } = await import('./companyProfile.js');

describe('loadCompanyIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.__builders.length = 0;
    fake.__responses.clear();
  });

  it('reads the singleton from company_profile', async () => {
    fake.__setResponse('company_profile', {
      data: {
        legal_name: 'Avuncular Group Pty Ltd',
        trading_name: 'Bitcoin Treasury Solutions',
        abn: '82683088173',
        public_website: 'https://www.bitcointreasurysolutions.com.au',
      },
      error: null,
    });

    const profile = await loadCompanyIdentity();

    expect(profile?.trading_name).toBe('Bitcoin Treasury Solutions');
    expect(profile?.public_website).toBe('https://www.bitcointreasurysolutions.com.au');
    // The table is the point of this test: legal identity moved off
    // company_records in migration 20260916000000, and a reader that drifted
    // back to it would read a type that no longer exists and find nothing.
    expect(fake.from).toHaveBeenCalledWith('company_profile');
    expect(fake.__buildersFor('company_profile')[0]!.__terminalCalls).toContain('maybeSingle');
  });

  it('returns null when nobody has filled the profile in yet', async () => {
    fake.__setResponse('company_profile', { data: null, error: null });
    await expect(loadCompanyIdentity()).resolves.toBeNull();
  });
});
