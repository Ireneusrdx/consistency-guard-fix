# Stone theme — implementation cheat sheet

Consistency Guard is rebuilt in the **Astryx Stone** language
(`npx @astryxdesign/cli theme add stone`, v0.6.3). Stone is a warm, earthy
neutral: **monochrome dark accent**, pastel sentiment badges, pill buttons,
Montserrat headings / Figtree body / JetBrains Mono code.

## Tailwind class mapping (use these, not raw hex)

| Intent | Classes |
|---|---|
| Page background | `bg-[#f3f3f5]` on the page wrapper (body already sets it) |
| Card surface | `bg-white border border-[#e2e2e8] rounded-xl shadow-card` (or `<Card>`) |
| Primary heading text | `text-[#25252a]` (headings render in Montserrat via CSS) |
| Secondary text | `text-[#5e5e63]` (== `text-stone-600`-ish; prefer `text-stone-500/600`) |
| Muted text | `text-stone-500` |
| Borders / dividers | `border-[#e2e2e8]` |
| Primary button | `<Button variant="primary">` → dark stone pill, white text |
| Secondary button | `<Button variant="secondary">` → transparent pill, 1.5px `#83838a` border |
| Danger | `<Button variant="danger">` → pastel red bg `#f9dcd7`, text `#58413e` |
| Inputs | `<Input>` / `<Textarea>` / `<Select>` → 8px radius, `#e2e2e8` border |
| Focus ring | stone (`ring-stone-400`) — handled in base CSS |

`bg-primary-600` / `bg-secondary-600` / `bg-brand-600` now resolve to the
dark-stone accent ramp — old teal/indigo classes automatically render Stone.
Do NOT introduce new teal/indigo/emerald/amber/red classes; use the
sentiment tokens below.

## Sentiment badges / pills (Stone categorical, pastel)

| Variant | Classes |
|---|---|
| success | `bg-[#d0e9ce] text-[#374c36]` |
| warning | `bg-[#f4e1b7] text-[#524622]` |
| error | `bg-[#f9dcd7] text-[#58413e]` |
| info | `bg-[#d7e4f5] text-[#3c4856]` |
| neutral/default | `bg-[#e2e2e8] text-[#46464b]` |

`<Badge variant="...">` already maps these. Status dots: use the deep text
hex as the dot color (e.g. `bg-[#374c36]`).

## Rules for page rebuilds

1. **Logic is frozen.** Keep every hook, fetch, handler, prop, and route
   identical. Change only classNames and presentational JSX structure.
2. **No fake UI.** Never invent data, scores, or states. `Unavailable`
   stays `Unavailable`.
3. **Headings** (`h1`–`h4`, `.type-display`) render Montserrat automatically.
   Body text is Figtree automatically. Code/`pre` is JetBrains Mono.
4. **Buttons are pills** (`rounded-full`) — use `<Button>`, don't hand-roll.
5. **Cards**: 12px radius (`rounded-xl`), `#e2e2e8` border, `shadow-card`.
   Page background stays `#f3f3f5`; don't paint colored section washes.
6. **Charts**: monochrome stone series (`#25252a`, `#83838a`, `#d4d4da`);
   ONE accent series may use `#25252a` dark. Gridlines `#e2e2e8`-ish thin.
   No gradients, no 3D.
7. **Icons**: `text-stone-500` default; deep stone `#25252a` for emphasis.
8. **Keep** all `dark:` variants as they are (light-mode-first redesign).
9. **Keep** accessibility: focus-visible rings, aria labels, reduced-motion
   handling, semantic HTML.
10. Robot-shield logo stays the canonical brand mark (don't recolor it).
