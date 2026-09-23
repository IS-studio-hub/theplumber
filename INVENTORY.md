# Site Inventory — lisa.locomotive.ca

Reference: https://lisa.locomotive.ca/en  
Analyzed: 2026-09-18

## Scope note

`lisa.locomotive.ca` is a **dedicated L.I.S.A. (Locomotive Interactive Super Assistant) experience**.  
Sitemap entries for `/en/work`, `/en/agency`, `/en/careers`, `/en/contact`, `/en/privacy-policy`, and case studies currently return **404** on this subdomain (they live on `locomotive.ca`).  

This recreation targets **everything publicly accessible on `lisa.locomotive.ca`**, primarily the EN/FR LISA conversational product, plus shared chrome (header, menu, preloader, cookie consent, error template).

---

## 1. Pages and routes

| Route | Status on lisa.* | Purpose |
|-------|------------------|---------|
| `/en` | Live | LISA experience (English) |
| `/fr` | Live | LISA experience (French) |
| `/en/work`, `/en/agency`, `/en/careers`, `/en/contact`, `/en/privacy-policy` | 404 | Linked in sitemap/header markup but not served here |
| `/en/work/*` case studies | 404 | Sitemap only |
| Error template | Live | Generic 404 (`data-template="error"`) |

**Implemented recreation routes**
- `/` → redirect to `/en`
- `/en`, `/fr` — LISA
- `/en/privacy-policy`, `/fr/privacy-policy` — lightweight privacy stub (linked by cookie UI; not available on subdomain)
- catch-all 404 page matching Locomotive error chrome

---

## 2. Global components

| Component | Class / module | Notes |
|-----------|----------------|-------|
| Preloader | `.c-preloader` | Black full-screen; Locomotive wordmark SVG; ~1.2s min; `locomotive.quickpreload` shortens later visits |
| Header | `.c-header` | Logo left, center glyph icon, CTA “Let’s talk” (desktop), Menu toggler (≤1024px) |
| Header background | `.c-header_bg` | Transparent on `data-theme=lisa` |
| Mobile menu | `.c-menu` | Full-bleed indigo `#312DFB`; Let’s talk + Store; FR/EN switch; location emoji |
| Cookie consent | CookieConsent / `data-module-cookie-consent` | Box bottom-right; Accept All / Necessary / preferences |
| Video modal | `.c-video-modal` | Close control (culture / media expansion) |
| Focus / hover utilities | `data-module-hovers`, `data-hover-shuffle` | Letter-shuffle hover on logo/nav |

On LISA template, desktop nav links Work/Agency/Careers are **hidden** (`display:none`); primary CTA is contact/LISA flow.

---

## 3. Page-specific components (LISA)

| Component | Role |
|-----------|------|
| `LisaApp` | Root state machine; step history; model (goal, form fields) |
| `LisaMedia` | HLS Mux video stage (top); gray backdrop |
| `LisaStep` | Dialog + previous line; expanded/collapsed |
| `LisaDialog` | Typewriter / letter-reveal text; random line from `dialog.list` |
| `LisaChoices` | Pill choice buttons; conditional choice maps (budget by project type) |
| `LisaInputs` | text / email / textarea / file / date / select |
| `LisaNextButton` | Circular → submit for input steps |
| `LisaBack` | Circular undo |
| `LisaSound` | Ambient + mute toggle pill |
| `LisaProgress` | Bottom scaleX progress bar |
| `LisaCopyChoice` | Clipboard copy for email choice |

**Conversation branches (100 steps)**
1. **intro → greeting**
2. **project-*** (RFP): name → company/role → type → services? → budget → deadline → brief/files → email → processing → completion
3. **job-***: permanent offers / empty / freelance
4. **quick-word-***: message → email → processing → completion
5. **culture-***: story hub + collaboration / agency-life / retreat / personal-growth / mentality paths
6. **form-error**

---

## 4. Interactive features

- Step navigation (forward via next/choices; back via history)
- Randomized dialog strings per step
- Model updates from choices (`goal`, `projectType`, `budget`, …)
- Conditional choice sets (e.g. budget options by `projectType`)
- Form validation (required text/email; file optional)
- Click-to-copy email with confirmation toast/text
- Ambient looping audio + mute
- Preloader timing + quick-preload session flag
- Mobile menu open/close (`html.has-menu-opened`)
- Cookie consent categories (necessary / analytics)
- Language switch EN ↔ FR (reload content pack)
- Form POST targets (recreated as local API mocks — no reCAPTCHA secret):
  - `POST /api/rfp-enquiries`
  - `POST /api/job-enquiries`
  - `POST /api/general-enquiries`

---

## 5. Animations

| Animation | Behavior |
|-----------|----------|
| Preloader appear | Scale 0.9→1, opacity, ~0.9s ease |
| Preloader exit | Opacity fade ~0.9s |
| Dialog letter reveal | Per-character / word stagger (SplitText-like) |
| Step expand/collapse | Transform on dialog; panel grow |
| Progress bar | `scaleX(progress)` 0.3s |
| Choice hover | Underline / shuffle |
| Media crossfade | Video swap between steps |
| Back button | Scale / press |
| Page theme transitions | `background-color` 0.3s |
| Menu open | Full-screen reveal |

Easing common: `cubic-bezier(0.215, 0.61, 0.355, 1)` (easeOutCubic)

---

## 6. Assets

| Asset | Source | Recreation approach |
|-------|--------|----------------------|
| LISA character videos (Mux HLS) | `stream.mux.com/*.m3u8` (~42 unique) | Use public stream URLs where reachable; fallback poster/gradient if blocked |
| Ambient audio | `/assets/lisa/fx/ambient.mp3` | Copied (publicly served) |
| Preloader / logo SVG | Inline in HTML | Recreated from public SVG paths |
| Favicons | `/assets/images/favicons/*` | Copied |
| OG image | `/uploads/metadata/...` | Optional stub |
| HelveticaNowDisplay | Proprietary | **Replacement**: Switzer / system neo-grotesque stack |
| PP Locomotive New (LocomotiveNew) | Proprietary | **Replacement**: open display light (Cabinet Grotesk / similar) |
| Client case imagery | Not on this subdomain | N/A |

---

## 7. Fonts and design tokens

**Fonts (original)**  
- UI: `HelveticaNowDisplay`  
- Display: `LocomotiveNew` (`PPLocomotiveNew-Light`)

**Tokens (from `:root`)**
```
--color: #000000
--color-bg: #FFFFFF
--font-size: 15px (scales up at 1600 / 2000 / 2400+)
--font-size-medium: 18px
--font-size-h1 … h6, --font-size-huge
--header-height: 4rem
--grid-columns: 4 (mobile) / 8 (tablet) / 12 (desktop implied by header cols)
--grid-margin: 1.333rem
--grid-gutter: 10px
--border-size: 1px (2px ≥1025)
--menu-color: #FFFFFF
--menu-color-bg: #312DFB
Themes: lisa (white), dark, primary (#DA382E), secondary (#312DFB)
```

Breakpoints: 699 / 1024 / 1025 / 1200 / 1600 / 2000 / 2400

---

## 8. External services / API dependencies

| Service | Use | Recreation |
|---------|-----|------------|
| Mux | HLS character videos | Public playback URLs / placeholders |
| Google reCAPTCHA | Form spam protection | Omitted (no site secret); honeypot + local validate |
| Google Analytics `G-WYYJ9ZP43V` | Analytics | Omitted (tracking secret / not needed) |
| Cloudflare | CDN / bot | N/A |
| CookieConsent | CMP | Lightweight custom equivalent |
| `/api/rfp-enquiries` | Project form | Local Next.js route mock |
| `/api/job-enquiries` | Careers form | Local mock |
| `/api/general-enquiries` | Quick word | Local mock |
| Store | `https://store.locomotive.ca` | External link only |
| Main site | `https://locomotive.ca` | Logo link |

**Stack observed:** Twig SSR shell + Vue 3 LISA module + GSAP + HLS + modular JS (`app.js` / `vendors.js`)

**Recreation stack:** Next.js (App Router) + React + CSS Modules / global tokens + hls.js + Framer Motion / CSS transitions
