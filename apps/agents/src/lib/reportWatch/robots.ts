/**
 * robots.txt, fetched once per host per run.
 *
 * Being a well-behaved crawler is cheaper than being blocked: a publisher who
 * blackholes our IP costs us the source permanently, whereas honouring their
 * Disallow costs us the handful of URLs they did not want crawled anyway.
 *
 * A robots.txt we cannot fetch is treated as PERMISSIVE, not restrictive. A 404
 * genuinely means "no restrictions"; a 500 or a timeout means we do not know,
 * and refusing to crawl on an unknown would let one flaky request silently stop
 * a source from ever ingesting again — the exact silent-failure mode this
 * feature is built to make visible.
 */

import robotsParser from 'robots-parser';
import { fetchText, REPORT_USER_AGENT } from './http.js';

type Robots = ReturnType<typeof robotsParser>;

export class RobotsCache {
  private readonly byHost = new Map<string, Robots | null>();

  /** Whether `url` may be fetched. Unknown/unfetchable robots.txt → allowed. */
  async isAllowed(url: string): Promise<boolean> {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      return false;   // an unparseable URL is not fetchable in any case
    }

    if (!this.byHost.has(origin)) {
      const robotsUrl = `${origin}/robots.txt`;
      const result = await fetchText(robotsUrl, { Accept: 'text/plain' });
      this.byHost.set(origin, result.ok ? robotsParser(robotsUrl, result.body) : null);
    }

    const robots = this.byHost.get(origin);
    if (!robots) return true;
    // robots-parser returns undefined when no rule applies — that is "allowed".
    return robots.isAllowed(url, REPORT_USER_AGENT) !== false;
  }

  /**
   * The host's own Crawl-delay, when it declares one. The source's configured
   * delay is used as a floor: a publisher asking for 10s gets 10s even if we
   * configured 5.
   */
  crawlDelay(url: string): number | null {
    try {
      const robots = this.byHost.get(new URL(url).origin);
      const declared = robots?.getCrawlDelay(REPORT_USER_AGENT);
      return typeof declared === 'number' && Number.isFinite(declared) ? declared : null;
    } catch {
      return null;
    }
  }
}
