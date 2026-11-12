# Website localization — Minecraft Java markets

The website's language picker covers the ten requested countries, with eleven language variants (the table follows `localeOptions`; the picker itself lists them by name, each language's regions together, `lib/locale-picker.ts`):

| Country | Choice | HTML tag / regional format |
| --- | --- | --- |
| United States | English (US) | en-US |
| Russia | Русский | ru-RU |
| Germany | Deutsch | de-DE |
| United Kingdom | English (UK) | en-GB |
| France | Français (FR) | fr-FR |
| South Korea | 한국어 | ko-KR |
| Brazil | Português (BR) | pt-BR |
| Poland | Polski | pl-PL |
| Canada | English (CA), Français (CA) | en-CA, fr-CA |
| Japan | 日本語 | ja-JP |

The legacy identifiers `en` and `fr` remain valid in the local preference, so choices already stored are preserved. Every page renders in French unless the visitor saved a language in the switcher; the browser's ordered language list never changes the rendered text, so a crawler and a visitor read the same language on the same URL. When the browser prefers another supported language (or an unsupported one, which falls back to English), a dismissible card (`LanguageSuggestion`, bottom-left, `data-nosnippet`, written in the suggested language) offers it once that catalog has loaded. Accepting saves the choice like the switcher; declining stores the declined language on the device under `minemories-locale-suggestion-dismissed`, which silences every regional variant of that language. No suggestion appears once a choice is saved or when the browser already reads French (fr-CA included). No geolocation or IP-based country detection is used. Regional tags feed the HTML document; dates, numbers, sizes and counters go through Intl, including the Russian and Polish plural categories.

## Catalogs and scope

The website uses a single engine: `translate(locale, key, values)` in `i18n/catalog.ts`. The `useI18n().t()` hook and the `T` JSX component call that same engine. Text lives only in `i18n/locales/*.json`: `en.json` is the canonical source, `fr.json` and the six other languages are full catalogs. Regional variants only contain their differences and inherit from the catalog of their main language.

The old `copy(fr, en)` pairs, `{ fr, en }` editorial objects, inverted guide dictionaries and separate metadata tables have been removed. Components, editorial content, guides, diagnostics labels, metadata, immediate relative dates and counters use the same keys. Plurals are selected by `Intl.PluralRules`, then resolved in the catalogs; numbers are formatted by `Intl.NumberFormat`.

API identifiers, paths, file names, Minecraft commands and parameters such as `{name}`, `{count}`, etc. keep their technical form. User-entered content stays literal. Commercial currencies are not converted automatically when the language changes.

New catalogs are imported on demand and shipped with the website: the application never calls a translation service. While a catalog loads, the previous language stays active; an error offers a retry. A late response does not override a more recent choice, and a response after unmount does not change the preference. The initial static render keeps the existing French routes and the client renders them in French too; metadata and content only change after a saved or explicit choice of language (`<html lang>` and JSON-LD `inLanguage` follow the rendered language). The head is the exception: `<title>`, `<meta name="description">`, `og:title`, `og:description` and `og:locale` (`en_US`) are in English by default, on the prerendered pages and the private shell (`app.html`, read by Discord for share links), so a pasted link never previews in French (owner decision, 12 November 2026). `?lang=<id>` (any supported id or regional tag, case-insensitive) asks for another language: the prerender writes one head variant per language under `dist/_lang/<id>/` (same French body, translated head, `og:url` carrying `?lang=`, canonical on the bare URL) and nginx serves it from a whitelist map (`$mm_lang` in `deploy/nginx.web.conf`, noindex, internal). In the browser, `?lang=` also renders the page in that language without saving it; the head follows the language once one is chosen (link, saved choice or switcher), and the switcher drops `?lang=` from the URL (`src/lib/link-language.ts`, `headFor` in `route-metadata.ts`). JSON-LD stays in the page's language. The site's copy uses no em dash (`—`) in any language. No translation URL or hreflang tag points to a page that does not exist.

The six new catalogs started from a Google Translate pre-translation of the public text. The main navigation, account, authentication, sharing and viewer terms have been reviewed; product names, commands and parameters are checked automatically. An editorial review by native speakers is still worthwhile for long texts, especially the guides and legal pages.

## Maintenance and validation

To add a message, pick a stable key in `locales/en.json` and fill in every full catalog. In a component, use `t(key, values)` or `T`; in editorial data, store only the key and translate it at render time. Never recreate per-language text pairs in components. Variants only contain their regional differences.

The tests check key parity, parameters, commands and files, plurals, the English fallback and the absence of the old system from the sources. The interaction tests cover the real picker, preferences, blocked storage, concurrent loads and their failures, the guides and their checked steps, metadata and titles entered by owners.

## Mod options: Minecraft's language

The mod relies only on Minecraft's native system: `Component.translatable` for components and `I18n.get` when a drawing or field API requires a string. The resources are in `assets/minemories/lang/`: American/British/Canadian English, French (France/Canada), Russian, German, Korean, Brazilian Portuguese, Polish and Japanese. Minecraft falls back to `en_us` for missing languages or keys.

The mod has no language picker of its own, no language preference in its configuration, and no call to the website to choose or translate the options. Changing the website's language does not change the in-game options. The simple/advanced options, AFK, local folder, API, diagnostics, remote world and related screens follow the language chosen in Minecraft. Technical messages coming from the services and the capture engine are not re-translated from their free-form text.

The Java tests check the catalogs, commands and paths. A single option component is resolved in turn under the eleven languages injected into Minecraft's engine, to check that it does not freeze an independent translation.

## Migration validation

Biome, typecheck and the web build succeeded; 19 public pages pre-rendered. The coverage run executed 303 passing tests and covered the utilities at 100% (lines, branches, functions and statements). The `temporal-files.test.ts` worker timed out; rerunning it alone passed its four tests and exited normally. All 54 files, i.e. 307 tests, were thus verified without changing the coverage thresholds or test isolation.

Chromium went through all eleven choices in development and production at 390 × 844: translated labels, correct regional tags and no horizontal overflow. Deferred JSON imports do not use a JSON type attribute: Vite serves them as JavaScript modules, which the browser would reject with that attribute. Static imports of the base catalogs keep the attribute Node needs to load the configuration.

The Gradle check of the common module succeeds: compilation, formatting, main/test SpotBugs and 176 Java tests, including the two localization tests. The native engine is checked automatically under the eleven languages; no visual in-game trial was done for this migration.
