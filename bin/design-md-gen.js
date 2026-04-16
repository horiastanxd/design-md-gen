#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join, extname } from 'path';
import { pathToFileURL } from 'url';

const VERSION = '0.1.0';

function usage() {
  console.log(`design-md-gen v${VERSION}

Usage:
  design-md-gen [directory] [options]

Options:
  --output <file>   Write to this file instead of DESIGN.md
  --stdout          Print to stdout instead of writing a file
  --overwrite       Overwrite an existing DESIGN.md
  --version         Print version
  --help            Print this help
`);
}

function readText(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function readJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function findFiles(dir, exts, maxDepth = 3) {
  const results = [];
  function walk(current, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (['node_modules', '.git', 'dist', 'build', '.next', 'target', '__pycache__'].includes(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (exts.includes(extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  }
  walk(dir, 0);
  return results;
}

function extractCSSVars(cssText) {
  const vars = {};
  const rootPattern = /(?::root|@layer\s+base\s*\{[^}]*:root)\s*\{([^}]+)\}/gs;
  let m;
  while ((m = rootPattern.exec(cssText)) !== null) {
    const block = m[1];
    for (const [, name, value] of block.matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
      vars[name] = value.trim();
    }
  }
  return vars;
}

function classifyVars(vars) {
  const colors = {};
  const fonts = {};
  const radii = {};

  for (const [k, v] of Object.entries(vars)) {
    if (k.startsWith('color-') || k.startsWith('clr-') ||
        /^(background|foreground|primary|secondary|accent|muted|card|popover|border|input|ring|destructive|success|warning|info)/.test(k)) {
      colors[k] = v;
    } else if (k.startsWith('font-') || k.startsWith('text-')) {
      fonts[k] = v;
    } else if (k.startsWith('radius') || k.startsWith('border-radius') || k.startsWith('rounded')) {
      radii[k] = v;
    }
  }
  return { colors, fonts, radii };
}

function detectShadcn(vars) {
  const shadcnKeys = ['background', 'foreground', 'primary', 'secondary', 'accent', 'muted', 'card', 'popover', 'destructive'];
  return shadcnKeys.filter(k => vars[k]).length >= 5;
}

async function tryImportTailwindConfig(dir) {
  const candidates = ['tailwind.config.js', 'tailwind.config.mjs', 'tailwind.config.cjs'];
  for (const name of candidates) {
    const full = join(dir, name);
    if (!existsSync(full)) continue;
    try {
      const mod = await import(pathToFileURL(full).href);
      return mod.default ?? mod;
    } catch { /* unsupported config shape */ }
  }
  return null;
}

function flattenColorMap(obj, prefix = '', depth = 0) {
  if (depth > 2) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}-${k}` : k;
    if (typeof v === 'string') {
      out[key] = v;
    } else if (v && typeof v === 'object') {
      if (v.DEFAULT) out[key] = v.DEFAULT;
      Object.assign(out, flattenColorMap(v, key, depth + 1));
    }
  }
  return out;
}

function parseTailwindText(text) {
  const result = { colors: {}, fonts: {}, screens: {} };

  const colorMatch = text.match(/colors\s*:\s*\{([\s\S]*?)\}/);
  if (colorMatch) {
    for (const [, k, v] of colorMatch[1].matchAll(/['"]?([\w-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g)) {
      result.colors[k] = v;
    }
  }

  const fontMatch = text.match(/fontFamily\s*:\s*\{([\s\S]*?)\}/);
  if (fontMatch) {
    for (const [, k, v] of fontMatch[1].matchAll(/['"]?([\w-]+)['"]?\s*:\s*\[?\s*['"]([^'"]+)['"]/g)) {
      result.fonts[k] = v;
    }
  }

  const screenMatch = text.match(/screens\s*:\s*\{([\s\S]*?)\}/);
  if (screenMatch) {
    for (const [, k, v] of screenMatch[1].matchAll(/['"]?([\w-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g)) {
      result.screens[k] = v;
    }
  }

  return result;
}

function detectFromPackage(dir) {
  const pkg = readJSON(join(dir, 'package.json'));
  if (!pkg) return null;

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  const uiLibrary =
    deps['@shadcn/ui'] || deps['shadcn-ui'] || deps['shadcn'] ? 'shadcn/ui' :
    deps['@mui/material'] ? 'Material UI' :
    deps['@chakra-ui/react'] ? 'Chakra UI' :
    deps['antd'] ? 'Ant Design' :
    deps['@radix-ui/react-primitives'] ? 'Radix UI' :
    deps['@headlessui/react'] ? 'Headless UI' :
    deps['react-aria-components'] ? 'React Aria' :
    deps['daisyui'] ? 'daisyUI' :
    deps['@nextui-org/react'] ? 'NextUI' :
    null;

  const hasTailwind = !!(deps.tailwindcss || deps['@tailwindcss/vite'] || deps['@tailwindcss/postcss']);

  const icons =
    deps['lucide-react'] ? 'Lucide React' :
    deps['@heroicons/react'] ? 'Heroicons' :
    deps['react-icons'] ? 'react-icons' :
    deps['phosphor-react'] || deps['@phosphor-icons/react'] ? 'Phosphor Icons' :
    deps['@tabler/icons-react'] ? 'Tabler Icons' :
    null;

  const darkMode =
    deps['next-themes'] ? 'next-themes' :
    deps['@nuxtjs/color-mode'] ? '@nuxtjs/color-mode' :
    deps['use-dark-mode'] ? 'use-dark-mode' :
    null;

  const animations =
    deps['framer-motion'] ? 'Framer Motion' :
    deps['motion'] ? 'Motion' :
    deps['@motionone/dom'] ? 'Motion One' :
    null;

  const framework =
    deps.next ? 'Next.js' :
    deps.nuxt ? 'Nuxt' :
    deps['@remix-run/react'] ? 'Remix' :
    deps.astro ? 'Astro' :
    deps.svelte ? 'Svelte' :
    deps.react ? 'React' :
    deps.vue ? 'Vue' :
    null;

  return { uiLibrary, hasTailwind, icons, darkMode, animations, framework };
}

function detectCSSVariables(dir) {
  const candidates = [
    'src/app/globals.css',
    'app/globals.css',
    'src/styles/globals.css',
    'src/styles/global.css',
    'styles/globals.css',
    'styles/global.css',
    'src/index.css',
    'index.css',
    'src/main.css',
  ];

  for (const rel of candidates) {
    const text = readText(join(dir, rel));
    if (text) {
      const vars = extractCSSVars(text);
      if (Object.keys(vars).length > 0) return { vars, file: rel };
    }
  }

  for (const file of findFiles(dir, ['.css'], 2)) {
    const text = readText(file);
    if (!text) continue;
    const vars = extractCSSVars(text);
    if (Object.keys(vars).length > 3) {
      return { vars, file: file.slice(dir.length + 1) };
    }
  }

  return null;
}

function detectDesignTokens(dir) {
  const candidates = [
    'tokens.json',
    'design-tokens.json',
    'src/tokens.json',
    'src/design-tokens.json',
    'tokens/tokens.json',
    'design/tokens.json',
  ];

  for (const rel of candidates) {
    if (readJSON(join(dir, rel))) return { file: rel };
  }
  return null;
}

function detectComponents(dir) {
  const candidates = [
    'src/components',
    'components',
    'app/components',
    'src/ui',
    'ui',
    'src/shared/ui',
  ];

  for (const rel of candidates) {
    if (existsSync(join(dir, rel))) {
      try {
        const entries = readdirSync(join(dir, rel), { withFileTypes: true });
        const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).slice(0, 8);
        return { path: rel, dirs };
      } catch { /* ignore */ }
    }
  }
  return null;
}

async function gatherDesignInfo(dir) {
  const pkg = detectFromPackage(dir);
  const cssResult = detectCSSVariables(dir);
  const tokensResult = detectDesignTokens(dir);
  const components = detectComponents(dir);
  const storybook = existsSync(join(dir, '.storybook'));

  let tailwindConfig = null;
  let tailwindText = null;

  for (const name of ['tailwind.config.js', 'tailwind.config.mjs', 'tailwind.config.ts', 'tailwind.config.cjs']) {
    const text = readText(join(dir, name));
    if (text) { tailwindText = text; break; }
  }

  tailwindConfig = await tryImportTailwindConfig(dir);

  let twColors = {};
  let twFonts = {};
  let twScreens = {};
  let twBorderRadius = {};

  if (tailwindConfig) {
    const theme = tailwindConfig.theme || {};
    const ext = theme.extend || {};
    twColors = flattenColorMap(ext.colors || theme.colors || {});
    twFonts = ext.fontFamily || theme.fontFamily || {};
    twScreens = ext.screens || theme.screens || {};
    twBorderRadius = ext.borderRadius || theme.borderRadius || {};
  } else if (tailwindText) {
    const parsed = parseTailwindText(tailwindText);
    twColors = parsed.colors;
    twFonts = parsed.fonts;
    twScreens = parsed.screens;
  }

  let cssVars = null;
  let cssFile = null;
  let isShadcn = false;
  let classified = null;

  if (cssResult) {
    cssVars = cssResult.vars;
    cssFile = cssResult.file;
    isShadcn = detectShadcn(cssVars);
    classified = classifyVars(cssVars);
  }

  return {
    pkg,
    twColors,
    twFonts,
    twScreens,
    twBorderRadius,
    cssFile,
    isShadcn,
    classified,
    tokensResult,
    components,
    storybook,
  };
}

function colorTable(colors) {
  const entries = Object.entries(colors).slice(0, 20);
  if (!entries.length) return '';
  return '| Token | Value |\n|-------|-------|\n' +
    entries.map(([k, v]) => `| \`${k}\` | \`${v}\` |`).join('\n');
}

function generateDesignMd(info) {
  const lines = [];
  const { pkg, twColors, twFonts, twScreens, twBorderRadius, classified, cssFile, isShadcn, tokensResult, components, storybook } = info;

  lines.push('# DESIGN.md');
  lines.push('');
  lines.push('Design system reference for AI coding agents.');
  lines.push('');

  lines.push('## Stack');
  lines.push('');

  const stackItems = [];
  if (pkg?.framework) stackItems.push(`Framework: ${pkg.framework}`);
  if (pkg?.hasTailwind) {
    const uiLabel = (isShadcn && !pkg.uiLibrary) ? 'shadcn/ui' : pkg.uiLibrary;
    stackItems.push(`UI: Tailwind CSS${uiLabel ? ` + ${uiLabel}` : ''}`);
  } else if (pkg?.uiLibrary || isShadcn) {
    stackItems.push(`UI library: ${pkg?.uiLibrary || 'shadcn/ui'}`);
  }
  if (pkg?.icons) stackItems.push(`Icons: ${pkg.icons}`);
  if (pkg?.animations) stackItems.push(`Animations: ${pkg.animations}`);
  if (pkg?.darkMode) stackItems.push(`Dark mode: ${pkg.darkMode}`);
  if (storybook) stackItems.push('Component docs: Storybook (`.storybook/`)');

  if (stackItems.length) {
    stackItems.forEach(i => lines.push(`- ${i}`));
  } else {
    lines.push('_No package.json found — fill in manually._');
  }
  lines.push('');

  lines.push('## Colors');
  lines.push('');

  if (isShadcn && classified?.colors && Object.keys(classified.colors).length) {
    lines.push(`shadcn/ui semantic tokens (from \`${cssFile}\`):`);
    lines.push('');
    lines.push('```css');
    Object.entries(classified.colors).slice(0, 20).forEach(([k, v]) => {
      lines.push(`--${k}: ${v};`);
    });
    lines.push('```');
    lines.push('');
    lines.push('Use `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, etc.');
  } else if (Object.keys(twColors).length) {
    lines.push('Custom colors from `tailwind.config`:');
    lines.push('');
    lines.push(colorTable(twColors));
  } else if (classified?.colors && Object.keys(classified.colors).length) {
    lines.push(`CSS variables from \`${cssFile}\`:`);
    lines.push('');
    lines.push('```css');
    Object.entries(classified.colors).slice(0, 20).forEach(([k, v]) => {
      lines.push(`--${k}: ${v};`);
    });
    lines.push('```');
  } else if (pkg?.hasTailwind) {
    lines.push('Using Tailwind CSS default palette. No custom colors detected.');
  } else {
    lines.push('_No color tokens detected — add your palette here._');
  }
  lines.push('');

  lines.push('## Typography');
  lines.push('');

  const fonts = { ...twFonts };
  if (classified?.fonts) {
    Object.entries(classified.fonts).forEach(([k, v]) => { fonts[k] = v; });
  }

  if (Object.keys(fonts).length) {
    lines.push('| Family | Value |');
    lines.push('|--------|-------|');
    Object.entries(fonts).slice(0, 6).forEach(([k, v]) => {
      lines.push(`| \`${k}\` | ${Array.isArray(v) ? v[0] : v} |`);
    });
  } else if (pkg?.hasTailwind) {
    lines.push('Tailwind default font stack. Override with `font-sans`, `font-mono` etc.');
  } else {
    lines.push('_Add font families here._');
  }
  lines.push('');

  if (Object.keys(twScreens).length) {
    lines.push('## Breakpoints');
    lines.push('');
    lines.push('| Name | Min-width |');
    lines.push('|------|-----------|');
    Object.entries(twScreens).forEach(([k, v]) => {
      lines.push(`| \`${k}\` | ${v} |`);
    });
    lines.push('');
  } else if (pkg?.hasTailwind) {
    lines.push('## Breakpoints');
    lines.push('');
    lines.push('Tailwind defaults: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px.');
    lines.push('');
  }

  const radii = { ...twBorderRadius, ...(classified?.radii || {}) };
  if (Object.keys(radii).length) {
    lines.push('## Border radius');
    lines.push('');
    Object.entries(radii).slice(0, 8).forEach(([k, v]) => {
      lines.push(`- \`${k}\`: \`${v}\``);
    });
    lines.push('');
  }

  if (components) {
    lines.push('## Components');
    lines.push('');
    lines.push(`Components live in \`${components.path}/\`.`);
    if (components.dirs.length) {
      lines.push('');
      lines.push('Subdirectories:');
      components.dirs.forEach(d => lines.push(`- \`${components.path}/${d}/\``));
    }
    lines.push('');
  }

  if (tokensResult) {
    lines.push('## Design tokens');
    lines.push('');
    lines.push(`Tokens defined in \`${tokensResult.file}\` (W3C Design Tokens format).`);
    lines.push('');
  }

  if (pkg?.darkMode || isShadcn) {
    lines.push('## Dark mode');
    lines.push('');
    if (pkg?.darkMode) {
      lines.push(`Managed with \`${pkg.darkMode}\`. Toggle with the provider's \`useTheme()\` hook.`);
    }
    if (isShadcn) {
      lines.push('shadcn/ui tokens automatically switch between light and dark via the `.dark` class on `<html>`.');
    }
    lines.push('');
  }

  lines.push('## Conventions');
  lines.push('');
  if (isShadcn) {
    lines.push('- Use shadcn/ui semantic tokens (`bg-primary`, `text-muted-foreground`, etc.) rather than raw hex values');
    lines.push('- New components go through shadcn CLI (`npx shadcn add <component>`) before customising');
  } else if (pkg?.hasTailwind) {
    lines.push('- Use Tailwind utility classes; avoid inline styles');
  }
  lines.push('- _Add naming conventions, component patterns, spacing rules, etc._');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--version')) { console.log(VERSION); process.exit(0); }
  if (args.includes('--help') || args.includes('-h')) { usage(); process.exit(0); }

  let targetDir = '.';
  let outputFile = 'DESIGN.md';
  let toStdout = false;
  let overwrite = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) { outputFile = args[++i]; }
    else if (args[i] === '--stdout') { toStdout = true; }
    else if (args[i] === '--overwrite') { overwrite = true; }
    else if (!args[i].startsWith('--')) { targetDir = args[i]; }
  }

  const dir = resolve(targetDir);
  const info = await gatherDesignInfo(dir);
  const output = generateDesignMd(info);

  if (toStdout) {
    process.stdout.write(output);
    return;
  }

  const dest = resolve(dir, outputFile);
  if (existsSync(dest) && !overwrite) {
    console.error(`${outputFile} already exists. Use --overwrite to replace it.`);
    process.exit(1);
  }

  writeFileSync(dest, output, 'utf8');
  console.log(`Wrote ${dest}`);

  const detected = [];
  if (info.pkg?.framework) detected.push(info.pkg.framework);
  if (info.pkg?.hasTailwind) detected.push('Tailwind CSS');
  if (info.isShadcn) detected.push('shadcn/ui');
  else if (info.pkg?.uiLibrary) detected.push(info.pkg.uiLibrary);
  if (Object.keys(info.twColors).length) detected.push(`${Object.keys(info.twColors).length} custom colors`);
  if (info.cssFile) detected.push(`CSS vars from ${info.cssFile}`);

  if (detected.length) {
    console.log(`Detected: ${detected.join(', ')}`);
  } else {
    console.log('No design tokens detected — generated a blank template.');
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
