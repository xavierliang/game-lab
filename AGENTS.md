# Game Lab development

This is an independent npm workspace. The original orbital-drift project is an unchanged reference outside this repository. Do not edit that reference or any MySpaces/Sites deployment while working here.

- Node 22.19+ and Python 3. `npm ci`, `npm run check`, `npm run build`, `npm run package`.
- `npm run check:browser` needs Chrome, or `PLAYWRIGHT_CHANNEL=chromium` after installing Playwright Chromium. `npm run check:release` verifies deterministic artifacts and templates.
- `npm run dev` serves only loopback on port 8810 by default; production API mode does not serve game files.
- Every game has an immutable `id` and a stable public `slug` in `games/<id>/game.json`. Renaming titles is safe; changing IDs requires an explicit migration.
- Keep engine-specific events in the game's adapter. Shared SDK/backend must not hard-code one game's rules, units, assets or stage thresholds.
- Schema 2 events must include `game_id`, game `version`, and `sdk_version`. Legacy schema 1 is accepted only on the explicit Orbital compatibility route.
- Storage, queries, dedupe keys and exports must isolate games. The privacy preference is intentionally site-wide; anonymous visitor IDs and pending queues are per game.
- Games lock the shared workspace package version. Test compatibility before updating it. Each game builds and rolls back independently.
- Public runtime config must never include admin credentials. Never commit .env, .data, databases, local tokens or generated test data. Keep deployment origin values empty until real endpoints are supplied.
- Integration examples stay `status: example`, emit only Test events and are excluded from the public site package by default.
- Maintain old share/game URLs when changing routing. Event retention does not define the lifetime of a game URL.
- No automatic publishing, remote repository creation or DNS changes are part of routine local verification.
