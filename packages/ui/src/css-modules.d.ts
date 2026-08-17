/**
 * CSS Module type declarations.
 *
 * `apps/web` gets these implicitly from `next-env.d.ts`, which pulls in Next's global
 * types. This package is consumed through `transpilePackages` rather than being built
 * by Next, so it needs its own declaration or every `import styles from './X.module.css'`
 * fails to typecheck.
 *
 * Deliberately untyped keys: generating per-file class-name types would need a build
 * step, and the components here already reference classes that are checked at runtime by
 * the component tests.
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
