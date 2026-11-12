# Site languages and URL publication

The site offers French and English flows in a single shell. `I18nProvider` selects the language and stores only that preference on the device. The concept/how-it-works/FAQ guides, the screens of the installation guide, and the captions and alt text of tutorial screenshots have an explicit English catalog in `i18n/guide-messages.ts`. The shared interface keeps its source keys and the French catalog `messages.ts`; editorial texts that are already paired stay in `content/`.

Switching language only changes presentation: the values `windows`, `manuel`, `curseforge`, `autre`, step numbers, screenshot identifiers, Minecraft dimensions, commands, file names and paths do not change. The tutorial's first name, progress and checked boxes are kept. Command texts stay copyable exactly as they are.

## Errors and formats

`error-messages.ts` maps known API/authentication codes and fixed engine errors to displayable keys. Unknown server details are not shown: a contextual message asks the user to try again. Keys are stored in state and translated at render time, so an error already on screen also switches language. Account, administration and restore business errors that are already localized keep their specific messages.

Relative dates use `Intl.RelativeTimeFormat`. Publication dates, pairing expiry, counters and decimal separators follow the interface language; ISO timestamps and protocol units are unchanged. Sizes stay in binary units KiB/MiB/GiB; bytes and transfer limits do not change. Title/description/OpenGraph metadata and `inLanguage` schemas follow the displayed text.

The guides were also updated: a bottom margin of at least five blocks below the visited position (within world limits), the list of validated loaders on the Versions page, a timelapse of dated captures, the 450 MiB upload limit, and pairing being required for the gallery. Compatibility with every modpack is not promised.

## URLs: shipped state

Existing public URLs remain the canonical URLs. The server prerenders French; English is selected in the browser and does not yet have separate published URLs. The local language choice therefore creates no `hreflang`. Private routes, share links, authentication, account and administration keep no public canonical, no public schema and `noindex,nofollow`, whatever the language. General indexing stays disabled unless `VITE_INDEXABLE` is explicitly enabled.

To publish the languages to search engines, the chosen convention is: French on the existing paths (`/installation`), English under `/en` (`/en/installation`, `/en` for the home page). Content slugs and protocol identifiers stay stable. This publication must be atomic: a real route, prerendering in the language given by the URL, localized internal links, a self-referencing canonical, a sitemap and reciprocal `fr`/`en` alternates (plus `x-default` pointing to French). A local preference must then never override the language set by the URL.

No alternate may be added before both matching pages actually exist and are fully translated. GitHub release notes remain official documents in their original language, not invented translations; their interface is bilingual. Legal texts that are already paired remain provisional until #89 is finalized. This work prepares language publication without claiming that indexable English URLs have launched.

## Validation

Interaction tests walk through the guides in both languages, the six steps for the four launchers, unchanged commands, and retention of the first name, launcher and progress when switching language. Tests cover every relative-date unit, size separators, known error codes and the safe fallback, the metadata of each public page and the absence of fictitious alternates. Gallery, pairing and viewer regressions stay active.
