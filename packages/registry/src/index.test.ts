import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOLS } from './index';

describe('registry', () => {
  const apps = readdirSync(new URL('../../../apps', import.meta.url)).filter((d) => d !== 'landing');
  it('lists exactly the apps that exist, so the landing page has no dead links', () => {
    expect(TOOLS.map((t) => t.slug).sort()).toEqual(apps.sort());
  });
  it('has unique slugs and names', () => {
    expect(new Set(TOOLS.map((t) => t.slug)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  });
});
