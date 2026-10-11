# Color Palette Generator

A small, dependency-free color palette generator that runs in the browser. Generate random palettes, lock the colors you like, rearrange them and copy their hex codes.

## Features

- **Generate new colors**: click **Try new colors** or press <kbd>Space</kbd> to reroll every unlocked color. Saturation and lightness stay in a range that avoids muddy or neon colors, and no two colors come out looking almost the same.
- **Color harmonies**: choose **Random**, **Analogous**, **Complementary**, **Split complementary**, **Triadic**, **Tetradic** or **Monochrome** to control how the hues relate to each other.
- **Match locked colors**: when this is on, new colors are built around the first locked color, so the palette fits the color you chose. With **Random** selected, the hues are spread evenly around the color wheel starting from that color. When it's off, each generation starts from a random hue.
- **Two view modes**: **Columns** (full-height strips) or **Grid**, with a slider for how many colors go in each row (1–8).
- **Add and remove colors**: up to 20 colors, down to a minimum of 1.
- **Set an exact hex value**: click a color's hex code and type a new one (`#3A7BD5`, `3a7bd5` or shorthand `#3ad`), then press <kbd>Enter</kbd>. <kbd>Esc</kbd> cancels, and invalid input goes back to the previous value. You can also use the built-in color picker.
- **Lock colors**: locked colors keep their value when you generate new ones.
- **Copy to clipboard**: copy any color's hex code with one click.
- **Reorder**: drag a color by its handle, or use the ← / → buttons, to see how colors look next to each other.
- **Light or dark background**: switch with the **Dark** / **Light** button. The first time you open the app, it follows your system setting.
- **Remembers your palette**: colors, lock states, view mode, grid size, harmony settings and theme are saved in `localStorage`.

All colors are shown as uppercase hex (`#RRGGBB`).

## Getting started

No build step or dependencies. Clone the repo and open `index.html` in a browser:

```sh
git clone <repo-url>
cd color-palette-generator
start index.html   # Windows (use `open` on macOS, `xdg-open` on Linux)
```

Or serve it locally if you prefer:

```sh
npx serve .
```

> Copying to the clipboard needs a secure context. Opening the file directly or serving it from `localhost` both work.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> | Generate new colors (when not typing in a field) |
| <kbd>Enter</kbd> | Apply the hex value being edited |
| <kbd>Esc</kbd> | Cancel hex editing |

## Project structure

```
index.html   Markup: toolbar and palette container
styles.css   Layout for columns/grid views and swatch styling
app.js       State, color helpers, rendering and interactions
```
