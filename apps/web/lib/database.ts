// Re-export the Database type from the source .ts file directly
// Next.js transpilePackages can resolve this since it compiles workspace packages
export type { Database } from '../../../packages/db/src/types/database';
