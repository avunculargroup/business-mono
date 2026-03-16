import { Mastra } from '@mastra/core';
import { simon } from '../agents/simon/index.js';
import { archivist } from '../agents/archivist/index.js';
import { ba } from '../agents/ba/index.js';
import { contentCreator } from '../agents/contentCreator/index.js';
import { recorderWorkflow } from '../agents/recorder/workflow.js';
import { pmWorkflow } from '../agents/pm/workflow.js';

export const mastra = new Mastra({
  agents: {
    simon,
    archivist,
    ba,
    contentCreator,
  },
  workflows: {
    recorder: recorderWorkflow,
    pm: pmWorkflow,
  },
});
