# 🕸️ Neon Web Swing

Swing through an endless neon city like a spider. Chain slings, build momentum, rack up combos — one crash into the ground and it's game over.

## Gameplay

- **Sling a web**: Hold, tap the game area, click, or press `Space`. A web fires at the nearest building within 350px and you swing like a pendulum.
- **Build momentum**: Let gravity pull you down through the swing, then release at the bottom of the arc to launch forward. Time it right to fly further each swing.
- **Combos**: Chain slings back-to-back for a combo multiplier (up to ×9). Every successful attach adds bonus score.
- **Buildings are not obstacles** — swing freely through and past them.
- **You lose if**: You crash into the ground.

### Scoring
- +1 per meter traveled
- +25 × combo per successful attach
- +10 per second airborne
- Best score is saved locally on your device

## Tech Stack

- React 19
- TanStack Start / Router
- Tailwind CSS
- Bun

## Getting Started

```bash
# install dependencies
bun install

# run the dev server
bun run dev

# build for production
bun run build

# preview the production build
bun run preview
```

## Project Structure

```
src/
  components/
    SpiderGame.tsx   # core game logic, rendering, and controls
  routes/
    index.tsx        # entry route rendering the game
  styles.css
```

## License

Personal project — all rights reserved.
