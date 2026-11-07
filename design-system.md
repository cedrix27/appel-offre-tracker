# WelcomeBack design system

WelcomeBack is a loyalty + digital menu SaaS for restaurants in francophone West Africa (Burkina Faso first, prices in FCFA/XOF). Customers open their loyalty card from an SMS link on a phone (often mid-range Android, 360–414px wide). Managers use a dashboard; waiters use a phone terminal. All UI copy is in French.

## Visual language — "papier chaud"
Calm, editorial, warm. Off-white backgrounds, near-black ink, ONE accent (violet), pastel tones used only to carry meaning. Very rounded corners, thin borders instead of shadows, tight negative letter-spacing on big numbers/titles. References: Linear, Attio, Cal.com — but warmer (beige greys, not blue greys).

## Colors (use only these)
- Ink `#171716` (text, primary buttons, dark card), ink hover `#30302d`, night `#12110f`, night card `#1c1c1c`
- Canvas `#fafaf8`, paper `#f7f7f5`, surface `#ffffff`
- Lines `#e9e8e5`, `#f0eeeb`; segment `#f3f1ed`; avatar `#ece9e5` / `#645f59`
- Text secondary `#85817c`, tertiary `#77736f`, hint `#aaa6a1`, quiet `#bbb7b1`
- Violet accent `#6963d9`, eyebrow `#7c78ca`, violet ink `#5e58c9`, violet soft `#f2f1ff`, wash `#f8f7ff`, line `#d9d6ff`, violet on dark `#c7c3ff`
- Success `#287a57` / soft `#ecfdf5` / line `#b9ead7`; on dark mint `#a9f0cf`
- Warning (rewards / gifts) `#c9772b` / soft `#fff0e3` / line `#fee1a6`; on dark peach `#f5d8b0`, gold star `#e4a93a`
- Danger `#c94336` / soft `#fdeceb`

## Typography
Plus Jakarta Sans (variable). Weights: 600 for titles/labels/numbers, 500 for buttons, 400 body. Fixed px sizes: body 13–14px, meta 11–12px, eyebrow 11px uppercase tracking .13em semibold. Big numbers 48–64px with tracking -0.045em, tabular-nums. The bigger the text, the more negative the tracking.

## Shapes & depth
Radii: buttons/inputs 12px, icon chips 16px, content cards 20px, panels 22px, hero/loyalty card 26–28px, pills full. Cards = 1px `#e9e8e5` border on white, no shadow. Only floating elements get soft warm shadows (`0 24px 60px rgba(23,23,22,.25)` for the dark loyalty card). Primary button is BLACK, not violet.

## Motion
`fade-up` 0.6s cubic-bezier(.22,1,.36,1) staggered 40–60ms; `pop` scale .7→1 for newly earned items; respect prefers-reduced-motion.

## Customer loyalty card (/card/[token])
Must feel like a premium membership card you want to fill. Restaurant name + city at top with a refined monogram (initials) when no logo. Two program modes chosen by the restaurant:
- **Points**: big point balance, progress towards next reward, rewards list with cost in points.
- **Stamps (tampons)**: classic coffee-shop card — a grid of N stamp slots (typically 6–12) where filled slots are stamped and empty ones are dashed circles; the last slot is the reward (gift). One visit = one stamp. Shows "X / N tampons" and "Plus que K visites pour …".
Always visible: customer first name, visit count, unlocked rewards (with instructions to ask the waiter + secret code from SMS), recent visits, link to the restaurant menu.

Accessibility: 44px targets, readable mobile type, color never the sole carrier of meaning, no icon-only critical actions. Use only these fonts, colors, spacing and component styles.
