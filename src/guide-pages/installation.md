---
name: Installation
subtitle: From clone to running dev server
guide-category: getting-started
blocks:
  - type: guide-header
  - type: guide-navigation
  - type: markdown
    content: |
      ## Prerequisites

      - Node.js (npm included), using the version specified in the repository's
        `docs/developer-reference.md`
      - Git

      ## Set up

      1. Fork this repository into the account or organization that will own the site
      2. Clone that fork
      3. Set the site's real `name`, `url`, and `description` in `src/_data/site.json`
      4. Run `npm install` to install dependencies
      5. Run `npm run serve` to start the development server at `http://localhost:8080`

      The dev server rebuilds and reloads as you edit. When you want a
      production build, `npm run build` writes the whole site to `_site/`
      and checks every internal link on the way out.

      For the full command inventory and verification checks, see
      `docs/developer-reference.md` in your checkout. Keep that reference
      handy when preparing a change for review.
faqs:
  - question: What are the system requirements?
    answer: Use the Node.js version listed in the repository's `docs/developer-reference.md`. No application services or secrets are needed. Dependency installation, uncached icons, and remote source images may require network access.
    order: 1
  - question: How long does installation take?
    answer: A couple of minutes - one `npm install` and you're running.
    order: 2
  - question: Do I need to configure anything before it runs?
    answer: Set the real site identity in `src/_data/site.json` first. The build rejects missing or obvious placeholder values so they cannot be published accidentally.
    order: 3
---
