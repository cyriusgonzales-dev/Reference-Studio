import { describe, expect, it } from 'vitest';
import {
  formatSourceDate,
  formatSourceLine,
  researchQuery,
  researchToSlides,
  resolveResearchSource,
  sourceTrust,
  stripSiteSuffix,
  type ResearchPageInfo
} from '../src/shared/research';
import { researchPickSchema } from '../src/shared/schemas';

const page = (overrides: Partial<ResearchPageInfo>): ResearchPageInfo => ({
  url: 'https://science.nasa.gov/universe/overview/',
  documentTitle: '',
  title: '',
  siteName: '',
  publisher: '',
  published: '',
  modified: '',
  result: null,
  ...overrides
});

describe('research sources', () => {
  it('names the publisher, title and date the page declares', () => {
    const source = resolveResearchSource(
      page({ title: 'Universe Overview - NASA Science', siteName: 'NASA Science', published: '2024-03-05T14:00:00-05:00' })
    );
    expect(source).toMatchObject({ publisher: 'NASA', title: 'Universe Overview', date: 'March 5, 2024', trust: 'official' });
    expect(formatSourceLine(source!)).toBe('Source: NASA · Universe Overview · March 5, 2024');
  });

  it('never invents a date and labels a modified-only date as an update', () => {
    expect(resolveResearchSource(page({ documentTitle: 'Big Bang' }))?.date).toBeNull();
    expect(resolveResearchSource(page({ modified: '2023-11-02' }))?.date).toBe('Updated November 2, 2023');
    expect(formatSourceLine(resolveResearchSource(page({ title: 'Big Bang' }))!)).toBe('Source: NASA · Big Bang');
  });

  it('dates editable pages by their last edit', () => {
    const wiki = resolveResearchSource(
      page({ url: 'https://en.wikipedia.org/wiki/Big_Bang', title: 'Big Bang - Wikipedia', published: '2001-11-07T00:28:23Z', modified: '2026-10-19T07:09:44Z' })
    );
    expect(formatSourceLine(wiki!)).toBe('Source: Wikipedia · Big Bang · Updated October 19, 2026');
  });

  it('uses the site name or host for unknown publishers', () => {
    expect(resolveResearchSource(page({ url: 'https://www.example-science.org/a', siteName: 'Example Science' }))?.publisher).toBe('Example Science');
    expect(resolveResearchSource(page({ url: 'https://www.example-science.org/a' }))?.publisher).toBe('example-science.org');
  });

  it('attributes Google snippets to their result and refuses text it cannot attribute', () => {
    const fromResult = resolveResearchSource(
      page({
        url: 'https://www.google.com/search?q=big+bang',
        result: { href: 'https://www.google.com/url?q=https://www.britannica.com/science/big-bang-model&sa=U', title: 'Big-bang model | Britannica' }
      })
    );
    expect(fromResult).toMatchObject({ publisher: 'Encyclopaedia Britannica', title: 'Big-bang model', date: null, fromSearchPage: true });
    expect(fromResult?.url).toBe('https://www.britannica.com/science/big-bang-model');
    expect(resolveResearchSource(page({ url: 'https://www.google.com/search?q=big+bang' }))).toBeNull();
  });

  it('credits Google’s dictionary box to Oxford Languages', () => {
    const source = resolveResearchSource(
      page({
        url: 'https://www.google.com/search?q=big+bang+definition',
        result: { href: 'https://languages.oup.com/google-dictionary-en/', title: 'big bang' }
      })
    );
    expect(formatSourceLine(source!)).toBe('Source: Oxford Languages · big bang');
    expect(source?.trust).toBe('official');
  });

  it('adds "definition" to research searches unless the search already says what it wants', () => {
    expect(researchQuery('big bang')).toBe('big bang definition');
    expect(researchQuery('what is the big bang')).toBe('what is the big bang');
    expect(researchQuery('big bang meaning')).toBe('big bang meaning');
    expect(researchQuery('nasa.gov')).toBe('nasa.gov');
  });

  it('rates sites by their address', () => {
    expect(sourceTrust('https://www.noaa.gov/x')).toBe('official');
    expect(sourceTrust('https://www.ox.ac.uk/x')).toBe('official');
    expect(sourceTrust('https://en.wikipedia.org/wiki/Big_Bang')).toBe('user');
    expect(sourceTrust('https://someblog.example.com/')).toBe('unknown');
  });

  it('formats only real dates', () => {
    expect(formatSourceDate('2024')).toBe('2024');
    expect(formatSourceDate('2024-02')).toBe('February 2024');
    expect(formatSourceDate('2024/02/29')).toBe('February 29, 2024');
    expect(formatSourceDate('2023-02-29')).toBeNull();
    expect(formatSourceDate('March 5, 2024')).toBe('March 5, 2024');
    expect(formatSourceDate('3099-01-01')).toBeNull();
    expect(formatSourceDate('2024-13-01')).toBeNull();
    expect(formatSourceDate('yesterday')).toBeNull();
  });

  it('strips the site name from titles only when it is the site', () => {
    expect(stripSiteSuffix('Big Bang - Wikipedia', ['Wikipedia'])).toBe('Big Bang');
    expect(stripSiteSuffix('Stars - Life and Death', ['NASA'])).toBe('Stars - Life and Death');
  });
});

describe('research slides', () => {
  it('packs whole sentences and drops footnote markers', () => {
    const text =
      'The Big Bang is the prevailing cosmological model.[1] It explains how the universe expanded from an initial state of high density and temperature.[2][3] ' +
      'Various cosmological models of the Big Bang explain the evolution of the observable universe from the earliest known periods through its subsequent large-scale form.';
    const slides = researchToSlides(text);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toBe(
      'The Big Bang is the prevailing cosmological model. It explains how the universe expanded from an initial state of high density and temperature.'
    );
    expect(slides.join(' ')).not.toMatch(/\[\d\]/);
  });

  it('starts a new slide at each paragraph', () => {
    expect(researchToSlides('First paragraph.\n\nSecond one.\nThird.')).toEqual(['First paragraph.', 'Second one.', 'Third.']);
  });
});

describe('research picks', () => {
  it('accepts page details and rejects non-web pages', () => {
    const pick = { type: 'research', text: 'The universe is expanding.', explicit: false, page: page({}) };
    expect(researchPickSchema.safeParse(pick).success).toBe(true);
    expect(researchPickSchema.safeParse({ ...pick, page: page({ url: 'file:///c:/x.html' }) }).success).toBe(false);
  });
});
