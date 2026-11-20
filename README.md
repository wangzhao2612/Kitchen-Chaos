# Kitchen Chaos

A browser-based 2D top-down cooking and restaurant game. Fetch ingredients, chop, cook, plate, serve and wash dishes, then take on a five-minute shift and a three-star rating across five original kitchens. Play solo, with an AI sous-chef, or share one keyboard with a friend.

Built with TypeScript, Vite, HTML5 Canvas and the Web Audio API. No backend, account or database is needed. Characters, art and music are original assets.

> The in-game interface is in Chinese (Simplified). Names of buttons and levels are given below with English glosses.

## What problem does it solve?

The game is designed around one player's ability to run a whole kitchen: simple keyboard controls cover the entire service flow, while heat timing, multiple orders and plate recycling add a layer of strategy.

- **One person can run the whole kitchen.** Compact maps, self-contained stations and a gradual difficulty curve let a single player cook all six dishes.
- **Low barrier to start.** After installing dependencies the game runs in a local browser, and the build output can be served by any static web server.
- **Fewer ambiguous actions and accidental losses.** One key (J) picks up and places, nearby stations show prompts, and a mistakenly picked, unprocessed ingredient can be returned to its crate.
- **Readable business feedback.** Orders are shown with icons and quantities, customer expressions and patience bars signal urgency, and the results screen reports score, revenue and ingredient waste.

## Features

| Feature | Details |
| --- | --- |
| Chef control | WASD / arrow keys, acceleration and smooth stopping, collisions, dash with cooldown, follow camera |
| Ingredients and processing | 11 ingredients; pick up, place, return, chop, auto-cook and combine onto plates; interrupted work keeps its progress |
| Full cooking loop | Six dishes with component and state validation, a serving window, customers who collect their food, a conveyor belt that returns dirty plates, and direct dish washing |
| Customers and orders | Parties of one or two; orders appear only after seating, and only dishes from the current level's menu; quantities count down per dish |
| Time and challenge | 300-second rounds; 90 seconds of customer patience; burn warnings; fire and extinguishing in kitchen 5; the last two kitchens add dynamic corridors and moving counters |
| Scoring and economy | Three-star thresholds, speed bonus, combo, perfect-heat bonus and walkout penalty; ingredient prices, revenue, cost, net profit, satisfaction tips and waste breakdown |
| Throwing | Toss held food along your facing direction onto the first empty counter or chopping board within 4.5 tiles, with a landing marker preview |
| Achievements | Per-run badges for combo, perfect heat, throwing, zero waste, tips and no walkouts, shown on the results screen |
| Two-player modes | Solo, co-op with an AI partner chef, or local two-player on one keyboard; the camera frames both chefs |
| Interface and saving | Main menu, level select, cookbook, volume settings, pause, a one-page level briefing and results screen; scores and settings are saved locally |
| Graphics and sound | Original cartoon characters, stations and icons, work animations and particles; original level music, sound effects, mute, and the music speeds up for the final 30 seconds |

There is no online multiplayer. Local co-op is limited to two chefs on one keyboard (or one chef plus the AI partner).

## Installation

### Requirements

- Node.js 22.12 or newer with npm. The current Vite toolchain also supports Node 20.19 or newer on the 20.x line.
- A modern desktop browser on Windows or macOS with Canvas, Web Audio API and keyboard input.
- A window of at least 1000 × 700 is recommended; the interface also has a narrow-window layout. There is currently no touch or gamepad mapping.

### Install and start the dev server

After downloading or copying the project, open a terminal in the project root (the folder containing `package.json`) and run:

```sh
node --version
npm --version
npm install
npm run dev
```

Open the address printed in the terminal, which defaults to [http://127.0.0.1:5173/](http://127.0.0.1:5173/). If the port is taken, Vite may pick another one; go by the actual output. The dev server supports hot reload. Keep the terminal running, and press Ctrl+C to stop it.

Downloading npm dependencies for the first time usually needs network access. The game assets and music are included in the project, so no external game service is needed once it is running, and you do not have to install any drawing or music-production tools.

### Build and production preview

```sh
npm run build
npm run preview
```

`npm run build` type-checks the TypeScript and then produces `dist/`. The standard preview uses [http://127.0.0.1:4173/](http://127.0.0.1:4173/) by default; go by the actual terminal output and keep the terminal running.

To start the game in the background on your machine, run this after installing dependencies:

```sh
npm run play
```

This builds the game and starts a background preview at the fixed address [http://127.0.0.1:5174/](http://127.0.0.1:5174/). An existing game service is reused. The service keeps running after the launching command is closed, and you need to run the command again after a reboot. The log is `.kitchen-chaos-preview.log`, and the PID of a newly started service is printed in the terminal; end that process to stop the background service.

### Static deployment

Publish the contents of the built `dist/` folder at the root path `/` of a static website. No server-side program is required. Assets currently use absolute paths, so deploying to a subdirectory such as `/game/` requires adjusting the build configuration and the asset paths in the code.

Serve it over HTTP / HTTPS. Do not open `index.html` by double-clicking it, because `file://` is not supported.

## How to play

### Starting a round

1. Open the game page and choose "开始开餐" (start service) or "选择关卡" (select a kitchen). If you already have progress, the main button reads "继续开餐" (continue service).
2. Read the level briefing, the menu and the star goals. The briefing screen does not use up round time.
3. Choose "准备好了，开餐！" (ready, open the kitchen!) to start the five-minute shift. In the top-right corner of the briefing you can switch between solo, AI partner and local two-player.
4. Wait for customers to be seated and order, then cook using the dish icons, ingredient-processing icons and pending quantities in the top-left corner.
5. Deliver finished dishes to the serving window. You are rewarded once the conveyor belt delivers the dish to the customer. When the round ends, review your score and business summary.

Menus can be navigated with the arrow keys / WASD or Tab, and confirmed with J / Enter. On the sound settings screen, the left and right arrow keys adjust the current volume slider.

### Keyboard controls

| Key | Action |
| --- | --- |
| WASD / arrow keys | Move |
| J | Pick up, place, return an ingredient, add food to a plate, plate food, serve |
| Hold Space | Chop, wash dishes; extinguish fires while holding an extinguisher |
| K | Dash, 1.2-second cooldown |
| L | Throw held food along your facing direction onto the first empty counter or chopping board within 4.5 tiles (plates cannot be thrown) |
| P / Esc | Pause / resume during play |
| R | Open / close the cookbook; opening it during play pauses the game |
| M | Toggle mute |

**Two-player modes.** Click the mode button in the top-right of the level briefing to cycle through solo, two-player with an AI partner, and two-player with a human partner. Two-player runs count as practice and never change saved stars.

- **AI partner:** an orange-aproned second chef that cooks, serves and washes dishes on its own, using the same rules as you. It avoids dishes you are already assembling.
- **Local two-player:** player 1 uses WASD + J, Space, K and L. Player 2 uses the arrow keys + `.` to pick up and place, `/` (hold) to work, `,` to dash and `;` to throw.

You can carry one item at a time. A golden outline marks the station you are interacting with, and the bottom prompt explains the available action. Chopping and washing need empty hands; processing can be interrupted and keeps its progress. Pausing, losing window focus or switching browser tabs freezes customers, stoves, the conveyor belt and the round timer.

### Making your first salad

1. Go to the lettuce crate and press J to take one, then press J at the chopping board to put it down. With empty hands, hold Space for two seconds to chop it.
2. Press J to take the chopped lettuce and put it on an empty counter. Take a clean plate from the plate rack, return to the lettuce and press J to plate it, then put the plate back on the counter.
3. Chop a tomato in the same way, and with the tomato in hand press J facing the plate on the counter to add it. With empty hands, press J to pick up the finished salad.
4. When there is a salad order, carry the plate to the serving window and press J to serve, then wait for the conveyor belt to deliver it to the customer.
5. After the customer finishes eating, the dirty plate travels along the same belt to the sink at the end of the top-left corner. Stand next to it with empty hands and hold Space for two seconds to wash it; the clean plate returns to the plate rack automatically.

You can also put an empty plate on a counter first and add ingredients one by one. With a plate in hand, press J facing chopped food on a chopping board or cooked food in a pot to plate it directly.

### Mistakes, heat and plate management

- **Picked the wrong ingredient:** a single unprocessed ingredient with no processing progress can be returned to its crate with J. Returns cost no waste or ingredient cost. Food that has been chopped, cooked, combined or plated can be parked on a counter or thrown in the trash can. Emptying a plate that holds food keeps the plate.
- **Managing heat:** food placed on a stove cooks automatically. When done, it has a 12-second safe window followed by a 5-second burn warning, during which you can still plate it. **Perfect heat:** if you plate straight from the stove with a clean plate within 4 seconds of finishing, every food plated this way earns an extra 20 points when the dish reaches the customer (the prompt bar shows "完美火候", perfect heat). Taking the food out first and plating it later, or waiting more than 4 seconds, does not count. Burnt food cannot be served. In kitchen 5, continued heating for 8 seconds sets the stove on fire; grab the extinguisher and hold Space next to the burning stove for three seconds.
- **Recycling plates:** kitchen 1 has three plates, kitchen 2 has four, and the last three have five. Customers put the dirty plate back on the belt 8 seconds after they start eating. The sink counter includes the plate currently being washed. Keep holding Space to wash the whole queue one by one; releasing it keeps your progress.

### Reading orders and the results screen

A customer has **90 seconds of patience** from the moment they order. It keeps draining until the food is received, including while the food is on its way. The progress bar under each dish card shows the lowest remaining patience among the customers still waiting for that dish: green, then yellow, then red. Customer expressions (relaxed, anxious, angry) give the same hint. The screen does not show a countdown in seconds, and eating has no progress bar.

The number on a dish card is the quantity still to make; it drops by one for each dish submitted, and the card disappears once all are submitted. Rewards, completed counts and revenue increase only after the dish is actually delivered. A customer who runs out of patience leaves, costing 30 points and breaking the combo. A dish that arrives too late earns no reward, and its ingredients count as waste.

The results screen shows score, stars, completed dishes, walkouts, best combo, perfect-heat and throw counts, achievement badges, revenue, total ingredient cost, net profit and a waste breakdown. Discarded food, burnt food that was cleared, dishes delivered too late and ingredients left unsold at closing all count as waste at unit price. A dish that has been received and is being eaten does not count as waste.

## Recipes, levels and prices

### The six dishes

| Dish | Requirements | Base score | Ingredient cost / price (coins) |
| --- | --- | ---: | ---: |
| Garden salad (蔬菜沙拉) | Lettuce, chopped 2 s + tomato, chopped 2 s | 100 | 4 / 8 |
| Tomato soup (番茄汤) | Tomato, chopped 2 s + onion, chopped 3 s, added one after the other to the same pot and boiled 10 s | 150 | 4 / 8 |
| Classic burger (经典汉堡) | Bread + beef, fried 6 s + lettuce, chopped 2 s | 160 | 9 / 18 |
| Cheeseburger (芝士汉堡) | Bread + beef, fried 6 s + cheese | 150 | 10 / 20 |
| Chicken rice (鸡肉饭) | Rice, boiled 8 s + chicken, fried 7 s | 180 | 6 / 12 |
| Veggie pasta (蔬菜意面) | Noodles, boiled 7 s + tomato, chopped 2 s + carrot, chopped 3 s | 170 | 6 / 12 |

Bread and cheese can be used as-is; every other component must be in the right processing state. Tomato soup starts cooking automatically once both chopped ingredients are in the pot. The game rejects duplicate, wrongly processed or off-menu combinations. Potato is a choppable practice ingredient in kitchen 5 and is not part of the six ordered dishes.

### The five kitchens

Each level lasts 300 seconds, and earning one star unlocks the next. Customers can only order dishes from the current level's menu.

| Kitchen | Menu and new challenge | 1 / 2 / 3-star score |
| --- | --- | --- |
| Sunny Side (阳光厨房) | Salad; learn chopping, plating, serving and washing | 300 / 600 / 900 |
| Burger Club (汉堡餐厅) | Classic burger, cheeseburger; two stoves and burning | 400 / 750 / 1100 |
| Lunch Rush (繁忙食堂) | Salad, both burgers, chicken rice; three stoves and multitasking | 450 / 850 / 1250 |
| On the Road (移动厨房) | Salad, tomato soup, classic burger, veggie pasta; moving counters and alternating corridors | 450 / 850 / 1050 |
| Grand Finale (终极厨房) | All six dishes and 11 ingredients; four stoves, dynamic corridors, fire and extinguishing | 500 / 950 / 1250 |

### Ingredient prices and profit

| Ingredient | Cost per portion (coins) |
| --- | ---: |
| Tomato, lettuce, onion, carrot, potato | 2 each |
| Rice, bread, noodles | 2 each |
| Beef | 5 |
| Chicken | 4 |
| Cheese | 3 |

Each dish sells for twice its ingredient cost, so ingredients make up **50%** of the selling price.

```text
Revenue          = sum of the selling prices of dishes actually delivered
Total ingredient cost = cost of ingredients in sold dishes + waste cost
Net profit       = revenue - total ingredient cost
Satisfaction tip = 25% of the dish price (rounded, at least 1 coin) when the customer
                   still has more than 2/3 of their patience on receiving the food;
                   counted separately and not included in revenue or net profit
```

Coins reflect business results, while score and stars reflect challenge results; the two are calculated separately.

## Saving and troubleshooting

Best scores, stars, unlock state, mute and volume are saved automatically in the browser's `localStorage` under the key `kitchen-chaos-v1`. A round that has not finished is not saved. A different browser, address or port uses a separate save: for example the 5173 dev server and the 5174 background preview do not share progress, and clearing site data also clears progress.

| Problem | What to do |
| --- | --- |
| The page does not open | Make sure the command started successfully and open the address the terminal actually shows; a foreground service must keep running. If the background start fails, check `.kitchen-chaos-preview.log` |
| Port 5174 is in use | The background script refuses to reuse another app's service. Free the port, or use a foreground preview on a free port: `npm run preview -- --port 5175` |
| No sound | Press a key or click on the page first to enable browser audio, then check mute and the sound settings; the music also pauses while the game is paused |
| Keys do nothing | Give the game page focus, make sure you are not on the pause or briefing screen, and check the controls hint at the bottom |
| Chopping or washing will not start | Free both hands, stand next to the right station and hold Space; the chopping board needs a choppable ingredient and the sink needs a dirty plate |
| Cannot plate or serve | Check processing state, component count and the level's menu against the cookbook (R), and make sure a matching order still exists |
| Old progress is missing after changing how you start the game | Make sure the browser, address and port are the same; saves are kept per website origin |

## Development, checks and project layout

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run typecheck` | Type-check the TypeScript |
| `npm test` | Run the Vitest logic tests, including recipes, restaurant, costs, characters, the AI partner and the solo route |
| `npm run build` | Type-check and build production files |
| `npm run preview` | Preview `dist/` in the foreground |
| `npm run play` | Build and start the background preview on port 5174 |
| `npm run test:e2e` | Run the Playwright browser tests |
| `npm run clean:test` | Delete screenshots, reports and temporary test output, keeping test sources and required fixtures |

Before running the browser tests for the first time, install Chromium:

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright starts the 5173 dev server when needed. The full run includes real keyboard play, level flows and standalone UI layout checks, and takes a while. For targeted scenarios, prefer the real records this run generates in `artifacts/`; without fresh records, use the historical game records without account credentials in [tests/fixtures/](tests/fixtures/README.md). The historical fixtures do not represent new clear results from the current version.

Screenshots and records are saved in `artifacts/`, and reports can be viewed with `npx playwright show-report`. After testing, run `npm run clean:test` to clear the output. `artifacts/`, `playwright-report/`, `test-results/`, local logs and environment configuration are all in the ignore rules; when publishing the source, still exclude those folders and `node_modules/`. Completed verification, dates, differences between versions and known limitations are in [TESTING.md](TESTING.md).

For a production check, start the 5174 preview first and then run this in another terminal:

```sh
node scripts/check_production.mjs
```

Run `node scripts/check_production.mjs 5` to check the kitchen 5 production bundle; prefer the unlock record generated by the current run, and fall back to the historical test fixture if there is none.

```text
src/
  main.ts          game entry and styles
  game/            fixed-step simulation, input, audio, saving, AI partner chef
  cooking/         data-driven recipes, processing and combination validation
  restaurant/      customer ordering, patience, delivery, eating and plate return
  levels/          the five maps, stations, obstacles and difficulty data
  rendering/       Canvas art, character animation, camera and particles
  ui/              menus, prompts, HUD, cookbook and results
public/            character atlas, cover and audio tracks shipped with the game
assets/            original art prompts, MIDI / WAV masters and sound-font licence
scripts/           music generation, background preview and production-check scripts
tests/             logic and browser tests
```

Rendering uses `requestAnimationFrame`, and the logic runs on a fixed 60 Hz time step. The simulation layer does not depend on the DOM, so the rules can be verified on their own; at runtime there is no dependency on a game engine or a backend service.

## Art and music assets

The chef head atlas and the menu cover are AI-generated, with the prompts in [assets/art/prompts.md](assets/art/prompts.md). The body, ingredients, kitchen stations, actions and feedback are mostly drawn on the Canvas. The menu title is an original SVG, and the game does not use characters, art or soundtrack recordings from any existing work.

The generated original music is played through the Web Audio API, and the action sound effects are synthesised in the game. `assets/music/` keeps the MIDI, the WAV masters and the sound-font licence, and `public/audio/` keeps the Ogg / MP3 files the game uses.

Only when regenerating the music do you need Python with numpy, scipy and soundfile, plus FluidSynth, LAME and a separately obtained GeneralUser GS SoundFont:

```sh
python3 scripts/create_music.py --soundfont /path/to/GeneralUser-GS.sf2
```

The GeneralUser GS sound font is by S. Christian Collins; see [assets/music/GeneralUser-GS-LICENSE.txt](assets/music/GeneralUser-GS-LICENSE.txt) for its licence. None of these music-production tools is needed to run the game.
