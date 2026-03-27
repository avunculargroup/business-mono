export const AGENT_REGISTRY: Record<string, { displayName: string; role: string; roleId: string }> = {
  simon:   { displayName: 'Simon',   role: 'Orchestrator',    roleId: 'orchestrator' },
  roger:   { displayName: 'Roger',   role: 'The Recorder',    roleId: 'recorder' },
  archie:  { displayName: 'Archie',  role: 'The Archivist',   roleId: 'archivist' },
  petra:   { displayName: 'Petra',   role: 'The PM',          roleId: 'pm' },
  bruno:   { displayName: 'Bruno',   role: 'The BA',          roleId: 'ba' },
  charlie: { displayName: 'Charlie', role: 'Content Creator', roleId: 'content_creator' },
  rex:     { displayName: 'Rex',     role: 'The Researcher',  roleId: 'researcher' },
};
