# CfA Static

A static-site template for small informational and marketing sites, built on
[Eleventy](https://www.11ty.dev/) and Node.js. Pages are
assembled from composable, schema-validated content blocks written in YAML
frontmatter, so engineering-adjacent authors (and AI assistants) can build and
edit pages without touching templates.

Derived from the [Chobble Template](https://github.com/chobbledotcom/chobble-template),
relicensed to MIT here by its sole author, and cut down to an informational
core: no e-commerce, no forms, no user data handling — just fast, accessible,
static pages.

## What's included

- **Content blocks** — heroes, FAQs, callouts, image cards,
  split layouts, galleries, and stats declared in frontmatter and validated at
  build time with loud, file-specific errors. See the generated
  [block reference](skills/cfa-static-site-builder/references/blocks.md)
  and [layout reference](skills/cfa-static-site-builder/references/layouts.md),
  or the deployed site's `/blocks/` page,
  where standalone-previewable types render next to YAML from the same tested
  fixtures. Collection-restricted contextual blocks show usage guidance
  instead.
- **Content types** — Pages, News (with Atom feed), Guides (categorised
  documentation pages), and reusable Snippets.
- **Multi-language** — publish the same page in more than one language with
  `hreflang` tags, an `x-default`, and a footer language switcher. See the
  Languages section below.
- **Theming** — CSS custom properties throughout, prebuilt themes, a
  visual theme editor at `/theme-editor/` with export.
- **Images** — responsive `srcset` via eleventy-img, base64 LQIP placeholders,
  aspect-ratio cropping, unused-image detection.
- **Accessibility** — `npm test` checks every built page with axe-core's
  automated WCAG 2.2 AA rules, including gallery coverage for blocks that
  support standalone previews. Pages get a skip link, named landmarks, and
  per-language chrome labels out of the box. Manual review is still required
  for context, visual contrast, keyboard flow, and other qualities automation
  cannot settle.
- **Search** — static full-text search via Pagefind.
- **SEO** — schema.org JSON-LD (WebSite, Organization, BreadcrumbList,
  BlogPosting, FAQPage), canonical URLs, sitemap, social cards.
- **Editing layer** — a generated [PagesCMS](https://pagescms.org/) config
  (`.pages.yml`) wired to the block schemas, plus `npm run customise-cms`, an
  interactive/non-interactive wizard that tailors the editor to the
  collections a site actually uses.

## Quick start

Use the Node.js version specified in the
[developer reference](docs/developer-reference.md), then:

```bash
npm install          # install dependencies
npm run serve        # dev server with hot reload
npm run build        # build to _site/ (includes internal link check)
```

See the developer reference for the command inventory and verification checks.

The build needs no application secrets or server-side services. Dependency
installation, uncached Iconify icons, and configured remote source images may
require network access. The deployable artifact is the `_site/` directory —
publish it with any static host or pipeline.

## Agent Skill

[`skills/cfa-static-site-builder/`](skills/cfa-static-site-builder/) is a
portable [Agent Skill](https://agentskills.io/) for building and maintaining a
site from this template. Configure a compatible agent client to load that
directory according to the client's skill-discovery instructions. The package
travels with each fork and points agents back to the fork's live schemas,
generators, and checks rather than duplicating them.

## Starting a site from this template

Each site is a **fork of this repository**, not a dependency of it. A site's
content, configuration, and theme live in the fork, and the template's own
demo content is deleted or replaced there.

After cloning the fork, replace the `name`, `url`, and `description` in
`src/_data/site.json` before building. Missing or obvious placeholder identity
data fails the build rather than being published.

Replace this README too. Once the fork is the site, a README describing the
template misleads everyone who lands on the repository and hides the choices
the site made. Say what the site is, how it departs from the template's
defaults, and where its schemas and checks live — while keeping the pointers to
the [block reference](skills/cfa-static-site-builder/references/blocks.md),
[developer reference](docs/developer-reference.md), `CLAUDE.md`, and the
`/blocks/` gallery that anyone editing the site will need. The skill's
[project setup reference](skills/cfa-static-site-builder/references/project-setup.md#site-readme)
lists what to cover, including provenance and how the site deploys.

Updates flow one way and only when a site asks for them:

```bash
git remote add upstream https://github.com/codeforamerica/cfa-static.git
git fetch upstream
git merge upstream/main      # deliberate, reviewed, and never automatic
```

That is the point of the arrangement. A site that has shipped keeps building
exactly as it built yesterday; template changes reach it when someone chooses
to merge them, reviews what changed, and re-runs the site's own checks. The
quality gates travel with the fork, so a site that pulls an update finds out
immediately whether the update broke anything it publishes.

## Deploying to GitHub Pages

The repo ships a workflow (`.github/workflows/pages.yml`) that builds and
deploys to GitHub Pages on every push to `main`. One-time setup: under the
repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
On a fork that keeps the Pages workflow, confirm Pages is enabled the same
way; the jobs run on standard `ubuntu-latest` runners, so no extra
integration or billing is required.

The workflow handles both hosting shapes automatically: on a project site
(`https://<owner>.github.io/<repo>/`) it builds with the `/<repo>/` path
prefix and rewrites internal URLs to match; with a custom domain or a
user/organization site it builds with no prefix. Canonical URLs, the sitemap,
and feeds pick up the public site base URL via `SITE_URL`. Keep `site.json`'s
`url` set to the site's public base URL as the fallback for local and
non-workflow builds.

## Deploying to SharedServices (internal)

The repo can also publish the same site unchanged to SharedServices, CfA's
Okta-protected internal hosting. The `sharedservices-deploy.yaml` workflow
builds `_site/` from the same commit as the Pages deployment — differing only
in `SITE_URL` — then syncs it to the platform's static S3
bucket and invalidates the shared CloudFront distribution. Okta SSO is
enforced at the edge, so the site itself never handles authentication.
Deployment is manual while piloted: run **Actions → Deploy to
SharedServices** on `main`.

One-time setup is a DevOps task:

1. Register the app by adding a spec to
   `shared-services-infra/tofu/configs/static-app/specs/` and applying it.
2. Configure the `development` environment on this repo with the variables
   `AWS_REGION`, `STATIC_BUCKET`, `STATIC_PREFIX` (set to `cfa-static`),
   and `SITE_URL` (the app's endpoint URL, with no trailing slash), plus the
   `AWS_ROLE_ARN` and `CLOUDFRONT_DISTRIBUTION_ID` secrets from the platform.

The public GitHub Pages deployment is unaffected. `app.yaml` at the repo root
declares the platform registration. SharedServices serves each app at the
root of its own subdomain (`https://<name>.apps.<domain>`), so the internal
build involves no path prefix — only `SITE_URL` differs from the public one.
For a step-by-step walkthrough of the one-time
setup — written for a DevOps engineer and whoever coordinates them — see
[`docs/devops-sharedservices-setup.html`](docs/devops-sharedservices-setup.html).
Both deploy workflows merge `docs/` into the built site, so the walkthrough is
also served at `/docs/devops-sharedservices-setup.html` under each deployment's
base URL, not at a `/docs/` index page.

## Configuration

- `src/_data/site.json` — site name, URL, social links
- `src/_data/config.json` — feature toggles (breadcrumbs, theme switcher,
  navigation style, search collections)
- `src/_data/strings.json` — news/guide label and permalink overrides
- `src/_data/languages.json` / `translations.json` — languages the site
  publishes and which pages say the same thing in each

## Languages

A site is written in one language until it says otherwise, and nothing in the
template names a language.

- `_data/languages.json` lists every language the site publishes, each with a
  `code`, `hreflang`, `og_locale`, `label`, `home_url` prefix, `home_label`,
  `breadcrumb_label`, `skip_to_content_label`, and `search_label`. Exactly one
  entry has `is_default: true`.
- `_data/translations.json` pairs the pages that say the same thing, keyed by
  language code, e.g. `[{ "en": "/about/", "de": "/de/ueber-uns/" }]`.

A page's language comes from its URL prefix. The template ships one language
and no translations, which renders with no hreflang tags and no switcher.

## Development

The [developer reference](docs/developer-reference.md) tracks runtime
requirements, commands, and tooling configuration. For how to write useful
tests rather than just pass the checks, read the authored
[test quality criteria](test/TEST-QUALITY-CRITERIA.md).

Run `npm run generate-references` to refresh both generated references,
`.pages.yml`, and the CMS types from their sources and saved CMS configuration.
The individual generator commands remain available for focused updates.

## License

[MIT](LICENSE).
