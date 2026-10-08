class RiotScheduler {
  constructor() {
    this.foregroundCount = 0;
    this.foregroundTail = Promise.resolve();
  }

  shouldDeferBackground() {
    return this.foregroundCount > 0;
  }

  foreground(backgrounds, task) {
    this.foregroundCount++;
    const run = this.foregroundTail.then(async () => {
      const pending = typeof backgrounds === "function" ? backgrounds() : [];
      await Promise.all((pending || []).filter(Boolean));
      return task();
    });
    this.foregroundTail = run.catch(() => {});
    return run.finally(() => { this.foregroundCount--; });
  }
}

module.exports = { RiotScheduler };
