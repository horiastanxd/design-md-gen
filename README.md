# design-md-gen

CLI that generates a `DESIGN.md` for your project. It reads your Tailwind config, CSS variables, and package dependencies to produce a design system reference that AI coding agents can use to build consistent UIs.

`DESIGN.md` tells agents which colors, fonts, breakpoints, and component patterns to use - without you having to explain it every time.

## Usage

```bash
npx design-md-gen
```

Or install globally:

```bash
npm install -g design-md-gen
design-md-gen
```

Pass a path to run it on a different project:

```bash
design-md-gen ./my-project
```

### Options

| Flag | Description |
|------|-------------|
| `--output <file>` | Write to a different file name |
| `--stdout` | Print to stdout instead of writing |
| `--overwrite` | Overwrite an existing `DESIGN.md` |
| `--version` | Print version |
| `--help` | Print help |

## What it detects

| Source | Extracted |
|--------|-----------|
| `package.json` | Framework, UI library, icon library, dark mode, animations |
| `tailwind.config.{js,mjs,cjs}` | Custom colors, fonts, breakpoints, border radius |
| `src/app/globals.css` (and other global stylesheets) | CSS custom properties, shadcn/ui tokens |
| `tokens.json` / `design-tokens.json` | W3C Design Tokens |
| `src/components/` (and variants) | Component directory structure |
| `.storybook/` | Component documentation setup |

Detected UI libraries: shadcn/ui, Material UI, Chakra UI, Ant Design, Radix UI, Headless UI, daisyUI, NextUI.  
Detected icon libraries: Lucide React, Heroicons, react-icons, Phosphor Icons, Tabler Icons.

## Output example

Running `design-md-gen --stdout` on a Next.js + Tailwind + shadcn/ui project:

```
# DESIGN.md

Design system reference for AI coding agents.

## Stack

- Framework: Next.js
- UI: Tailwind CSS + shadcn/ui
- Icons: Lucide React
- Animations: Framer Motion
- Dark mode: next-themes

## Colors

shadcn/ui semantic tokens (from `src/app/globals.css`):

    --background: 0 0% 100%;
    --foreground: 222.2 84.5% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --border: 214.3 31.8% 91.4%;
    --destructive: 0 84.2% 60.2%;

Use `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, etc.

## Typography

| Family | Value |
|--------|-------|
| `sans` | Inter |
| `mono` | JetBrains Mono |

## Breakpoints

Tailwind defaults: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px.

## Components

Components live in `src/components/`.

Subdirectories:
- `src/components/ui/`
- `src/components/layout/`

## Dark mode

Managed with `next-themes`. Toggle with the provider's `useTheme()` hook.
shadcn/ui tokens automatically switch between light and dark via the `.dark` class on `<html>`.

## Conventions

- Use shadcn/ui semantic tokens (`bg-primary`, `text-muted-foreground`, etc.) rather than raw hex values
- New components go through shadcn CLI (`npx shadcn add <component>`) before customising
- _Add naming conventions, component patterns, spacing rules, etc._
```

## Why

AI agents build UIs that look inconsistent because they don't know which colors, fonts, or component patterns a project uses. `DESIGN.md` gives them that context in one file. This tool generates the mechanical parts - scanning configs - so you only have to fill in the judgment calls.

## Requirements

Node.js 18 or later. No runtime dependencies.

## License

MIT
