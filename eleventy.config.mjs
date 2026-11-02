const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ 'src/assets': 'assets' });

  eleventyConfig.addFilter('shortDate', (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  });

  eleventyConfig.addFilter('rfc822', (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
  });

  eleventyConfig.addFilter('monthLabel', (ym) => {
    const [y, m] = String(ym).split('-');
    return `${MONTHS[Number(m) - 1] || ym} ${y}`;
  });

  eleventyConfig.addFilter('take', (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []));

  eleventyConfig.addFilter('pinned', (arr) => (Array.isArray(arr) ? arr.filter((a) => a.pin) : []));

  eleventyConfig.addFilter('uniqueSources', (arr) =>
    [...new Set((arr || []).map((a) => a.source))].sort((a, b) => a.localeCompare(b))
  );

  eleventyConfig.addFilter('xmlEscape', (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );

  return {
    dir: { input: 'src', output: '_site', includes: '_includes', data: '_data' },
    pathPrefix: process.env.PATH_PREFIX || '/',
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk'
  };
}
