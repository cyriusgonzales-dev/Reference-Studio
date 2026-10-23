import { MAX_LYRICS_TEXT } from './lyrics';
import { hostnameOf, parseHttpUrl } from './urls';

/**
 * Research text handling: turning text highlighted on a web page into slides,
 * and naming its source (publisher, title, date) from what the page itself
 * declares. Nothing is guessed: a page that does not state a date gets no date.
 */

/** How far a source can be trusted, judged only from its web address. */
export type SourceTrust = 'official' | 'user' | 'unknown';

export interface ResearchSource {
  publisher: string;
  title: string;
  /** "March 5, 2024", "Updated March 5, 2024", or null when the page states no date. */
  date: string | null;
  url: string;
  trust: SourceTrust;
  /** The text was highlighted on a Google results page, not on the source page itself. */
  fromSearchPage: boolean;
}

/** What the research preload reads from the page the text was highlighted on. */
export interface ResearchPageInfo {
  url: string;
  documentTitle: string;
  /** The page's own title (citation_title, og:title or JSON-LD headline), if it declares one. */
  title: string;
  /** og:site_name or application-name. */
  siteName: string;
  /** JSON-LD publisher name or citation_publisher / citation_journal_title. */
  publisher: string;
  published: string;
  modified: string;
  /** On a Google results page: the result the highlighted text belongs to. */
  result: { href: string; title: string } | null;
}

/** A slide holds at most this many characters unless a single sentence is longer. */
export const MAX_RESEARCH_SLIDE_CHARS = 240;

/** Publishers whose names are clearer than their sites' own labels. Matched by domain suffix. */
const KNOWN_PUBLISHERS: Record<string, string> = {
  'nasa.gov': 'NASA',
  'esa.int': 'ESA',
  'noaa.gov': 'NOAA',
  'usgs.gov': 'USGS',
  'nps.gov': 'National Park Service',
  'nih.gov': 'NIH',
  'cdc.gov': 'CDC',
  'who.int': 'World Health Organization',
  'un.org': 'United Nations',
  'cern.ch': 'CERN',
  'si.edu': 'Smithsonian',
  'smithsonianmag.com': 'Smithsonian Magazine',
  'britannica.com': 'Encyclopaedia Britannica',
  'nationalgeographic.com': 'National Geographic',
  'nature.com': 'Nature',
  'science.org': 'Science',
  'scientificamerican.com': 'Scientific American',
  'newscientist.com': 'New Scientist',
  'nobelprize.org': 'The Nobel Prize',
  'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC',
  'reuters.com': 'Reuters',
  'apnews.com': 'AP News',
  'history.com': 'HISTORY',
  'space.com': 'Space.com',
  'livescience.com': 'Live Science',
  'merriam-webster.com': 'Merriam-Webster',
  'harvard.edu': 'Harvard University',
  'mit.edu': 'MIT',
  'stanford.edu': 'Stanford University',
  'ox.ac.uk': 'University of Oxford',
  'cam.ac.uk': 'University of Cambridge',
  'wikipedia.org': 'Wikipedia'
};

/** Established reference, science and news organisations (in addition to government and university sites). */
const OFFICIAL_DOMAINS = Object.keys(KNOWN_PUBLISHERS).filter((d) => d !== 'wikipedia.org');

/** Sites where anyone can publish or edit; their text should be checked against another source. */
const USER_DOMAINS = [
  'wikipedia.org',
  'fandom.com',
  'reddit.com',
  'quora.com',
  'medium.com',
  'substack.com',
  'blogspot.com',
  'wordpress.com',
  'tumblr.com',
  'pinterest.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
  'answers.com',
  'brainly.com',
  'coursehero.com',
  'studocu.com',
  'scribd.com'
];

const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export function sourceTrust(url: string): SourceTrust {
  const host = hostnameOf(url).toLowerCase();
  if (!host) return 'unknown';
  if (USER_DOMAINS.some((d) => onDomain(host, d))) return 'user';
  // Government, military, intergovernmental and university sites.
  if (/\.(gov|mil|int|edu)(\.[a-z]{2})?$/.test(host) || /\.(gc\.ca|gouv\.fr|ac\.[a-z]{2})$/.test(host)) return 'official';
  if (OFFICIAL_DOMAINS.some((d) => onDomain(host, d))) return 'official';
  return 'unknown';
}

function knownPublisher(host: string): string | null {
  for (const [domain, name] of Object.entries(KNOWN_PUBLISHERS)) if (onDomain(host, domain)) return name;
  return null;
}

const clean = (text: string, max = 300) => text.replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Removes a trailing " | Site" or " - Site" from a page title when that part
 * names the publisher, so the title is the article's own.
 */
export function stripSiteSuffix(title: string, names: string[]): string {
  const parts = title.split(/\s+[|\-–—·]\s+/);
  if (parts.length < 2) return title;
  const last = parts[parts.length - 1]!.toLowerCase();
  const matches = names.some((n) => {
    const name = n.toLowerCase().trim();
    return name.length > 1 && (last.includes(name) || name.includes(last));
  });
  if (!matches) return title;
  return title.slice(0, title.length - parts[parts.length - 1]!.length).replace(/\s+[|\-–—·]\s*$/, '').trim() || title;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Formats a date the page declared ("2024-03-05T10:00:00Z", "2024-03", "March 5, 2024").
 * Returns null for anything that is not clearly a real date.
 */
export function formatSourceDate(value: string, now = new Date()): string | null {
  const text = value.trim();
  if (!text) return null;
  const maxYear = now.getFullYear() + 1;
  // ISO-style dates are read as written, so time zones never shift the day.
  const iso = /^(\d{4})(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?(?:$|[T\s])/.exec(text);
  if (iso) {
    const year = Number(iso[1]);
    const month = iso[2] ? Number(iso[2]) : 0;
    const day = iso[3] ? Number(iso[3]) : 0;
    if (year < 1800 || year > maxYear || month > 12 || day > 31) return null;
    if (!month) return String(year);
    if (month < 1) return null;
    if (!day) return `${MONTHS[month - 1]} ${year}`;
    if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
    return `${MONTHS[month - 1]} ${day}, ${year}`;
  }
  if (!/[a-z]/i.test(text) || !/\d{4}/.test(text)) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() < 1800 || parsed.getFullYear() > maxYear) return null;
  return `${MONTHS[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
}

/** Google result links can be redirects ("/url?q=…"); returns the real address. */
export function unwrapGoogleRedirect(href: string): string {
  const parsed = parseHttpUrl(href);
  if (!parsed) return href;
  if (/(^|\.)google\.[a-z.]+$/i.test(parsed.hostname) && parsed.pathname === '/url') {
    const target = parsed.searchParams.get('q') ?? parsed.searchParams.get('url');
    if (target && parseHttpUrl(target)) return target;
  }
  return href;
}

/**
 * Names the source of highlighted text. Returns null when it cannot be named
 * truthfully, for example text from Google's own AI overview.
 */
export function resolveResearchSource(page: ResearchPageInfo): ResearchSource | null {
  const pageHost = hostnameOf(page.url).toLowerCase();
  const onGoogle = /(^|\.)google\.[a-z.]+$/.test(pageHost);

  if (onGoogle) {
    if (!page.result) return null;
    const url = unwrapGoogleRedirect(page.result.href);
    const host = hostnameOf(url).toLowerCase();
    if (!host || /(^|\.)google\.[a-z.]+$/.test(host)) return null;
    const publisher = knownPublisher(host) ?? host.replace(/^www\./, '');
    return {
      publisher,
      title: stripSiteSuffix(clean(page.result.title), [publisher, host]) || publisher,
      date: null,
      url,
      trust: sourceTrust(url),
      fromSearchPage: true
    };
  }

  if (!pageHost) return null;
  const siteName = clean(page.siteName, 120);
  const publisher = knownPublisher(pageHost) ?? (clean(page.publisher, 120) || siteName || pageHost.replace(/^www\./, ''));
  const names = [publisher, siteName, clean(page.publisher, 120), pageHost.replace(/^www\./, '').split('.')[0]!];
  const title = stripSiteSuffix(clean(page.title) || clean(page.documentTitle), names.filter(Boolean)) || publisher;
  const trust = sourceTrust(page.url);
  // On sites anyone can edit, the text is as recent as the last edit, not the page's creation.
  const published = trust === 'user' && formatSourceDate(page.modified) ? null : formatSourceDate(page.published);
  const modified = published ? null : formatSourceDate(page.modified);
  return {
    publisher,
    title,
    date: published ?? (modified ? `Updated ${modified}` : null),
    url: page.url,
    trust,
    fromSearchPage: false
  };
}

/** The line shown under the slide: "Source: NASA · What Is the Big Bang? · March 5, 2024". */
export function formatSourceLine(source: ResearchSource): string {
  return ['Source: ' + source.publisher, source.title !== source.publisher ? source.title : '', source.date ?? '']
    .filter(Boolean)
    .join(' · ');
}

/** Footnote markers and editing links that are page furniture, not content. */
const NOISE = /\[(?:\d+|[a-z]|citation needed|edit|note \d+)\]/gi;

/**
 * Splits prose into slides: whole sentences, packed up to MAX_RESEARCH_SLIDE_CHARS
 * characters per slide. A new paragraph always starts a new slide.
 */
export function researchToSlides(text: string, maxChars = MAX_RESEARCH_SLIDE_CHARS): string[] {
  const slides: string[] = [];
  const paragraphs = text
    .slice(0, MAX_LYRICS_TEXT)
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Zs}/gu, ' ')
    .replace(NOISE, '')
    .split('\n')
    .map((p) => p.replace(/[ \t]+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim())
    .filter(Boolean);
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?]["'”’)\]]?)\s+(?=["“'(]?[\p{Lu}\d])/u);
    let current = '';
    for (const sentence of sentences) {
      if (current && current.length + 1 + sentence.length > maxChars) {
        slides.push(current);
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
    if (current) slides.push(current);
  }
  return slides;
}
