import {
  commandSchema,
  type CommandResult,
  type GameCommand,
} from '../core/commands';
import { createWorld, loadWorld, type World } from '../core/world';
import { RuleBasedDialogueProvider } from '../providers/rule-dialogue';
import { resolveDialogue, type DialogueProvider } from './dialogue';

export interface SaveRepository {
  read(): string | null;
  write(save: string): void;
}
export interface TraceEntry {
  sequence: number;
  command: GameCommand;
  result: CommandResult;
}
export interface ReplayRecord {
  version: 1;
  initialSave: string;
  entries: TraceEntry[];
  expectedWorld: ReturnType<World['getSnapshot']>;
}

export class GameSession {
  private world: World;
  private initialSave: string;
  private entries: TraceEntry[] = [];
  private epoch = 0;
  private blockedSave = false;
  private readonly listeners = new Set<() => void>();
  selectedEntity: string | null = null;
  storageError: string | null = null;
  lastDialogueFallback = false;

  constructor(
    private readonly repository: SaveRepository,
    seed = 42,
    private readonly provider: DialogueProvider = new RuleBasedDialogueProvider(),
  ) {
    this.world = createWorld(seed);
    try {
      const save = repository.read();
      if (save !== null) this.world = loadWorld(save);
    } catch {
      this.blockedSave = true;
      this.storageError = '无法读取存档；原数据已保留，本次会话不会覆盖它。';
    }
    this.initialSave = this.world.save();
  }

  getSnapshot() {
    return this.world.getSnapshot();
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }

  execute(command: GameCommand): CommandResult {
    const parsed = commandSchema.safeParse(command);
    if (!parsed.success) return { ok: false, error: 'INVALID_COMMAND' };
    // Keep a bounded replay window, with an exact checkpoint rather than a truncated trace.
    if (this.entries.length >= 1000) {
      this.initialSave = this.world.save();
      this.entries = [];
    }
    const result = this.world.dispatch(parsed.data);
    this.entries.push({
      sequence: this.entries.length,
      command: parsed.data,
      result,
    });
    if (result.ok) this.save();
    this.notify();
    return structuredClone(result);
  }

  save(): boolean {
    if (this.blockedSave) return false;
    try {
      this.repository.write(this.world.save());
      this.storageError = null;
      return true;
    } catch {
      this.storageError = '保存失败，请检查浏览器存储空间后重试。';
      return false;
    }
  }

  select(id: string | null) {
    this.selectedEntity = id;
    this.notify();
  }

  async talk(catId: string, message: string): Promise<CommandResult> {
    const cat = this.world.getSnapshot().cats.find((item) => item.id === catId);
    if (!cat || !message.trim() || message.length > 500)
      return { ok: false, error: 'INVALID_INTERACTION' };
    const epoch = this.epoch;
    const { proposal, usedFallback } = await resolveDialogue(
      this.provider,
      new RuleBasedDialogueProvider(),
      {
        cat: {
          id: cat.id,
          name: cat.name,
          mood: cat.mood,
          personality: cat.personality,
          preferences: cat.preferences,
        },
        message,
        recentMemories: cat.memories.slice(-5),
      },
    );
    if (epoch !== this.epoch) return { ok: false, error: 'STALE_DIALOGUE' };
    this.lastDialogueFallback = usedFallback;
    return this.execute({
      type: 'INTERACT',
      catId,
      message,
      reply: proposal.text,
    });
  }

  /** Only called by the dev/test bridge. Validate before replacing the live world. */
  loadFixture(serialized: string) {
    const replacement = loadWorld(serialized);
    this.world = replacement;
    this.epoch++;
    this.initialSave = replacement.save();
    this.entries = [];
    this.selectedEntity = null;
    this.save();
    this.notify();
  }

  getReplay(): ReplayRecord {
    return structuredClone({
      version: 1,
      initialSave: this.initialSave,
      entries: this.entries,
      expectedWorld: this.world.getSnapshot(),
    });
  }
  getDiagnostics() {
    return {
      storageError: this.storageError,
      lastDialogueFallback: this.lastDialogueFallback,
      commandCount: this.entries.length,
      recentCommands: structuredClone(this.entries.slice(-20)),
      events: structuredClone(
        this.entries
          .flatMap((entry) => (entry.result.ok ? entry.result.events : []))
          .slice(-100),
      ),
    };
  }
}
