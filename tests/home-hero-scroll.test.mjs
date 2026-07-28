import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile(
  new URL('../src/app/home/page.tsx', import.meta.url),
  'utf8',
);

test('home hero starts full bleed at the physical top of the screen', () => {
  assert.match(home, /data-testid="home-hero-slider"/);
  assert.match(home, /marginTop:\s*'calc\(-54px - var\(--safe-area-top\)\)'/);
  assert.doesNotMatch(home, /src="\/logo_dark\.png" alt="Maratonou"/);
  assert.match(home, /height:\s*isDesktop\s*\?\s*CARD_H\s*:\s*`calc\(\$\{CARD_H\}px \+ var\(--safe-area-top\)\)`/);
});

test('home header blur and gradient stay hidden until vertical scroll', () => {
  assert.match(home, /data-testid="home-scroll-chrome"/);
  assert.match(home, /opacity:\s*scrollRatio/);
  assert.match(home, /visibility:\s*scrollRatio === 0 \? 'hidden' : 'visible'/);
  assert.match(home, /const homeScrollChromeTint = isDark/);
  assert.match(home, /rgba\(229,229,234,0\.94\)/);
  assert.doesNotMatch(home, /Gradiente topo — legibilidade do header\/tabs/);
});
