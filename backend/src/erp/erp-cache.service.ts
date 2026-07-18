import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

// Ported verbatim from PROMAN/backend/src/cache/redis.ts — used by dashboard
// modules whose queries are expensive enough to need caching across the
// frontend's 5-minute poll window (e.g. Stores, which runs multi-second full
// scans on some tables we can't index ourselves).
@Injectable()
export class ErpCacheService {
  private client: Redis | null = null;

  private getClient(): Redis | null {
    if (process.env.REDIS_URL) {
      if (!this.client) this.client = new Redis(process.env.REDIS_URL);
      return this.client;
    }
    return null; // Redis optional — falls back to no cache in dev
  }

  async get<T>(key: string): Promise<T | null> {
    const redis = this.getClient();
    if (!redis) return null;
    const val = await redis.get(key);
    return val ? (JSON.parse(val) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const redis = this.getClient();
    if (!redis) return;
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
}
