import { describeContentImagesContract } from '@platform/data/testing';
import type { DemoDomain } from '@platform/data';
import { createFixtureRepositories } from '../bundle';

// The fixture draft carries a candidate set whose newest row is unselected, and
// a removed image from an earlier run: see contentImageRows in fixtures.
describeContentImagesContract<DemoDomain>({
  name: 'fixtures',
  createBundle: () => createFixtureRepositories(),
  draftId: 'cnt-flagged',
  selectedGroupId: 'grp-pier',
});
