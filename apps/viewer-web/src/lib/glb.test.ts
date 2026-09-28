import { describe, expect, it } from 'vitest';
import { formatFileSize, isGlbFileName } from './glb';

describe('isGlbFileName', () => {
  it('accepts the GLB extension without case sensitivity', () => {
    expect(isGlbFileName('world.glb')).toBe(true);
    expect(isGlbFileName('WORLD.GLB')).toBe(true);
  });

  it('rejects other files and names that only contain .glb', () => {
    expect(isGlbFileName('world.gltf')).toBe(false);
    expect(isGlbFileName('world.glb.zip')).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('formats bytes using binary units', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1 KiB');
    expect(formatFileSize(1_572_864)).toBe('1.5 MiB');
  });

  it('rejects invalid sizes', () => {
    expect(() => formatFileSize(-1)).toThrow(RangeError);
    expect(() => formatFileSize(Number.NaN)).toThrow(RangeError);
  });
});
