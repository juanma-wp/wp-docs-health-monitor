import { describe, it, expect } from 'vitest';
import { SiteIdentitySchema } from '../site.js';

describe('SiteIdentitySchema', () => {
  it('round-trips a valid site identity', () => {
    const fixture = {
      id: 'gutenberg-block-editor',
      name: 'WordPress Block Editor Handbook',
      lastUpdated: '2026-05-25T10:00:00.000Z',
    };
    const parsed = SiteIdentitySchema.parse(fixture);
    expect(parsed).toEqual(fixture);
  });

  it('rejects empty id', () => {
    expect(() =>
      SiteIdentitySchema.parse({
        id: '',
        name: 'Whatever',
        lastUpdated: '2026-05-25T10:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects empty name', () => {
    expect(() =>
      SiteIdentitySchema.parse({
        id: 'x',
        name: '',
        lastUpdated: '2026-05-25T10:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects non-ISO lastUpdated', () => {
    expect(() =>
      SiteIdentitySchema.parse({
        id: 'x',
        name: 'X',
        lastUpdated: 'yesterday',
      }),
    ).toThrow();
  });
});
