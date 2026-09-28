import { describe, it, expect, vi } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import {
  PROBE_ACCOUNT,
  checkSep10Liveness,
  parseTomlEndpoints,
} from '../scripts/anchor-survey.mjs';

const MONEYGRAM_AUTH = 'https://stellar.moneygram.com/stellaradapterservice/auth';

describe('anchor-survey: PROBE_ACCOUNT', () => {
  it('is a valid Stellar public key', () => {
    expect(StrKey.isValidEd25519PublicKey(PROBE_ACCOUNT)).toBe(true);
  });
});

describe('anchor-survey: parseTomlEndpoints', () => {
  it('extracts WEB_AUTH_ENDPOINT alongside the transfer endpoints', () => {
    const toml = [
      'TRANSFER_SERVER="https://a.example/sep6"',
      'TRANSFER_SERVER_SEP0024 = "https://a.example/sep24"',
      `WEB_AUTH_ENDPOINT = "${MONEYGRAM_AUTH}"`,
    ].join('\n');
    expect(parseTomlEndpoints(toml)).toEqual({
      sep6: 'https://a.example/sep6',
      sep24: 'https://a.example/sep24',
      sep10: MONEYGRAM_AUTH,
    });
  });
});

describe('anchor-survey: checkSep10Liveness', () => {
  it('marks a MoneyGram-style endpoint alive and never issues a bare GET', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const hasAccount = new URL(url).searchParams.has('account');
      return new Response(null, { status: hasAccount ? 400 : 500 });
    });
    const result = await checkSep10Liveness(MONEYGRAM_AUTH, { fetchImpl });
    expect(result).toEqual({ url: MONEYGRAM_AUTH, status: 400, alive: true });
    expect(fetchImpl).toHaveBeenCalled();
    for (const [url] of fetchImpl.mock.calls) {
      expect(new URL(url).searchParams.get('account')).toBe(PROBE_ACCOUNT);
    }
  });

  it('marks a 5xx response with account as not alive', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 502 }));
    const result = await checkSep10Liveness(MONEYGRAM_AUTH, { fetchImpl });
    expect(result.status).toBe(502);
    expect(result.alive).toBe(false);
  });

  it('marks a network failure as not alive', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
    });
    const result = await checkSep10Liveness(MONEYGRAM_AUTH, { fetchImpl });
    expect(result.alive).toBe(false);
    expect(result.error).toBe('TypeError:ENOTFOUND');
  });

  it('appends &account= when the URL already has a query', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 400 }));
    await checkSep10Liveness('https://a.example/auth?v=1', { fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://a.example/auth?v=1&account=${PROBE_ACCOUNT}`);
  });
});
