/**
 * 对话执行器：根据当前节点与世界状态，给出可选项，并在选择后执行效果。
 * 纯逻辑，UI 层只需渲染 current() 与 choices()。
 */
import type { DialogueDef } from '../data/schema';
import { evaluateCondition, type Condition } from '../narrative/conditions';
import { applyEffects, type Effects } from '../narrative/effects';
import type { WorldState } from '../state/WorldState';

export interface DialogueNode {
  speaker: string;
  text: string;
  next?: string | null;
  effects?: Effects;
  choices?: Array<{ text: string; next: string | null; condition?: Condition; effects?: Effects }>;
}

export interface VisibleChoice {
  /** 在原始 choices 数组中的下标，用于 choose() */
  index: number;
  text: string;
}

export class DialogueError extends Error {}

export class DialogueRunner {
  private nodeId: string | null;
  private readonly nodes: Record<string, DialogueNode>;
  /** 对话结束后收集的待处理任务启动请求，由调用方交给 QuestManager */
  readonly pendingQuestStarts: string[] = [];

  constructor(
    dialogue: DialogueDef,
    private readonly world: WorldState,
  ) {
    this.nodes = dialogue.nodes as Record<string, DialogueNode>;
    if (!this.nodes[dialogue.start]) {
      throw new DialogueError(`对话 ${dialogue.id} 的起始节点 ${dialogue.start} 不存在`);
    }
    this.nodeId = dialogue.start;
    this.enter(this.nodeId);
  }

  get finished(): boolean {
    return this.nodeId === null;
  }

  current(): DialogueNode | null {
    return this.nodeId === null ? null : this.nodes[this.nodeId];
  }

  /** 当前节点中条件满足的选项 */
  choices(): VisibleChoice[] {
    const node = this.current();
    if (!node?.choices) return [];
    return node.choices
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => evaluateCondition(c.condition, this.world))
      .map(({ c, index }) => ({ index, text: c.text }));
  }

  /** 无选项的节点，点击继续 */
  advance(): void {
    const node = this.current();
    if (!node) return;
    if (node.choices && node.choices.length > 0) {
      throw new DialogueError('当前节点需要选择选项，请调用 choose()');
    }
    this.goTo(node.next ?? null);
  }

  choose(index: number): void {
    const node = this.current();
    if (!node?.choices) throw new DialogueError('当前节点没有选项');
    const choice = node.choices[index];
    if (!choice) throw new DialogueError(`选项下标越界：${index}`);
    if (!evaluateCondition(choice.condition, this.world)) {
      throw new DialogueError(`选项 ${index} 的条件不满足`);
    }
    const { startQuests } = applyEffects(choice.effects, this.world);
    this.pendingQuestStarts.push(...startQuests);
    this.goTo(choice.next);
  }

  private goTo(next: string | null): void {
    if (next === null) {
      this.nodeId = null;
      return;
    }
    if (!this.nodes[next]) throw new DialogueError(`节点 ${next} 不存在`);
    this.nodeId = next;
    this.enter(next);
  }

  /** 进入节点时执行节点自身的效果 */
  private enter(id: string): void {
    const { startQuests } = applyEffects(this.nodes[id].effects, this.world);
    this.pendingQuestStarts.push(...startQuests);
  }
}
