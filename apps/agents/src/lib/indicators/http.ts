/**
 * The User-Agent every indicator adapter sends.
 *
 * ABS documents that a request without one can be refused with a 403 or
 * "Missing Authentication Token", and the RBA, Stooq and Gold API adapters sent
 * this string each in their own copy before the SDMX adapters needed it too.
 */
export const INDICATOR_USER_AGENT = 'BTS-platform/1.0 (economic-indicators)';
