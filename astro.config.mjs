// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export const SITE = 'https://aix4u.com';

export default defineConfig({
  site: SITE,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  build: {
    // One page, one stylesheet: keep the CSS inline-free but in a single file.
    inlineStylesheets: 'auto',
  },
  devToolbar: { enabled: false },
});
