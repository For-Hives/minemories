# Website localization — Minecraft Java markets

The website speaks eight languages, one per language with no regional variant (owner decision, 12 November 2026; the en-GB, en-CA and fr-CA catalogs were removed). The table follows `localeOptions`; the picker lists them by their own name (`lib/locale-picker.ts`):

| Choice | HTML tag | URL prefix |
| --- | --- | --- |
| English | en-US | none (`/concept`) |
| Русский | ru-RU | `/ru` |
| Deutsch | de-DE | `/de` |
| Français | fr-FR | `/fr` |
| 한국어 | ko-KR | `/ko` |
| Português | pt-BR | `/pt-br` |
| Polski | pl-PL | `/pl` |
| 日本語 | ja-JP | `/ja` |

**The URL names the language.** Every page, public or private, exists under each prefix (`/fr/concept`, `/de/gallery`, `/pt-br/share/<token>`); English is the unprefixed site and `/en/…` redirects to it (301, nginx). The router works under the prefix (its `basename`, `App.tsx`), so internal links and route checks never name a language: a `<Link to="/faq">` on `/fr/…` points to `/fr/faq`. Helpers live in `lib/locale-path.ts`. A choice in the picker or the suggestion saves the language and moves to the same page, query and anchor under the new prefix (the tree remounts under the new basename; Back and Forward across languages do the same). A saved choice sends an unprefixed URL to its language before anything renders (`main.tsx`); a prefixed URL is never redirected, and crawlers save nothing, so a crawler and a visitor read the same language on the same URL. A retired regional choice still stored on a device (`en-GB`, `fr-CA`) resolves to its language. The browser's language is only ever suggested (`LanguageSuggestion`), never applied.

## Catalogs and scope

The website uses a single engine: `translate(locale, key, values)` in `i18n/catalog.ts`. The `useI18n().t()` hook and the `T` JSX component call that same engine. Text lives only in `i18n/locales/*.json`: `en.json` is the canonical source, `fr.json` and the six other languages are full catalogs.

The old `copy(fr, en)` pairs, `{ fr, en }` editorial objects, inverted guide dictionaries and separate metadata tables have been removed. Components, editorial content, guides, diagnostics labels, metadata, immediate relative dates and counters use the same keys. Plurals are selected by `Intl.PluralRules`, then resolved in the catalogs; numbers are formatted by `Intl.NumberFormat`.

API identifiers, paths, file names, Minecraft commands and parameters such as `{name}`, `{count}`, etc. keep their technical form. User-entered content stays literal. Commercial currencies are not converted automatically when the language changes.

New catalogs are imported on demand and shipped with the website: the application never calls a translation service. While a catalog loads, the previous language stays active; an error offers a retry. A late response does not override a more recent choice, and a response after unmount does not change the preference. Every page is prerendered in every language (`scripts/prerender-web.mjs`, 16 pages x 8 languages): `<html lang>`, title, description, `og:title`, `og:description`, `og:locale` (plus `og:locale:alternate`), a self-referencing canonical and `og:url`, reciprocal `hreflang` alternates for the eight languages plus `x-default` (English), and JSON-LD in the page's language. A pasted unprefixed link previews in English, a `/fr` link in French. The sitemap lists every page in every language with its `xhtml:link` alternates. The private shell exists per language too (`/fr/app.html` for `/fr/share/…`: the shared-link card in French). The site's copy uses no em dash (`—`) in any language.

The six new catalogs started from a Google Translate pre-translation of the public text. The main navigation, account, authentication, sharing and viewer terms have been reviewed; product names, commands and parameters are checked automatically. An editorial review by native speakers is still worthwhile for long texts, especially the guides and legal pages.

## Maintenance and validation

To add a message, pick a stable key in `locales/en.json` and fill in every full catalog. In a component, use `t(key, values)` or `T`; in editorial data, store only the key and translate it at render time. Never recreate per-language text pairs in components.

The tests check key parity, parameters, commands and files, plurals, the English fallback and the absence of the old system from the sources. The interaction tests cover the real picker, preferences, blocked storage, concurrent loads and their failures, the guides and their checked steps, metadata and titles entered by owners.

## Mod options: Minecraft's language

The mod relies only on Minecraft's native system: `Component.translatable` for components and `I18n.get` when a drawing or field API requires a string. The resources are in `assets/minemories/lang/`: American/British/Canadian English, French (France/Canada), Russian, German, Korean, Brazilian Portuguese, Polish and Japanese. Minecraft falls back to `en_us` for missing languages or keys.

The mod has no language picker of its own, no language preference in its configuration, and no call to the website to choose or translate the options. Changing the website's language does not change the in-game options. The simple/advanced options, AFK, local folder, API, diagnostics, remote world and related screens follow the language chosen in Minecraft. Technical messages coming from the services and the capture engine are not re-translated from their free-form text.

The Java tests check the catalogs, commands and paths. A single option component is resolved in turn under the eleven languages injected into Minecraft's engine, to check that it does not freeze an independent translation.

## Migration validation

Biome, typecheck and the web build succeeded; 19 public pages pre-rendered. The coverage run executed 303 passing tests and covered the utilities at 100% (lines, branches, functions and statements). The `temporal-files.test.ts` worker timed out; rerunning it alone passed its four tests and exited normally. All 54 files, i.e. 307 tests, were thus verified without changing the coverage thresholds or test isolation.

Chromium went through all eleven choices in development and production at 390 × 844: translated labels, correct regional tags and no horizontal overflow. Deferred JSON imports do not use a JSON type attribute: Vite serves them as JavaScript modules, which the browser would reject with that attribute. Static imports of the base catalogs keep the attribute Node needs to load the configuration.

The Gradle check of the common module succeeds: compilation, formatting, main/test SpotBugs and 176 Java tests, including the two localization tests. The native engine is checked automatically under the eleven languages; no visual in-game trial was done for this migration.
