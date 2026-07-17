import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildExtractiveSummary,
  discoverArticleLinks,
  evaluateFeedEntry,
  extractArticleFromHtml,
  normalizeCanonicalUrl,
  parseFeedXml,
  parseSitemapXml,
  type NewsSourceConfig,
} from '../src/index.ts';

const source: NewsSourceConfig = {
  key: 'example-ai',
  name: 'Example AI',
  domain: 'example.org',
  websiteUrl: 'https://example.org/news',
  listingUrl: 'https://example.org/news',
  feedUrl: null,
  discoveryUrl: null,
  detectedMethod: null,
  ingestionMethod: 'AUTO',
  language: 'es',
  includeKeywords: ['inteligencia artificial', 'artificial intelligence', 'machine learning'],
  excludeKeywords: ['descuento'],
  includeUrlPatterns: ['/news/', '/blog/'],
  excludeUrlPatterns: ['/events/'],
  minimumRelevanceScore: 30,
  maxItemsPerSync: 10,
};

test('builds a clean extractive summary from feed HTML', () => {
  assert.equal(
    buildExtractiveSummary(
      '<p>Un avance importante en <strong>inteligencia artificial</strong>.</p>',
    ),
    'Un avance importante en inteligencia artificial.',
  );
});

test('scores title matches above summary-only matches', () => {
  const titleMatch = evaluateFeedEntry(
    'Nuevo modelo de inteligencia artificial',
    'Investigación universitaria.',
    ['inteligencia artificial'],
    [],
    30,
  );
  const summaryMatch = evaluateFeedEntry(
    'Nuevo modelo universitario',
    'Investigación de inteligencia artificial.',
    ['inteligencia artificial'],
    [],
    30,
  );

  assert.equal(titleMatch.accepted, true);
  assert.ok(titleMatch.relevanceScore > summaryMatch.relevanceScore);
});

test('rejects excluded commercial terms', () => {
  const result = evaluateFeedEntry(
    'Curso de machine learning con descuento',
    null,
    ['machine learning'],
    ['descuento'],
    20,
  );

  assert.equal(result.accepted, false);
  assert.equal(result.excluded, true);
});

test('normalizes tracking parameters from canonical links', () => {
  assert.equal(
    normalizeCanonicalUrl('http://example.org/news?id=1&utm_source=test', 'https://example.org'),
    'https://example.org/news?id=1',
  );
});

test('parses RSS 1.0 RDF feeds such as academic repositories', () => {
  const result = parseFeedXml(
    `<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
        <item>
          <title>Artificial intelligence improves robotic planning</title>
          <link>https://example.org/news/robotic-planning</link>
          <description>Research about artificial intelligence and robots.</description>
          <dc:date xmlns:dc="http://purl.org/dc/elements/1.1/">2026-07-19</dc:date>
        </item>
      </rdf:RDF>`,
    {
      key: source.key,
      name: source.name,
      domain: source.domain,
      websiteUrl: source.websiteUrl,
      feedUrl: 'https://example.org/rss.xml',
      language: source.language,
      includeKeywords: source.includeKeywords,
      excludeKeywords: source.excludeKeywords,
      minimumRelevanceScore: source.minimumRelevanceScore,
      maxItemsPerSync: source.maxItemsPerSync,
    },
  );

  assert.equal(result.strategy, 'RSS');
  assert.equal(result.entries.length, 1);
});

test('discovers article links from JSON-LD and semantic HTML', () => {
  const html = `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@type": "ItemList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "item": {
                  "@type": "NewsArticle",
                  "url": "https://example.org/news/modelo-ia",
                  "headline": "Nuevo modelo de inteligencia artificial"
                }
              }
            ]
          }
        </script>
      </head>
      <body>
        <main>
          <article><h2><a href="/blog/machine-learning-platform">Nueva plataforma de machine learning</a></h2></article>
          <a href="/privacy">Privacidad</a>
        </main>
      </body>
    </html>`;
  const links = discoverArticleLinks(html, source.websiteUrl, source);

  assert.equal(links.length, 2);
  assert.ok(links.every((link) => !link.url.includes('/privacy')));
});

test('extracts article metadata using JSON-LD and Open Graph', () => {
  const html = `
    <html lang="es">
      <head>
        <link rel="canonical" href="https://example.org/news/modelo-ia" />
        <meta property="og:image" content="https://cdn.example.org/modelo.jpg" />
        <script type="application/ld+json">
          {
            "@type": "NewsArticle",
            "headline": "Nuevo modelo de inteligencia artificial",
            "description": "Un grupo de investigación presentó un nuevo sistema de inteligencia artificial.",
            "datePublished": "2026-07-19T12:00:00Z",
            "author": {"@type": "Person", "name": "Equipo de investigación"}
          }
        </script>
      </head>
      <body><article><h1>Nuevo modelo de inteligencia artificial</h1></article></body>
    </html>`;
  const entry = extractArticleFromHtml(html, 'https://example.org/news/modelo-ia', source);

  assert.ok(entry);
  assert.equal(entry.title, 'Nuevo modelo de inteligencia artificial');
  assert.equal(entry.author, 'Equipo de investigación');
});

test('parses news sitemaps', () => {
  const result = parseSitemapXml(
    `<?xml version="1.0"?>
      <urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
        <url>
          <loc>https://example.org/news/modelo-ia</loc>
          <news:news>
            <news:title>Nuevo modelo de inteligencia artificial</news:title>
            <news:publication_date>2026-07-19</news:publication_date>
          </news:news>
        </url>
      </urlset>`,
    'https://example.org/news-sitemap.xml',
    'example.org',
  );

  assert.equal(result.isNewsSitemap, true);
  assert.equal(result.urls.length, 1);
});
