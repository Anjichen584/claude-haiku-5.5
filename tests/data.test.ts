import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('数据校验', () => {
  it('当前 data/ 目录通过 validate:data 校验', () => {
    const output = execFileSync('npx', ['tsx', 'scripts/validate-data.ts'], {
      encoding: 'utf8',
    });
    expect(output).toContain('数据校验通过');
  });
});
