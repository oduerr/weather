# Refactoring Requirements – FogCast Static App

This document guides the step-by-step refactoring of the FogCast weather viewer. The goal is to modularize the codebase in a way that supports future configurability (e.g., panel toggles) without overcomplicating the current design.

---

## General Goals

- Separate JS logic from `index.html`
- Use ES modules (`import` / `export`)
- Extract logic into testable, non-DOM-dependent functions
- Maintain compatibility with `file://` and Live Server
- Prepare for future modular visualizers and panel toggling

---

## Task 1 – Move inline JS to `main.js`

- [ ] Create a `js/` folder
- [ ] Move all `<script>` content from `index.html` to `js/main.js`
- [ ] Replace `<script>` tag with:
  ```html
  <script type="module" src="./js/main.js"></script>
  ```

---

## Task 2 – Extract API logic to `api.js`

- [ ] Move data-fetching logic into `js/api.js`
- [ ] Export `async function getWeatherData()`
- [ ] Add fallback to load `fixtures/sample.json` for local testing

---

## Task 3 – Extract plotting logic to `plot.js`

- [ ] Move charting/rendering code to `js/plot.js`
- [ ] Export a function like `renderTemperature(data)` or similar
- [ ] Make sure it works with both live and fixture data

---

## Task 4 – Add fixture support

- [ ] Create a `fixtures/` folder
- [ ] Add a working example data file (e.g., `sample.json`)
- [ ] Ensure `api.js` can switch between real and fake data

---

## Task 5 – Prepare for future configurability

- [ ] Create a `config/appConfig.js` that exports:
  ```js
  export const PANELS = ['temperature'];
  ```
- [ ] In `main.js`, loop over `PANELS` to decide what to render
- [ ] Create a simple `visRegistry.js` that maps panel names to functions

---

## Task 6 – Cleanup and manual test

- [ ] Make sure all imports work under `file://` or Live Server
- [ ] Add doc comments to all exported functions
- [ ] Test fallback mode with fixture data
- [ ] Confirm JS is now modular and readable

---

## Agent Usage

To use an agent (e.g. Cursor) efficiently:

Start with:

> “Implement Task 1 from `refactor_requirements.md`: Move inline JS to `main.js`, create `js/` folder, and link it as ES module in `index.html`.”

Then progress step by step:

> “Now implement Task 2…”

Add inline markers like:

```js
// TODO(agent): extract this function to api.js
// TODO(agent): make this function pure
```

---

## Notes

You can always revise this document as the refactor evolves.  
Start lean, iterate later.
