import { fetchText } from './fetchFeed.js';

// A browser-like User-Agent gets past UA-based bot blocks on most news sites,
// matching how fetchFeed fetches feed XML.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Pull the og:image (or twitter:image fallback) from a page's <head>. The order
// of the property/content attributes varies between sites, so we try both. Best
// effort only: any network error, missing tag, or unparseable URL yields null so
// the caller can degrade gracefully.
export async function fetchOgImage(url: string): Promise<string | null> {
  let html: string;
  try {
    html = await fetchText(url, { 'User-Agent': BROWSER_UA, Accept: 'text/html,*/*;q=0.8' });
  } catch {
    return null;
  }

  // Only scan the <head> — that's where social meta tags live, and it bounds the regex.
  const head = html.slice(0, html.search(/<\/head>/i) + 1 || html.length);

  const raw = findMetaContent(head, 'og:image') ?? findMetaContent(head, 'twitter:image');
  if (!raw) return null;

  try {
    return new URL(raw, url).toString();
  } catch {
    return null;
  }
}

// Match a <meta> tag for the given property/name, regardless of whether the
// identifying attribute comes before or after the content attribute.
function findMetaContent(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return m[1];
  }
  return null;
}
