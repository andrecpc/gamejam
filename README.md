Match-3 RPG Prototype

How to run (avoid file:// CORS)
- Open a terminal in this folder and start a local static server:
  - Python: `python -m http.server 5500`
  - Node: `npx http-server -p 5500`
  - VS Code: Live Server extension
- Then open `http://localhost:5500` in your mobile/desktop browser.

Controls
- Swipe/drag a tile to swap with an adjacent one.
- Tap filled cards (Свет/Тьма/Нейтр.) to pick 1 of 3 upgrades.
- Hero moves clockwise along the border path and auto-fights enemies on contact.
- Restart button restores HP, keeps upgrades.

Data and assets
- Data: `data/tileset.json`, `data/enemies.json`, `data/upgrades.json`.
  The game has built-in fallbacks if `fetch` is blocked, so it still runs.
- Assets: icons live in `assets/icons/`. They are optional for MVP; board tiles render as colored squares. If you want images, add files named like:
  - `assets/icons/tile_red.png`
  - `assets/icons/tile_yellow.png`
  - `assets/icons/tile_blue.png`
  - `assets/icons/tile_purple.png`
  - `assets/icons/tile_green.png`

Hero and enemies assets
- Place unit icons in `assets/units/`:
  - `assets/units/hero.png` — иконка героя (32–128 px PNG, круглая или квадратная).
  - `assets/units/slime_basic.png` — иконка врага Slime (совпадает с `id` из `data/enemies.json`).
  - Рекомендуется называть файлы как `assets/units/<enemy_id>.png`.
  - Размер картинки может быть любым — движок сам масштабирует спрайт под размер клетки на дорожке (ориентир 32–128 px).
  - Сейчас спрайты опциональны (если файла нет — рисуется маркер).

Tech
- HTML/CSS + Vanilla JS modules, Canvas rendering for board/path, DOM for UI.
- Seeded PRNG for reproducibility; simple localStorage save.

Card icons
- Add optional icons for the top cards:
  - `assets/icons/card_light.png`
  - `assets/icons/card_neutral.png`
  - `assets/icons/card_dark.png`
  - Recommended aspect 1:1 (64–128 px PNG). The UI scales them automatically.

Companions and effects
- Wolf companion: `assets/units/wolf.png` (any size, scaled by the game).
- Fire orb effect: `assets/effects/fire_orb.png` (square 1:1 PNG).
