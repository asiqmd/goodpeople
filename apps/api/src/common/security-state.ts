import { createHash } from 'node:crypto';
import {
  Global,
  Inject,
  Injectable,
  Module,
  ServiceUnavailableException,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createClient } from 'redis';
import { APP_CONFIG, type AppConfig } from '../config.js';

/** Atomic, expiring security state. Redis is mandatory in production; memory is for local tests. */
@Injectable()
export class SecurityState implements OnApplicationShutdown {
  private readonly client;
  private connecting?: Promise<unknown>;
  private readonly memory = new Map<string, { value: string; until: number }>();
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.client =
      config.SECURITY_STORE === 'redis'
        ? createClient({
            url: config.REDIS_URL,
            disableOfflineQueue: true,
            socket: { connectTimeout: 2000, reconnectStrategy: false },
          })
        : undefined;
    this.client?.on('error', () => {
      /* callers receive a redacted, retryable 503 */
    });
  }
  private key(key: string) {
    return `${this.config.SECURITY_NAMESPACE}:${createHash('sha256').update(key).digest('hex')}`;
  }
  private getMemory(key: string) {
    const now = Date.now();
    for (const [k, v] of this.memory) if (v.until <= now) this.memory.delete(k);
    return this.memory.get(key);
  }
  private async redis<T>(fn: (client: NonNullable<typeof this.client>) => Promise<T>): Promise<T> {
    try {
      if (!this.client) throw new Error('No Redis');
      if (!this.client.isReady) {
        this.connecting ??= this.client.connect().finally(() => {
          this.connecting = undefined;
        });
        await this.connecting;
      }
      return await fn(this.client);
    } catch {
      throw new ServiceUnavailableException('Security service unavailable; try again shortly');
    }
  }
  async count(key: string, ttl: number): Promise<{ count: number; ttl: number }> {
    key = this.key(key);
    if (this.client)
      return this.redis(async (c) => {
        const result = (await c.eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('PTTL',KEYS[1])}",
          { keys: [key], arguments: [String(ttl)] },
        )) as number[];
        return { count: result[0]!, ttl: result[1]! };
      });
    const value = this.getMemory(key) ?? { value: '0', until: Date.now() + ttl };
    value.value = String(Number(value.value) + 1);
    this.memory.set(key, value);
    return { count: Number(value.value), ttl: value.until - Date.now() };
  }
  async put(key: string, value: unknown, ttl: number): Promise<void> {
    const data = JSON.stringify(value);
    key = this.key(key);
    if (this.client) {
      await this.redis((c) => c.set(key, data, { PX: ttl }));
      return;
    }
    this.memory.set(key, { value: data, until: Date.now() + ttl });
  }
  async take<T>(key: string): Promise<T | undefined> {
    key = this.key(key);
    const raw = this.client ? await this.redis((c) => c.getDel(key)) : this.getMemory(key)?.value;
    if (!this.client) this.memory.delete(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  }
  async read<T>(key: string): Promise<T | undefined> {
    key = this.key(key);
    const raw = this.client ? await this.redis((c) => c.get(key)) : this.getMemory(key)?.value;
    return raw ? (JSON.parse(raw) as T) : undefined;
  }
  async lockFailure(
    key: string,
    limit: number,
    windowMs: number,
    lockMs: number,
    fixed = false,
    now = Date.now(),
  ): Promise<number> {
    key = this.key(key);
    if (this.client)
      return this.redis(async (c) =>
        Number(
          await c.eval(
            `
      local time=redis.call('TIME'); local now=time[1]*1000+math.floor(time[2]/1000)
      local raw=redis.call('GET',KEYS[1]); local p=raw and cjson.decode(raw) or {count=0,start=now,last=now,untilAt=0}
      if p.untilAt>now then return math.ceil((p.untilAt-now)/1000) end
      local base=ARGV[4]=='1' and p.start or p.last
      if p.untilAt>0 or now-base>=tonumber(ARGV[2]) then p={count=0,start=now,last=now,untilAt=0} end
      p.count=p.count+1; p.last=now
      if p.count>=tonumber(ARGV[1]) then p.untilAt=now+tonumber(ARGV[3]) end
      redis.call('SET',KEYS[1],cjson.encode(p),'PX',math.max(tonumber(ARGV[2]),tonumber(ARGV[3])))
      return p.untilAt>now and math.ceil((p.untilAt-now)/1000) or 0
    `,
            {
              keys: [key],
              arguments: [String(limit), String(windowMs), String(lockMs), fixed ? '1' : '0'],
            },
          ),
        ),
      );
    const raw = this.getMemory(key)?.value;
    let p = raw
      ? (JSON.parse(raw) as { count: number; start: number; last: number; untilAt: number })
      : { count: 0, start: now, last: now, untilAt: 0 };
    if (p.untilAt > now) return Math.ceil((p.untilAt - now) / 1000);
    if (p.untilAt > 0 || now - (fixed ? p.start : p.last) >= windowMs)
      p = { count: 0, start: now, last: now, untilAt: 0 };
    p.count++;
    p.last = now;
    if (p.count >= limit) p.untilAt = now + lockMs;
    this.memory.set(key, {
      value: JSON.stringify(p),
      until: Date.now() + Math.max(windowMs, lockMs),
    });
    return p.untilAt > now ? Math.ceil((p.untilAt - now) / 1000) : 0;
  }
  async lockedFor(key: string, now = Date.now()): Promise<number> {
    const value = await this.read<{ untilAt: number }>(key);
    return value?.untilAt && value.untilAt > now ? Math.ceil((value.untilAt - now) / 1000) : 0;
  }
  async once(key: string, ttl: number): Promise<boolean> {
    key = this.key(key);
    if (this.client)
      return this.redis(async (c) => (await c.set(key, '1', { PX: ttl, NX: true })) === 'OK');
    if (this.getMemory(key)) return false;
    this.memory.set(key, { value: '1', until: Date.now() + ttl });
    return true;
  }
  async advance(key: string, value: number, ttl: number): Promise<boolean> {
    key = this.key(key);
    if (this.client)
      return this.redis(
        async (c) =>
          Number(
            await c.eval(
              "local old=redis.call('GET',KEYS[1]); if old and tonumber(old)>=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[1],'PX',ARGV[2]); return 1",
              { keys: [key], arguments: [String(value), String(ttl)] },
            ),
          ) === 1,
      );
    const old = this.getMemory(key);
    if (old && Number(old.value) >= value) return false;
    this.memory.set(key, { value: String(value), until: Date.now() + ttl });
    return true;
  }
  async remove(key: string): Promise<void> {
    key = this.key(key);
    if (this.client) await this.redis((c) => c.del(key));
    else this.memory.delete(key);
  }
  async ping(): Promise<void> {
    if (this.client) await this.redis((c) => c.ping());
  }
  async onApplicationShutdown() {
    if (this.client?.isOpen) this.client.destroy();
  }
}
@Global()
@Module({ providers: [SecurityState], exports: [SecurityState] })
export class SecurityStateModule {}
