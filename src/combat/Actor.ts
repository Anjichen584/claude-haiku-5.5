/**
 * 战斗单位的核心状态：生命、无敌帧、受击硬直。
 * 时间单位统一为毫秒，由场景每帧传入 delta。
 */
export interface ActorOptions {
  maxHp: number;
  /** 受击硬直时长（毫秒）。精英与 Boss 应设为 0。 */
  staggerMs?: number;
}

export class Actor {
  private _maxHp: number;
  get maxHp(): number { return this._maxHp; }
  /** Equipment can change capacity without resetting combat cooldowns or healing. */
  setMaxHp(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    this._maxHp = value;
    this.hp = Math.min(this.hp, value);
  }
  readonly staggerMs: number;
  hp: number;
  /** 剩余无敌时间（毫秒） */
  invulnerableMs = 0;
  /** 剩余硬直时间（毫秒） */
  staggerLeftMs = 0;

  constructor(options: ActorOptions) {
    this._maxHp = options.maxHp;
    this.hp = options.maxHp;
    this.staggerMs = options.staggerMs ?? 200;
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  get isStaggered(): boolean {
    return this.staggerLeftMs > 0;
  }

  get isInvulnerable(): boolean {
    return this.invulnerableMs > 0;
  }

  /** 每帧推进计时器 */
  tick(deltaMs: number): void {
    this.invulnerableMs = Math.max(0, this.invulnerableMs - deltaMs);
    this.staggerLeftMs = Math.max(0, this.staggerLeftMs - deltaMs);
  }

  /** 施加无敌帧（如闪避期间） */
  grantInvulnerability(durationMs: number): void {
    this.invulnerableMs = Math.max(this.invulnerableMs, durationMs);
  }

  /**
   * 受到伤害。无敌期间返回 0，不产生硬直。
   * 返回实际造成的伤害。
   */
  receiveDamage(amount: number): number {
    if (this.isDead || this.isInvulnerable) return 0;
    const applied = Math.min(this.hp, Math.max(0, Math.round(amount)));
    this.hp -= applied;
    if (!this.isDead && this.staggerMs > 0) {
      this.staggerLeftMs = this.staggerMs;
    }
    return applied;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, amount));
  }
}
