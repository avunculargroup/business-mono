import type { AgentActivityItem } from '@platform/data';

// This page is converted in vertical 4.11; until then it still queries
// `agent_activity` directly and maps rows at the boundary, because the card it
// feeds now takes the read model. See docs/features/demo-app/build-progress.md.
export type AgentActivity = AgentActivityItem;
