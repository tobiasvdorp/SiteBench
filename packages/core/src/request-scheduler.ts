export class RequestScheduler {
  private readonly intervalMs: number;
  private lastScheduledAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(rpsLimit: number) {
    this.intervalMs = 1000 / rpsLimit;
  }

  acquire(): Promise<void> {
    this.chain = this.chain.then(async () => {
      const now = Date.now();
      const waitMs = Math.max(0, this.lastScheduledAt + this.intervalMs - now);
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.lastScheduledAt = Date.now();
    });
    return this.chain;
  }
}
