import { STARTER_CAT_ID } from '../content/cats';
import {
  commandSchema,
  createWorld,
  loadWorld,
  MAX_TEXT,
  type World,
  type CheckResult,
  type CommandResult,
  type GameCommand,
} from '../core';
import { resolveDialogue } from './dialogue';
import type { DialogueProvider, SaveRepository } from './ports';

/** Commands kept per replay window before rolling to a fresh checkpoint. */
const REPLAY_WINDOW = 1000;
/** Chat outcomes that fail before a command reaches Core. */
export type TalkResult =
  | CommandResult
  | { ok: false; error: 'INVALID_INTERACTION' | 'STALE_DIALOGUE' };

export interface GameSessionOptions {
  repository: SaveRepository;
  dialogue: DialogueProvider;
  fallbackDialogue: DialogueProvider;
  seed: number;
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
  private readonly repository: SaveRepository;
  private readonly provider: DialogueProvider;
  private readonly fallback: DialogueProvider;
  private initialSave: string;
  private entries: TraceEntry[] = [];
  private epoch = 0;
  /** Why saving stopped: a save that failed to load, or a newer save from another tab. */
  private blocked: 'rejected' | 'external' | null = null;
  private readonly listeners = new Set<() => void>();
  selectedEntity: string | null = null;
  storageError: string | null = null;
  lastDialogueFallback = false;
  /** True when this session continued a saved world rather than starting a new one. */
  readonly resumed: boolean = false;

  constructor(options: GameSessionOptions) {
    if (
      !options ||
      typeof options.repository?.read !== 'function' ||
      typeof options.repository?.write !== 'function' ||
      typeof options.dialogue?.generate !== 'function' ||
      typeof options.fallbackDialogue?.generate !== 'function' ||
      !Number.isInteger(options.seed)
    )
      throw new TypeError(
        'GameSession requires repository, dialogue, fallbackDialogue and seed',
      );
    this.repository = options.repository;
    this.provider = options.dialogue;
    this.fallback = options.fallbackDialogue;
    this.world = createWorld(options.seed);
    try {
      const save = this.repository.read();
      if (save !== null) {
        this.world = loadWorld(save);
        this.resumed = true;
      }
    } catch {
      this.blocked = 'rejected';
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
    if (this.entries.length >= REPLAY_WINDOW) {
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

  /** Would Core accept this now? Not recorded, saved or announced. */
  check(command: GameCommand): CheckResult {
    return this.world.check(command);
  }

  /** Only a rejected save may be replaced by an explicit reset. */
  get saveRejected(): boolean {
    return this.blocked === 'rejected';
  }

  /** Another tab wrote a newer save: stop writing so it is never overwritten. */
  externalSaveChanged() {
    if (this.blocked) return;
    this.blocked = 'external';
    this.storageError =
      '存档已在另一个标签页更新；本页不再保存，请刷新页面继续。';
    this.notify();
  }

  save(): boolean {
    if (this.blocked) return false;
    try {
      this.repository.write(this.world.save());
      this.storageError = null;
      return true;
    } catch {
      this.storageError = '保存失败，请检查浏览器存储空间后重试。';
      return false;
    }
  }

  resetDemo() {
    this.world = createWorld(this.world.getSnapshot().seed);
    this.epoch++;
    this.initialSave = this.world.save();
    this.entries = [];
    this.selectedEntity = STARTER_CAT_ID;
    this.blocked = null;
    this.save();
    this.notify();
  }

  select(id: string | null) {
    this.selectedEntity = id;
    this.notify();
  }

  async talk(catId: string, message: string): Promise<TalkResult> {
    const cat = this.world.getSnapshot().cats.find((item) => item.id === catId);
    if (!cat || !message.trim() || message.length > MAX_TEXT)
      return { ok: false, error: 'INVALID_INTERACTION' };
    const epoch = this.epoch;
    const { proposal, usedFallback } = await resolveDialogue(
      this.provider,
      this.fallback,
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
        fishingMemory: cat.fishingMemory,
        fishGift: cat.fishGift,
        favoriteFish: cat.favoriteFish,
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
  /** The latest recorded command and its outcome; null after a reset or checkpoint. */
  lastCommand(): TraceEntry | null {
    const entry = this.entries.at(-1);
    return entry ? structuredClone(entry) : null;
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
