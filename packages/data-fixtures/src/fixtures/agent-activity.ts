import type { AgentActivityItem } from '@platform/data';
import { at, todayAt } from './anchor';
import { COMPANIES, CONTACTS } from './entities';

/**
 * The agent activity log.
 *
 * Two rows carry the staging weight: a scheduled run that found nothing and
 * logged anyway, and a run stopped at the approval wall with its proposed
 * actions visible. The first shows that absence of output is recorded rather
 * than silent; the second shows what a proposal actually contains, which is the
 * thing "human-in-the-loop" usually means without demonstrating.
 *
 * Specialists never message a human. Every row here is either Simon relaying,
 * a specialist writing to the database, or a specialist waiting for a director
 * to decide.
 */
export function agentActivity(anchor: Date): AgentActivityItem[] {
  return [
    {
      // ── The approval wall. Three proposed actions, each a concrete write.
      id: 'act-approval',
      agentName: 'della',
      action: `Log the ${COMPANIES.kestrel.name} call and propose follow-ups`,
      status: 'pending',
      triggerType: 'webhook',
      createdAt: todayAt(anchor, 9),
      entityType: 'interaction',
      entityId: 'int-kestrel-call',
      proposedActions: [
        {
          type: 'create_task',
          label: `Send ${CONTACTS.halloway.firstName} the custody procedure summary before Thursday`,
        },
        {
          type: 'update_contact',
          label: `Move ${CONTACTS.okonkwo.firstName} ${CONTACTS.okonkwo.lastName} to qualified — she ran the second half of the call`,
        },
        {
          type: 'create_task',
          label: 'Draft the board-paper section on custody arrangements',
        },
      ],
      approvedResponse: null,
      workflowRunId: 'run-recorder-kestrel',
    },
    {
      // ── The quiet run. Scheduled, found nothing, logged it.
      id: 'act-quiet',
      agentName: 'rex',
      action: 'Scan monitored research sources',
      status: 'auto',
      triggerType: 'schedule',
      createdAt: todayAt(anchor, 6),
      entityType: null,
      entityId: null,
      // Empty, deliberately. The run happened, it found nothing above the
      // relevance floor, and the record of having looked is the point.
      proposedActions: [],
      approvedResponse: null,
      workflowRunId: null,
    },
    {
      id: 'act-approved',
      agentName: 'charlie',
      action: 'Draft a post on the custody post-mortem',
      status: 'approved',
      triggerType: 'manual',
      createdAt: at(anchor, -1),
      entityType: 'content_item',
      entityId: 'cnt-custody-draft',
      proposedActions: [{ type: 'create', label: 'Create a LinkedIn draft' }],
      approvedResponse: 'Yes, go ahead — keep it to what the post-mortem actually says.',
      workflowRunId: null,
    },
    {
      // ── A rejection, so "pending" is visibly a real decision and not a
      // formality that always resolves one way.
      id: 'act-rejected',
      agentName: 'petra',
      action: `Open a project for the ${COMPANIES.marrowbone.name} scoping work`,
      status: 'rejected',
      triggerType: 'schedule',
      createdAt: at(anchor, -2),
      entityType: null,
      entityId: null,
      proposedActions: [{ type: 'create_project', label: 'Create project: scoping engagement' }],
      approvedResponse: 'Not yet. Nothing is signed and a project would put it on the board as though it were.',
      workflowRunId: null,
    },
    {
      // ── The error path. Agents fail, and the failure is a logged row rather
      // than a gap in the timeline.
      id: 'act-error',
      agentName: 'simon',
      action: 'Compile the morning briefing',
      status: 'error',
      triggerType: 'schedule',
      createdAt: at(anchor, -3),
      entityType: null,
      entityId: null,
      proposedActions: [],
      approvedResponse: null,
      workflowRunId: 'run-briefing-failed',
    },
    {
      id: 'act-in-progress',
      agentName: 'archie',
      action: 'Embed the promoted custody post-mortem into the knowledge base',
      status: 'in_progress',
      triggerType: 'event',
      createdAt: at(anchor, -3),
      entityType: 'knowledge_item',
      entityId: 'kn-custody-post-mortem',
      proposedActions: [],
      approvedResponse: null,
      workflowRunId: null,
    },
  ];
}
