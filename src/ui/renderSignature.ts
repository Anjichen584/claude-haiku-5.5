/** Value-based invalidation for retained UI. Functions must close over live scene state. */
export class RenderSignature {
  private previous: string | undefined;
  changed(value: unknown): boolean {
    const next = JSON.stringify(value);
    if (next === this.previous) return false;
    this.previous = next;
    return true;
  }
  reset(): void { this.previous = undefined; }
}
