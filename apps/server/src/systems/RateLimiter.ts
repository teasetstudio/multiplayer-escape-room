export class RateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}
  allow(key: string, now = Date.now()) {
    const entry = this.entries.get(key);
    if (entry && entry.resetAt > now) return ++entry.count <= this.limit;
    if (this.entries.size >= 2000) {
      for (const [id, value] of this.entries) if (value.resetAt <= now) this.entries.delete(id);
      if (this.entries.size >= 2000) return false;
    }
    this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
    return true;
  }
  delete(key: string) {
    this.entries.delete(key);
  }
}
