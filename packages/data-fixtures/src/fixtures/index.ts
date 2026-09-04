/**
 * The fixture set.
 *
 * Curated for the screens, not for realism. Every row exists to make one
 * architectural claim legible in a few seconds — the staging table at
 * [`fixture-and-trace-schema.md` § Narrative staging](../../../../docs/features/demo-app/fixture-and-trace-schema.md#narrative-staging)
 * says which claim each one carries. A plausible-but-flat dataset is the most
 * common way a portfolio demo fails: everything works and nothing is
 * interesting.
 *
 * Every file here is typed against the read model it feeds, so a field added in
 * `apps/web` breaks this package's build. That is the drift alarm working.
 *
 * Rules the whole set is written under — entity naming, copyright, and the
 * no-allocation-figures rule — are documented in `entities.ts` and enforced by
 * `content.test.ts`.
 */
export { agentActivity } from './agent-activity';
export { companies, companyContacts } from './companies';
export { contentCards, contentDetails, publishGates } from './content-items';
export {
  researchAbsences,
  researchCompanies,
  researchCompanyDocuments,
  researchDocuments,
  researchJurisdictionNotes,
  researchLedger,
  researchPositions,
  researchRegister,
} from './corporate-holdings';
export { ecosystemChanges, watchHealth } from './ecosystem-changes';
export { indicators } from './indicators';
export { marketReports } from './market-reports';
export { newsFeed, newsItems } from './research-items';
