# UI audit before polish

Screenshots in this folder: desktop 1440px and mobile 390px for every view (production build).

Unfinished / inconsistent:

1. **No app shell.** Two competing navigations (a Seeded/Live toggle top-right and a six-tab strip), no left nav, no top bar, no environment status.
2. **Metrics are not prominent.** Gate and eval numbers sit in small tiles inside a boxed card; they use proportional digits (no tabular numbers).
3. **Findings hide evidence.** Cards show detail text but never the `evidence` list. Markdown backticks in titles and details are rendered literally (`` `json.parse` ``).
4. **Colour carries meaning alone.** Label and severity are coloured chips/text with no icon; severity colours compete with label colours (red/orange/yellow all in one row).
5. **No theme support.** Dark only, no light theme, ignores `prefers-color-scheme`.
6. **Evidence graph** is a fixed 1000px SVG: clipped on mobile, no legend, no click-to-inspect, truncated labels with no way to read them, edge types distinguished only by colour.
7. **Context budget** is a raw table of files; no bars, no total emphasis.
8. **Diffs and handoff text** are plain `<pre>` blocks with no copy button.
9. **States.** Tournament/Handoffs views are empty until the user goes back to Verdicts and clicks a button; no loading, empty or error state per view; Live scan gives no guidance when empty; errors are a single red box and are not scrubbed for token-like strings.
10. **Accessibility.** No visible focus styling beyond browser default, no skip link, tab strip is not a landmark with current-page semantics, no reduced-motion handling.
11. **Layout.** Page grows into a very long single column; header/nav wrap awkwardly at 390px; tiles reflow unevenly (5 tiles in a 2-col grid).
