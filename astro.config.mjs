import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';
import remarkGfm from 'remark-gfm';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load DEAL TextMate grammars as parsed JSON objects (Shiki v1.0 pattern — never use { path: ... }).
// Source: vscode-deal/syntaxes/ (D-41 canonical grammars, copied into src/grammars/).
//
// Shiki uses the grammar's `name` field as the language ID. The grammars use "DEAL" / "DEAL Composition"
// (title-case). We add lowercase aliases so that ```deal and ```dealx fences resolve correctly.
const dealGrammarRaw = JSON.parse(
  readFileSync(path.join(__dirname, 'src/grammars/deal.tmLanguage.json'), 'utf-8')
);
const dealxGrammarRaw = JSON.parse(
  readFileSync(path.join(__dirname, 'src/grammars/dealx.tmLanguage.json'), 'utf-8')
);
const dealGrammar = { ...dealGrammarRaw, aliases: ['deal'] };
const dealxGrammar = { ...dealxGrammarRaw, aliases: ['dealx'] };

export default defineConfig({
  // D-64: domain is deal-lang.org (not the prior .dev candidate); NC-1 amendment recorded in ADR.
  // NO `base` config — custom domain via public/CNAME (Pitfall 7: base breaks CNAME routing).
  site: 'https://deal-lang.org',
  // Enable GitHub-Flavored Markdown (tables, strikethrough, task lists, etc.).
  // Astro 6 no longer applies GFM to the MDX pipeline by default.
  markdown: { remarkPlugins: [remarkGfm] },
  integrations: [
    starlight({
      title: 'DEAL — Digital Engineering Authoring Language',
      description: 'A text-first language for systems engineering',
      // Generate /llms.txt (index) and /llms-full.txt (full corpus) at build time so
      // AI assistants and answer engines can ingest and cite the docs (GEO).
      plugins: [
        starlightLlmsTxt({
          projectName: 'DEAL — Digital Engineering Authoring Language',
          description:
            'A text-first authoring surface for model-based systems engineering, with a 100% mapping to KerML and the SysML v2 API.',
        }),
      ],
      // Brand favicon (Micro icon). SVG primary; PNG fallback for older browsers.
      favicon: '/favicon.svg',
      head: [
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', href: '/favicon.png' } },
        // Open Graph / Twitter social card.
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://deal-lang.org/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://deal-lang.org/og.png' } },
        // Brand typography is self-hosted — see `customCss` below (@fontsource-variable).
      ],
      // Masthead logo (upper-left) — Secondary NoTagline lockup replaces the "DEAL" text.
      // light theme -> dark-ink variant; dark theme -> light-ink variant.
      logo: {
        light: './src/assets/DEAL_Secondary_NoTagline_Light_Color.svg',
        dark: './src/assets/DEAL_Secondary_NoTagline_Dark_Color.svg',
        replacesTitle: true,
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/deal-lang/deal',
        },
      ],
      // Self-hosted brand fonts (variable) load before the theme overrides.
      customCss: [
        '@fontsource-variable/inter',
        '@fontsource-variable/jetbrains-mono',
        './src/styles/custom.css',
      ],
      // Masthead overrides: reorder (search far right; GitHub + theme to its left)
      // and replace the theme dropdown with a single cycling icon button.
      components: {
        Header: './src/components/Header.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
        // Append Schema.org JSON-LD (WebSite/Organization + SoftwareApplication/TechArticle).
        Head: './src/components/Head.astro',
      },
      expressiveCode: {
        shiki: {
          // PARSED grammar objects — never { path: '...' } (Shiki v1.0 removed path-based loading).
          langs: [dealGrammar, dealxGrammar],
        },
      },
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Your First Project', slug: 'getting-started/first-project' },
            { label: 'Core Concepts', slug: 'getting-started/concepts' },
          ],
        },
        {
          label: 'Language Reference',
          items: [
            { label: 'Definitions', slug: 'reference/definitions' },
            { label: 'Compositions', slug: 'reference/compositions' },
            { label: 'Views', slug: 'reference/views' },
            { label: 'Requirements', slug: 'reference/requirements' },
            { label: 'Traceability', slug: 'reference/traceability' },
            { label: 'Imports', slug: 'reference/imports' },
            { label: 'Annotations', slug: 'reference/annotations' },
            { label: 'Units', slug: 'reference/units' },
            { label: 'deal.toml', slug: 'reference/deal-toml' },
          ],
        },
        {
          label: 'CLI Reference',
          items: [
            { label: 'Overview', slug: 'cli/overview' },
            { label: 'VS Code Setup', slug: 'cli/vscode-setup' },
          ],
        },
        {
          label: 'Tooling',
          items: [
            {
              label: 'deal view',
              slug: 'tooling/deal-view',
              badge: { text: 'Soon', variant: 'caution' },
            },
          ],
        },
      ],
    }),
  ],
});
