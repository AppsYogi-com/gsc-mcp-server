/**
 * Package version, injected from package.json at build time (see tsup.config.ts).
 */
declare const __PKG_VERSION__: string;

export const VERSION: string = __PKG_VERSION__;
