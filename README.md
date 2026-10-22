# ModernMortgages.ca

Static website for Theeban Pathmanathan, Mortgage Agent Level 2 (FIN Mortgage – Dominion Lending Centres).
Plain HTML/CSS/JS: no build step, hosted on Cloudflare Pages.

## Structure
- `index.html` – home page (all sections, JSON-LD structured data, FAQ)
- `links/` – link-in-bio page (replaces old /Links)
- `assets/js/calculators.js` – Payment, Affordability, Refinance, Debt, Land Transfer Tax
- `llms.txt` – plain-text summary for AI assistants
- `robots.txt`, `sitemap.xml` – crawlers (AI bots explicitly allowed)
- `_headers`, `_redirects` – Cloudflare Pages config

## Deploy (Cloudflare Pages)
Framework preset: **None** · Build command: *(empty)* · Output directory: **/**

## Editing
Change text in `index.html` → commit → Cloudflare redeploys automatically.
Calculator assumptions (CMHC rates, stress test floor, LTT brackets) are at the top of `assets/js/calculators.js`.
