import { loadGames, siteConfig } from '../tooling/registry.mjs';
const args = process.argv.slice(2),
  options = {};
for (let i = 0; i < args.length; i += 2) options[args[i].replace(/^--/, '')] = args[i + 1];
const game = loadGames().find((g) => g.id === options.game),
  site = siteConfig();
if (!game) throw new Error('Use --game with a registered game ID');
if (!site.publicOrigin)
  throw new Error('Configure a real publicOrigin first; no placeholder link will be generated');
const url = new URL(`/${game.slug}/`, site.publicOrigin);
for (const field of ['source', 'medium', 'campaign', 'content'])
  if (options[field]) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(options[field]))
      throw new Error('Use anonymous ASCII campaign labels, max 64 characters');
    url.searchParams.set('utm_' + field, options[field]);
  }
if (!options.source) throw new Error('--source is required');
console.log(url.href);
