// why no promises for runtime:
// - https://github.com/redux-saga/redux-saga/issues/16#issuecomment-175119425
// - https://github.com/redux-saga/redux-saga/issues/50#issuecomment-174475389
// why scheduler:
// - https://github.com/redux-saga/redux-saga/pull/622
// issue: yield call inside large for-loop causes crash:
// - https://github.com/redux-saga/redux-saga/issues/1592

/**
 * TYPES
 */
type GuardPredicate<G extends T, T = any> = (arg: T) => arg is G;
type ActionType = string | number | symbol;
type Predicate<T> = (arg: T) => boolean;
type StringableActionCreator<A extends Action = Action> = {
  (...args: any[]): A;
  toString(): string;
};
type SubPattern<T> = Predicate<T> | StringableActionCreator | ActionType;
type Pattern<T> = SubPattern<T> | SubPattern<T>[];
type ActionSubPattern<Guard extends Action = Action> =
  | GuardPredicate<Guard, Action>
  | StringableActionCreator<Guard>
  | Predicate<Action>
  | ActionType;
type ActionPattern<Guard extends Action = Action> =
  | ActionSubPattern<Guard>
  | ActionSubPattern<Guard>[];

interface Effect<T = any, P = any> {
  "@@fx/IO": true;
  combinator: boolean;
  type: T;
  payload: P;
}
type TakeEffect = SimpleEffect<"TAKE", TakeEffectDescriptor>;

interface TakeEffectDescriptor {
  pattern: ActionPattern;
  maybe?: boolean;
}

interface TakeableChannel<T> {
  take(cb: (message: T | END) => void): void;
}

type ChannelTakeEffect<T> = SimpleEffect<
  "TAKE",
  ChannelTakeEffectDescriptor<T>
>;

interface ChannelTakeEffectDescriptor<T> {
  channel: TakeableChannel<T>;
  pattern?: Pattern<T>;
  maybe?: boolean;
}

type ArrayCombinatorEffectDescriptor<E = any> = E[];
type ObjectCombinatorEffectDescriptor<E = any> = { [key: string]: E };
type CombinatorEffectDescriptor<E = any> =
  | ArrayCombinatorEffectDescriptor<E>
  | ObjectCombinatorEffectDescriptor<E>;
interface StrictCombinatorEffect<T>
  extends Effect<T, CombinatorEffectDescriptor<StrictEffect>> {
  combinator: true;
}
interface SimpleEffect<T, P = any> extends Effect<T, P> {
  combinator: false;
}
type StrictEffect<T = any, P = any> =
  | SimpleEffect<T, P>
  | StrictCombinatorEffect<T>;
type SagaIterator<RT = any> = Iterator<StrictEffect, RT, any>;
type SagaReturnType<S extends Function> = S extends (
  ...args: any[]
) => SagaIterator<infer RT>
  ? RT
  : S extends (...args: any[]) => Promise<infer RT>
  ? RT
  : S extends (...args: any[]) => infer RT
  ? RT
  : never;

interface RunProps {
  channel?: Channel;
  createId?: () => number;
}

interface Env {
  channel: Channel;
  createId: () => number;
}

type CallEffect<RT = any> = SimpleEffect<"CALL", CallEffectDescriptor<RT>>;

interface CallEffectDescriptor<RT> {
  context: any;
  fn: (...args: any[]) => SagaIterator<RT> | Promise<RT> | RT;
  args: any[];
}

type Fn = (...args: any[]) => any;

interface CallPayload<
  Fn extends (...args: any[]) => any = (...args: any[]) => any,
> {
  context: any;
  fn: Fn;
  args: Parameters<Fn>;
}

interface ForkPayload<
  Fn extends (...args: any[]) => any = (...args: any[]) => any,
> extends CallPayload<Fn> {
  detached: boolean;
}

interface PutPayload {
  channel: Channel;
  action: Action;
  resolve: boolean;
}

interface TakePayload {
  channel: Channel;
  pattern: string;
  maybe: boolean;
}

type SagaPayload = CallPayload | PutPayload | TakePayload;

interface SagaAction {
  "@@fx/ACTION": true;
  type: ActionType;
  payload: SagaPayload;
}

interface ReduxAction {
  "@@fx/ACTION"?: false;
  type: ActionType;
  payload?: any;
}

export type Action = ReduxAction | SagaAction;

interface Meta {
  name: string;
}

interface Scheduler {
  exec(fn: () => TaskItem): TaskItem;
  asap(fn: Fn): void;
  immediately(fn: () => TaskItem | void): TaskItem;
  suspend(): void;
  release(): void;
  flush(): void;
}

type TaskStatus = "running" | "cancelled" | "done" | "aborted";

interface Next {
  (p: NextProps): void;
  cancel: (err: any) => void;
}

interface NextPropsSuccess<S = any> {
  error: false;
  value: S | Action;
}

interface NextPropsError<E = any> {
  error: true;
  value: E;
}

// (command | effect result, false)
type NextProps<S = any, E = any> = NextPropsSuccess<S> | NextPropsError<E>;

interface TaskGen {
  status: TaskStatus;
  meta: Meta;
  finished?: Next;
  cancel: (err: any) => void;
}

export interface TaskItem extends TaskGen {
  "@@fx/TASK": true;
  id: number;
  isRoot: boolean;
  channel: Channel;
  toPromise: () => Promise<any>;
  getStatus: () => TaskStatus;
  queue: ForkQueue;
  isRunning: () => boolean;
  isCancelled: () => boolean;
  isAborted: () => boolean;
  result: () => any;
  error: () => any;
}

interface PromiseCb<R = any> {
  (p: NextProps<R>): void;
  cancel?: (err: any) => void;
}

interface Callback {
  (param: Action): void;
  "@@fx/MATCH"?: PatternFn;
  cancel?: () => void;
}

type Listener = (action: Action) => void;

interface Channel {
  put: (action: Action) => void;
  take: (cb: Callback, pattern: PatternFn) => void;
  close: () => void;
  flush: () => void;
  subscribe(cb: (action: Action) => void): () => void;
  scheduler: Scheduler;
}

type PatternFn = (s: Action) => boolean;

interface FxEffect<P = any> {
  env: Env;
  payload: P;
  effectId: number;
  finished: Next;
  task: TaskItem;
  digestEffect: (effect: any, finished: Next) => any;
}

interface PromiseWithCancel<T = any> extends Promise<T> {
  "@@fx/CANCEL": () => void;
}

interface EffectMap {
  [key: string]: (p: FxEffect) => any;
}

interface Deferred<R = any> {
  resolve: (result: R) => void;
  reject: (error: any) => void;
  promise: Promise<R>;
}

/**
 * CONSTANTS
 */

const prefix = "@@fx";
export const symbols = {
  prefix,
  io: `${prefix}/IO`,
  match: `${prefix}/MATCH`,
  cancel: `${prefix}/CANCEL`,
  terminate: `${prefix}/TERMINATE`,
  end: `${prefix}/CHANNEL_END`,
  channelEnd: `${prefix}/CHANNEL_END`,
  selfCancellation: `${prefix}/SELF_CANCELLATION`,
};
const effectRunnerMap: EffectMap = {
  CALL: runCallEffect,
  PUT: runPutEffect,
  TAKE: runTakeEffect,
  FORK: runForkEffect,
  CANCEL: runCancelEffect,
  CANCELLED: runCancelledEffect,
  ALL: runAllEffect,
  RACE: runRaceEffect,
};
const CLOSED_CHANNEL_WITH_TAKERS =
  "Cannot have a closed channel with pending takers";

/**
 * HELPERS
 */

const noop = () => {};
const noopCancel = () => {};
noopCancel.cancel = () => {};
const isEnd = (a?: Action) => a && a.type === symbols.channelEnd;
const isFunc = (f: any) => typeof f === "function";
const isPromise = (p: any) => p && isFunc(p.then);
const isIterator = (it: any) => it && isFunc(it.next) && isFunc(it.throw);
const isString = (s: any) => typeof s === "string";
const isNotUndef = (v: any) => v !== null && v !== undefined;
const isSymbol = (sym: any) =>
  Boolean(sym) &&
  typeof Symbol === "function" &&
  sym.constructor === Symbol &&
  sym !== Symbol.prototype;
const isStringableFunc = (f: any) => isFunc(f) && f.hasOwnProperty("toString");
// const isUndef = (v: any) => v === null || v === undefined;
export const isPattern = (pat: any): boolean =>
  pat &&
  (isString(pat) ||
    isSymbol(pat) ||
    isFunc(pat) ||
    (Array.isArray(pat) && pat.every(isPattern)));
const isChannel = (ch: any) => ch && isFunc(ch.take) && isFunc(ch.close);
const isMulticast = (ch: any) => isChannel(ch) && ch["@@fx/MULTICAST"];
const shouldTerminate = (res: string) => res === symbols.terminate;
const shouldCancel = (res: string) => res === symbols.cancel;
export function deferred<R = any>(): Deferred<R> {
  const def: any = {
    resolve: null,
    reject: null,
    promise: null,
  };
  def.promise = new Promise<R>((resolve, reject) => {
    def.resolve = resolve;
    def.reject = reject;
  });

  return def;
}
function resolvePromise<R = any>(
  promise: PromiseWithCancel<R>,
  cb: PromiseCb<R>,
) {
  const cancelPromise = promise["@@fx/CANCEL"];

  if (isFunc(cancelPromise)) {
    cb.cancel = cancelPromise;
  }

  promise.then(
    (value) => cb({ value, error: false }),
    (error) => {
      cb({ value: error, error: true });
    },
  );
}

export function check<T = any>(
  value: T,
  predicate: (v: T) => boolean,
  error: string,
) {
  if (!predicate(value)) {
    throw new Error(error);
  }
}

function remove<E = any>(array: E[], item: E) {
  const index = array.indexOf(item);
  if (index >= 0) {
    array.splice(index, 1);
  }
}

function once(fn: () => void) {
  let called = false;
  return () => {
    if (called) {
      return;
    }
    called = true;
    fn();
  };
}

const getMetaInfo = (fn: (...args: any[]) => any) => ({
  name: fn.name || "anonymous",
});

const createIdCreator = () => {
  let id = 0;
  return () => {
    id += 1;
    return id;
  };
};

/*
 * EFFECTS
 */

const makeEffect = (type: string, payload: any) => ({
  ["@@fx/IO"]: true,
  // this property makes all/race distinguishable in generic manner from other effects
  // currently it's not used at runtime at all but it's here to satisfy type systems
  combinator: false,
  type,
  payload,
});

type CancelledEffect = SimpleEffect<"CANCELLED", CancelledEffectDescriptor>;

type CancelledEffectDescriptor = {};

export function* cancelled(): SagaGenerator<boolean, CancelledEffect> {
  // TODO: fix
  const fx = yield makeEffect("CANCELLED", {}) as any;
  return fx as any;
}

function getFnCallDescriptor(fnDescriptor: any, args: any[]) {
  let context = null;
  let fn;

  if (isFunc(fnDescriptor)) {
    fn = fnDescriptor;
  } else {
    if (Array.isArray(fnDescriptor)) {
      [context, fn] = fnDescriptor;
    } else {
      context = fnDescriptor.context;
      fn = fnDescriptor.fn;
    }

    if (context && isString(fn) && isFunc(context[fn])) {
      fn = context[fn];
    }
  }

  return { context, fn, args };
}

export function call<Args extends any[], Fn extends (...args: Args) => any>(
  fn: Fn,
  ...args: Args
): SagaGenerator<SagaReturnType<Fn>, CallEffect<SagaReturnType<Fn>>>;
export function call<
  Args extends any[],
  Ctx extends {
    [P in Name]: (this: Ctx, ...args: Args) => any;
  },
  Name extends string,
>(
  ctxAndFnName: [Ctx, Name],
  ...args: Args
): SagaGenerator<
  SagaReturnType<Ctx[Name]>,
  CallEffect<SagaReturnType<Ctx[Name]>>
>;
export function call<
  Args extends any[],
  Ctx extends {
    [P in Name]: (this: Ctx, ...args: Args) => any;
  },
  Name extends string,
>(
  ctxAndFnName: { context: Ctx; fn: Name },
  ...args: Args
): SagaGenerator<
  SagaReturnType<Ctx[Name]>,
  CallEffect<SagaReturnType<Ctx[Name]>>
>;
export function call<
  Ctx,
  Args extends any[],
  Fn extends (this: Ctx, ...args: Args) => any,
>(
  ctxAndFn: [Ctx, Fn],
  ...args: Args
): SagaGenerator<SagaReturnType<Fn>, CallEffect<SagaReturnType<Fn>>>;
export function call<
  Ctx,
  Args extends any[],
  Fn extends (this: Ctx, ...args: Args) => any,
>(
  ctxAndFn: { context: Ctx; fn: Fn },
  ...args: Args
): SagaGenerator<SagaReturnType<Fn>, CallEffect<SagaReturnType<Fn>>>;

export function* call<
  Fn extends (...args: any[]) => any = (...args: any[]) => any,
>(
  fnDescriptor: Fn,
  ...args: Parameters<Fn>
): Generator<any, SagaReturnType<Fn>, any> {
  return yield makeEffect("call", getFnCallDescriptor(fnDescriptor, args));
}

function runCallEffect({
  env,
  payload: { context, fn, args },
  effectId,
  finished,
}: FxEffect<CallPayload>) {
  // catch synchronous failures; see #152
  try {
    const result = fn.apply(context, args);

    if (isPromise(result)) {
      resolvePromise(result, finished);
      return;
    }

    if (isIterator(result)) {
      // resolve iterator
      runtime({
        iterator: result,
        meta: getMetaInfo(fn),
        env,
        parentEffectId: effectId,
        cont: finished,
      });
      return;
    }

    finished({ value: result, error: false });
  } catch (error) {
    finished({ value: error, error: true });
  }
}

function runCancelledEffect({ task, finished }: FxEffect<{}>) {
  finished({ value: task.isCancelled(), error: false });
}

export type CancelEffect = SimpleEffect<"CANCEL", CancelEffectDescriptor>;
export type CancelEffectDescriptor =
  | TaskItem
  | TaskItem[]
  | "@@fx/SELF_CANCELLATION";

export function cancel(task: TaskItem): SagaGenerator<void, CancelEffect>;
export function cancel(tasks: TaskItem[]): SagaGenerator<void, CancelEffect>;
export function cancel(): SagaGenerator<void, CancelEffect>;
export function* cancel(
  taskOrTasks: TaskItem | TaskItem[] | string = symbols.selfCancellation,
): SagaGenerator<void, CancelEffect> {
  // TODO: fix
  const result = yield makeEffect("CANCEL", taskOrTasks) as any;
  return result as any;
}

const createEmptyArray = (n = 0) => Array.apply(null, new Array(n));
const shouldComplete = (res: string) =>
  shouldTerminate(res) || shouldCancel(res);

function createAllStyleChildCallbacks(
  shape: Effect[] | { [key: string]: Effect },
  parentCallback: Next,
) {
  const keys = Object.keys(shape);
  const totalCount = keys.length;

  if (process.env["NODE_ENV"] !== "production") {
    check(
      totalCount,
      (c) => c > 0,
      "createAllStyleChildCallbacks: get an empty array or object",
    );
  }

  let completedCount = 0;
  let completed = false;
  const results: any[] | { [key: string]: any } = Array.isArray(shape)
    ? createEmptyArray(totalCount)
    : {};
  const childCallbacks: { [key: string]: Next } = {};

  function checkEnd() {
    if (completedCount === totalCount) {
      completed = true;
      parentCallback({ value: results, error: false });
    }
  }

  keys.forEach((key) => {
    const chCbAtKey = (props: NextProps) => {
      if (completed) {
        return;
      }
      if (props.error || shouldComplete(props.value)) {
        parentCallback.cancel(props.value);
        parentCallback(props);
      } else {
        (results as any)[key] = props.value;
        completedCount++;
        checkEnd();
      }
    };
    chCbAtKey.cancel = noop;
    childCallbacks[key] = chCbAtKey;
  });

  parentCallback.cancel = (reason: string) => {
    if (!completed) {
      completed = true;
      keys.forEach((key) => childCallbacks[key]?.cancel(reason));
    }
  };

  return childCallbacks;
}

type AllPayload = { [key: string]: Effect } | Effect[];

function runAllEffect({
  payload: effects,
  finished,
  digestEffect,
}: FxEffect<AllPayload>) {
  const keys = Object.keys(effects);
  if (keys.length === 0) {
    finished({ value: Array.isArray(effects) ? [] : {}, error: false });
    return;
  }

  const childCallbacks = createAllStyleChildCallbacks(effects, finished);
  keys.forEach((key) => {
    const finished = childCallbacks[key];
    if (finished) {
      digestEffect((effects as any)[key], finished);
    }
  });
}

interface CombinatorEffect<T, P>
  extends Effect<T, CombinatorEffectDescriptor<P>> {
  combinator: true;
}

type AllEffect<T> = CombinatorEffect<"ALL", T>;

type EffectReturnType<T> = T extends SagaGenerator<infer RT, any>
  ? RT
  : T extends CallEffect
  ? T["payload"] extends CallEffectDescriptor<infer RT>
    ? RT
    : never
  : T extends TakeEffect
  ? ActionPattern
  : unknown;

export function all<T>(
  effects: T[],
): SagaGenerator<EffectReturnType<T>[], AllEffect<T>>;
export function all<T extends { [key: string]: any }>(
  effects: T,
): SagaGenerator<
  {
    [K in keyof T]: EffectReturnType<T[K]>;
  },
  AllEffect<T[keyof T]>
>;
export function* all(effects: any): any {
  const eff = makeEffect("ALL", effects);
  eff.combinator = true;
  return yield eff;
}

type RaceEffect<T> = CombinatorEffect<"RACE", T>;

export function race<T>(
  effects: T[],
): SagaGenerator<(EffectReturnType<T> | undefined)[], RaceEffect<T>>;
export function race<T extends { [key: string]: any }>(
  effects: T,
): SagaGenerator<
  {
    [K in keyof T]: EffectReturnType<T[K]> | undefined;
  },
  RaceEffect<T[keyof T]>
>;

export function* race(effects: any): any {
  const eff = makeEffect("RACE", effects);
  eff.combinator = true;
  return yield eff;
}

function runRaceEffect({
  payload: effects,
  finished,
  digestEffect,
}: FxEffect<AllPayload>) {
  const keys = Object.keys(effects);
  const response: any[] | { [key: string]: any } = Array.isArray(effects)
    ? createEmptyArray(keys.length)
    : {};
  const childCbs: { [key: string]: Next } = {};
  let completed = false;

  keys.forEach((key) => {
    const chCbAtKey = (props: NextProps) => {
      if (completed) {
        return;
      }
      if (props.error || shouldComplete(props.value)) {
        // Race Auto cancellation
        finished.cancel(props.value);
        finished(props);
      } else {
        finished.cancel(props.value);
        completed = true;
        (response as any)[key] = props.value;
        finished({ value: response, error: false });
      }
    };
    chCbAtKey.cancel = noop;
    childCbs[key] = chCbAtKey;
  });

  finished.cancel = (reason: string) => {
    // prevents unnecessary cancellation
    if (!completed) {
      completed = true;
      keys.forEach((key) => childCbs[key]?.cancel(reason));
    }
  };
  keys.forEach((key) => {
    if (completed) {
      return;
    }
    const fin = childCbs[key];
    if (fin) {
      digestEffect((effects as any)[key], fin);
    }
  });
}

type CancelPayload = TaskItem | TaskItem[] | string;

function cancelSingleTask(taskToCancel: TaskItem) {
  if (taskToCancel.isRunning()) {
    taskToCancel.cancel("cancel effect called");
  }
}

function runCancelEffect({
  payload: taskOrTasks,
  finished,
  task,
}: FxEffect<CancelPayload>) {
  if (taskOrTasks === symbols.selfCancellation) {
    cancelSingleTask(task);
  } else if (Array.isArray(taskOrTasks)) {
    taskOrTasks.forEach(cancelSingleTask);
  } else {
    cancelSingleTask(taskOrTasks as TaskItem);
  }
  finished({ value: undefined, error: false });
  // cancel effects are non cancellables
}

interface PutEffectDescriptor<A extends Action> {
  action: A;
  channel: null;
  resolve?: boolean;
}
type PutEffect<A extends Action = Action> = SimpleEffect<
  "PUT",
  PutEffectDescriptor<A>
>;
type ChannelPutEffect<T> = SimpleEffect<"PUT", ChannelPutEffectDescriptor<T>>;

interface ChannelPutEffectDescriptor<T> {
  action: T;
  channel: PuttableChannel<T>;
}
interface END {
  type: "@@fx/CHANNEL_END";
}
interface PuttableChannel<T> {
  put(message: T | END): void;
}
export type SagaGenerator<RT, E extends Effect = Effect<any, any>> = Generator<
  E,
  RT
>;

function runPutEffect({
  env,
  payload: { channel = env.channel, action, resolve },
  finished,
}: FxEffect<PutPayload>) {
  /**
   Schedule the put in case another saga is holding a lock.
   The put will be executed atomically. ie nested puts will execute after
   this put has terminated.
   **/
  env.channel.scheduler.asap(() => {
    let result: PromiseWithCancel | null | any = null;
    try {
      result = channel.put(action);
    } catch (error) {
      finished({ value: error, error: true });
      return;
    }

    if (resolve && isPromise(result)) {
      resolvePromise(result as PromiseWithCancel, finished);
    } else {
      finished({ value: result, error: false });
    }
  });
  // Put effects are non cancellables
}

/**
 * Creates an Effect description that instructs the middleware to put an action
 * into the provided channel.
 *
 * This effect is blocking if the put is *not* buffered but immediately consumed
 * by takers. If an error is thrown in any of these takers it will bubble back
 * into the saga.
 */
export function put<A extends Action>(
  action: A,
): SagaGenerator<A, PutEffect<A>>;
export function put<T>(
  channel: PuttableChannel<T>,
  action: T | END,
): SagaGenerator<T, ChannelPutEffect<T>>;
export function* put(chan: any, act?: any): any {
  let channel = chan;
  let action = act;
  if (channel?.type) {
    action = channel;
    channel = undefined;
  }
  return yield makeEffect("PUT", { channel, action });
}

function matcher(pattern: string) {
  const array = (patterns: string[]) => (input: any) =>
    patterns.some((p) => matcher(p)(input));
  const predicate = (predicate: (input: any) => boolean) => (input: any) =>
    predicate(input);
  const string = (pattern: string) => (input: any) =>
    input.type === String(pattern);
  const symbol = (pattern: string) => (input: any) => input.type === pattern;
  const wildcard = () => (v: any) => !!v;

  const matcherCreator: ((d: any) => (p: any) => boolean) | null =
    pattern === "*"
      ? wildcard
      : isString(pattern)
      ? string
      : Array.isArray(pattern)
      ? array
      : isStringableFunc(pattern)
      ? string
      : isFunc(pattern)
      ? predicate
      : isSymbol(pattern)
      ? symbol
      : null;

  if (matcherCreator === null) {
    throw new Error(`invalid pattern: ${pattern}`);
  }

  return matcherCreator(pattern);
}

function runTakeEffect({
  env,
  payload: { channel = env.channel, pattern, maybe = false },
  finished,
}: FxEffect) {
  const takeCb = (input: any) => {
    if (input instanceof Error) {
      finished({ value: input, error: true });
      return;
    }
    if (isEnd(input) && !maybe) {
      finished({ value: symbols.terminate, error: false });
      return;
    }
    finished({ value: input, error: false });
  };
  takeCb.cancel = noop;

  try {
    channel.take(takeCb, isNotUndef(pattern) ? matcher(pattern) : null);
  } catch (err) {
    finished({ value: err, error: true });
    return;
  }

  finished.cancel = takeCb.cancel;
}

export function take<A extends Action>(
  pattern: ActionPattern<A>,
): SagaGenerator<A, TakeEffect>;
export function take<T>(
  channel: TakeableChannel<T>,
  multicastPattern?: Pattern<T>,
): SagaGenerator<T, ChannelTakeEffect<T>>;
export function* take(
  patternOrChannel: any,
  multicastPattern?: any,
): SagaGenerator<any, any> {
  if (isPattern(patternOrChannel)) {
    if (isNotUndef(multicastPattern)) {
      console.warn(
        "take(pattern) takes one argument but two were provided. Consider passing an array for listening to several action types",
      );
    }
    return yield makeEffect("TAKE", { pattern: patternOrChannel });
  }
  if (
    isMulticast(patternOrChannel) &&
    isNotUndef(multicastPattern) &&
    isPattern(multicastPattern)
  ) {
    return makeEffect("TAKE", {
      channel: patternOrChannel,
      pattern: multicastPattern,
    });
  }
  if (isChannel(patternOrChannel)) {
    if (isNotUndef(multicastPattern)) {
      console.warn(
        "take(channel) takes one argument but two were provided. Second argument is ignored.",
      );
    }
    return yield makeEffect("TAKE", { channel: patternOrChannel });
  }

  return null;
}

function getIteratorMetaInfo(iterator: any, fn: any) {
  if (iterator.isSagaIterator) {
    return { name: iterator.meta.name };
  }
  return getMetaInfo(fn);
}

function createTaskIterator({ context, fn, args }: CallPayload) {
  // catch synchronous failures; see #152 and #441
  try {
    const result = fn.apply(context, args);

    // i.e. a generator function returns an iterator
    if (isIterator(result)) {
      return result;
    }

    let resolved = false;

    const next = (arg: any) => {
      if (resolved) {
        return { value: arg, done: true };
      } else {
        resolved = true;
        // Only promises returned from fork will be interpreted. See #1573
        return { value: result, done: !isPromise(result) };
      }
    };

    return makeIterator(next);
  } catch (err) {
    // do not bubble up synchronous failures for detached forks
    // instead create a failed task. See #152 and #441
    return makeIterator(() => {
      throw err;
    });
  }
}

const kThrow = (err: any) => {
  throw err;
};
const kReturn = (value: any) => ({ value, done: true });
function makeIterator(
  next: (arg: any) => { value: any; done: boolean },
  thro = kThrow,
  name = "iterator",
) {
  const iterator = {
    meta: { name },
    next,
    throw: thro,
    return: kReturn,
    isSagaIterator: true,
  };

  if (typeof Symbol !== "undefined") {
    (iterator as any)[Symbol.iterator] = () => iterator;
  }
  return iterator;
}

function runForkEffect({
  env,
  payload: { context, fn, args, detached = false },
  effectId,
  finished,
  task,
}: FxEffect<ForkPayload>) {
  const taskIterator = createTaskIterator({ context, fn, args });
  const meta = getIteratorMetaInfo(taskIterator, fn);

  env.channel.scheduler.immediately(() => {
    const child = runtime({
      iterator: taskIterator,
      env,
      parentEffectId: effectId,
      meta,
      isRoot: detached,
    });

    if (detached) {
      finished({ value: child, error: false });
    } else {
      if (child.isRunning()) {
        task.queue.addTask(child);
        finished({ value: child, error: false });
      } else if (child.isAborted()) {
        task.queue.abort(child.error());
      } else {
        finished({ value: child, error: false });
      }
    }

    return child;
  });
  // Fork effects are non cancellables
}

interface FixedTask<A> extends TaskItem {
  result: <T = A>() => T | undefined;
  toPromise: <T = A>() => Promise<T>;
}

export type ForkEffect<RT = any> = SimpleEffect<
  "FORK",
  ForkEffectDescriptor<RT>
>;

export interface ForkEffectDescriptor<RT> extends CallEffectDescriptor<RT> {
  detached?: boolean;
}

export function* fork<
  Fn extends (...args: any[]) => any = (...args: any[]) => any,
>(
  fnDescriptor: Fn,
  ...args: Parameters<Fn>
): SagaGenerator<
  FixedTask<SagaReturnType<Fn>>,
  ForkEffect<SagaReturnType<Fn>>
> {
  // TODO: fix
  const fx: any = yield makeEffect(
    "FORK",
    getFnCallDescriptor(fnDescriptor, args),
  ) as any;
  return fx;
}

const MAX_SIGNED_INT = 2147483647;

export function delayP(ms: number, val = true) {
  // https://developer.mozilla.org/en-US/docs/Web/API/setTimeout#maximum_delay_value
  if (process.env["NODE_ENV"] !== "production" && ms > MAX_SIGNED_INT) {
    throw new Error(
      `delay only supports a maximum value of ${MAX_SIGNED_INT}ms`,
    );
  }
  let timeoutId: any;
  const promise = new Promise((resolve) => {
    timeoutId = setTimeout(resolve, Math.min(MAX_SIGNED_INT, ms), val);
  });

  (promise as PromiseWithCancel)["@@fx/CANCEL"] = () => {
    clearTimeout(timeoutId);
  };

  return promise as PromiseWithCancel;
}

export function delay(ms: number) {
  return call(delayP, ms);
}

interface ForkQueue {
  addTask: (task: TaskGen) => void;
  cancelAll: (err: any) => void;
  abort: (err: any) => void;
  getTasks: () => TaskGen[];
}

/**
 Used to track a parent task and its forks
 In the fork model, forked tasks are attached by default to their parent
 We model this using the concept of Parent task && main Task
 main task is the main flow of the current Generator, the parent tasks is the
 aggregation of the main tasks + all its forked tasks.
 Thus the whole model represents an execution tree with multiple branches (vs the
 linear execution tree in sequential (non parallel) programming)

 A parent tasks has the following semantics
 - It completes if all its forks either complete or all cancelled
 - If it's cancelled, all forks are cancelled as well
 - It aborts if any uncaught error bubbles up from forks
 - If it completes, the return value is the one returned by the main task
 **/
function forkQueue(
  mainTask: TaskGen | TaskItem,
  onAbort: () => void,
  finished: Next,
): ForkQueue {
  let tasks: (TaskGen | TaskItem)[] = [];
  let result: any;
  let completed = false;

  addTask(mainTask);
  const getTasks = () => tasks;

  function abort(err: any) {
    onAbort();
    cancelAll(err);
    finished({ value: err, error: true });
  }

  function addTask(task: TaskGen | TaskItem) {
    tasks.push(task);
    function taskFinished(props: NextProps) {
      if (completed) {
        return;
      }

      remove(tasks, task);
      task.finished = noopCancel;
      if (props.error) {
        abort(props.value);
      } else {
        if (task === mainTask) {
          result = props.value;
        }
        if (tasks.length === 0) {
          completed = true;
          finished({ value: result, error: false });
        }
      }
    }
    taskFinished.cancel = noop;
    task.finished = taskFinished;
  }

  function cancelAll(err: any) {
    if (completed) {
      return;
    }
    completed = true;
    tasks.forEach((task) => {
      task.finished = noopCancel;
      if (task.cancel) {
        task.cancel(err);
      }
    });
    tasks = [];
  }

  return {
    addTask,
    cancelAll,
    abort,
    getTasks,
  };
}

function createTask(
  mainTask: TaskGen | TaskItem,
  parentEffectId: number,
  isRoot: boolean,
  finished: Next = noopCancel,
  channel: Channel,
): TaskItem {
  let status: TaskStatus = "running";
  let taskResult: any;
  let taskError: any;
  let deferredEnd: Deferred | null = null;

  const queue = forkQueue(
    mainTask,
    function onAbort() {
      console.log("aborted");
    },
    end,
  );

  const isRunning = () => status === "running";
  /*
      This method is used both for answering the cancellation status of the task and answering for CANCELLED effects.
      In most cases, the cancellation of a task propagates to all its unfinished children (including
      all forked tasks and the mainTask), so a naive implementation of this method would be:
        `() => status === CANCELLED || mainTask.status === CANCELLED`

      But there are cases that the task is aborted by an error and the abortion caused the mainTask to be cancelled.
      In such cases, the task is supposed to be aborted rather than cancelled, however the above naive implementation
      would return true for `task.isCancelled()`. So we need make sure that the task is running before accessing
      mainTask.status.

      There are cases that the task is cancelled when the mainTask is done (the task is waiting for forked children
      when cancellation occurs). In such cases, you may wonder `yield io.cancelled()` would return true because
      `status === CANCELLED` holds, and which is wrong. However, after the mainTask is done, the iterator cannot yield
      any further effects, so we can ignore such cases.

      See discussions in #1704
     */
  const isCancelled = () =>
    status === "cancelled" ||
    (status === "running" && mainTask.status === "cancelled");
  const isAborted = () => status === "aborted";
  const result = () => taskResult;
  const error = () => taskError;
  const getStatus = () => status;

  const task: TaskItem = {
    "@@fx/TASK": true,
    id: parentEffectId,
    meta: mainTask.meta,
    isRoot,
    finished,
    toPromise,
    cancel,
    status,
    getStatus,
    queue,
    isRunning,
    isCancelled,
    isAborted,
    result,
    error,
    channel,
  };

  /**
   This may be called by a parent generator to trigger/propagate cancellation
   cancel all pending tasks (including the main task), then end the current task.

   Cancellation propagates down to the whole execution tree held by this Parent task
   It's also propagated to all joiners of this task and their execution tree/joiners

   Cancellation is noop for terminated/Cancelled tasks tasks
   **/
  function cancel(err: any) {
    if (status === "running") {
      // Setting status to CANCELLED does not necessarily mean that the task/iterators are stopped
      // effects in the iterator's finally block will still be executed
      status = "cancelled";
      queue.cancelAll(err);
      // Ending with a TASK_CANCEL will propagate the Cancellation to all joiners
      end({ value: symbols.cancel, error: false });
    }
  }

  function end({ value, error }: NextProps) {
    if (error) {
      status = "aborted";

      taskError = value;
      if (deferredEnd?.reject) {
        deferredEnd?.reject(value);
      }
    } else {
      // The status here may be RUNNING or CANCELLED
      // If the status is CANCELLED, then we do not need to change it here
      if (value === symbols.cancel) {
        status = "cancelled";
      } else if (status !== "cancelled") {
        status = "done";
      }
      taskResult = value;
      if (deferredEnd?.resolve) {
        deferredEnd.resolve(value);
      }
    }

    if (task.finished) {
      task.finished({ value, error });
    }
  }

  end.cancel = noop;

  function toPromise() {
    if (deferredEnd) {
      return deferredEnd.promise;
    }

    deferredEnd = deferred();

    if (status === "aborted") {
      if (deferredEnd?.reject) {
        deferredEnd.reject(taskError);
      }
    } else if (status !== "running") {
      if (deferredEnd?.resolve) {
        deferredEnd.resolve(taskResult);
      }
    }

    return deferredEnd.promise;
  }

  return task;
}

/**
 * SCHEDULER
 */

/**
 * A counting sempahore
 * https://en.wikipedia.org/wiki/Semaphore_(programming)#Semaphores_vs._mutexes

 * - Incrementing adds a lock and puts the scheduler in a `suspended` state (if it's not
 *   already suspended)
 * - Decrementing releases a lock. Zero locks puts the scheduler in a `released` state. This
 *   triggers flushing the queued tasks.
 */
export function createScheduler(): Scheduler {
  const queue: (() => TaskItem)[] = [];

  let semaphore = 0;

  /**
    Executes a task 'atomically'. Tasks scheduled during this execution will be queued
    and flushed after this task has finished (assuming the scheduler endup in a released
    state).
  */
  function exec(task: () => TaskItem) {
    try {
      suspend();
      return task();
    } finally {
      release();
    }
  }

  /**
    Executes or queues a task depending on the state of the scheduler (`suspended` or `released`)
  */
  function asap(task: () => TaskItem) {
    queue.push(task);

    if (!semaphore) {
      suspend();
      flush();
    }
  }

  /**
    Puts the scheduler in a `suspended` state and executes a task immediately.
  */
  function immediately(task: () => TaskItem) {
    try {
      suspend();
      return task();
    } finally {
      flush();
    }
  }

  /**
    Puts the scheduler in a `suspended` state. Scheduled tasks will be queued until the
    scheduler is released.
  */
  function suspend() {
    semaphore += 1;
  }

  /**
    Puts the scheduler in a `released` state.
  */
  function release() {
    semaphore -= 1;
  }

  /**
    Releases the current lock. Executes all queued tasks if the scheduler is in the released state.
  */
  function flush() {
    release();

    let task: (() => TaskItem) | undefined;
    while (!semaphore && (task = queue.shift()) !== undefined) {
      exec(task);
    }
  }

  return {
    exec,
    asap,
    immediately,
    suspend,
    release,
    flush,
  };
}

/*
 * CHANNELS
 */

export function multicastChannel(): Channel {
  let closed = false;
  let current: Callback[] = [];
  let next = current;
  const scheduler = createScheduler();
  const listeners: Listener[] = [];

  const checkForbiddenStates = () => {
    if (closed && next.length) {
      throw new Error(CLOSED_CHANNEL_WITH_TAKERS);
    }
  };

  const ensureCanMutateNextTakers = () => {
    if (next !== current) {
      return;
    }
    next = current.slice();
  };

  const close = () => {
    if (process.env["NODE_ENV"] !== "production") {
      checkForbiddenStates();
    }

    closed = true;
    current = next;
    const takers = next;
    next = [];
    takers.forEach((taker) => {
      taker({ type: symbols.channelEnd });
    });
  };

  const put = (action: Action) => {
    if (process.env["NODE_ENV"] !== "production") {
      checkForbiddenStates();
    }

    if (closed) {
      return;
    }

    if (isEnd(action)) {
      close();
      return;
    }

    current = next;
    next.forEach((taker) => {
      if (!taker) {
        return;
      }
      if (!taker["@@fx/MATCH"]) {
        return;
      }
      if (!taker["@@fx/MATCH"](action)) {
        return;
      }

      if (taker.cancel) {
        taker.cancel();
      }
      taker(action);
    });

    listeners.forEach((listener) => {
      listener(action);
    });
  };

  const take = (cb: Callback, pattern: PatternFn) => {
    if (process.env["NODE_ENV"] !== "production") {
      checkForbiddenStates();
    }

    if (closed) {
      cb({ type: symbols.end });
      return;
    }

    cb["@@fx/MATCH"] = pattern;
    ensureCanMutateNextTakers();
    next.push(cb);

    cb.cancel = once(() => {
      ensureCanMutateNextTakers();
      remove(next, cb);
    });
  };

  const flush = noop;
  const subscribe = (cb: (action: Action) => void) => {
    listeners.push(cb);
    return () => remove(listeners, cb);
  };

  return {
    close,
    put,
    take,
    flush,
    subscribe,
    scheduler,
  };
}

export function stdChannel() {
  const chan = multicastChannel();
  const { put } = chan;
  chan.put = (input: Action) => {
    if (input["@@fx/ACTION"]) {
      put(input);
      return;
    }
    chan.scheduler.asap(() => {
      put(input);
    });
  };
  return chan;
}

/*
 * RUNTIME
 */

interface Runtime {
  iterator: Generator;
  meta: Meta;
  env: Env;
  parentEffectId: number;
  isRoot?: boolean;
  cont?: Next;
}

/**
 * This is the engine that drives iterating through generators.
 */
function runtime({
  iterator,
  meta,
  env,
  parentEffectId,
  cont = noopCancel,
  isRoot = false,
}: Runtime): TaskItem {
  /**
    Tracks the current effect cancellation
    Each time the generator progresses. calling runEffect will set a new value
    on it. It allows propagating cancellation to child effects
  **/
  next.cancel = noop;

  const mainTask: TaskGen = {
    status: "running" as TaskStatus,
    cancel: cancelMain,
    meta,
    finished: noopCancel,
  };

  const task = createTask(mainTask, parentEffectId, isRoot, cont, env.channel);
  /**
    cancellation of the main task. We'll simply resume the Generator with a TASK_CANCEL
  **/
  function cancelMain() {
    if (mainTask.status === "running") {
      mainTask.status = "cancelled";
      next({ value: symbols.cancel, error: false });
    }
  }

  /**
    attaches cancellation logic to this task's continuation
    this will permit cancellation to propagate down the call chain
  **/
  cont.cancel = task.cancel;

  // kicks up the generator
  next({ value: undefined, error: false });

  return task;

  /**
   * This is the generator driver
   * It's a recursive async/continuation function which calls itself
   * until the generator terminates or throws
   *
   * receives either (command | effect result, false) or (any thrown thing, true)
   */
  function next({ value, error }: NextProps) {
    try {
      let result;
      if (error) {
        result = iterator.throw(value);
      } else if (shouldCancel(value)) {
        /**
          getting TASK_CANCEL automatically cancels the main task
          We can get this value here

          - By cancelling the parent task manually
          - By joining a Cancelled task
        **/
        mainTask.status = "cancelled";
        /**
          Cancels the current effect; this will propagate the cancellation down to any called tasks
        **/
        next.cancel();
        /**
          If this Generator has a `return` method then invokes it
          This will jump to the finally block
        **/
        result = isFunc(iterator.return)
          ? iterator.return(symbols.cancel)
          : { done: true, value: symbols.cancel };
      } else if (shouldTerminate(value)) {
        // We get TERMINATE flag, i.e. by taking from a channel that ended using `take` (and not `takem` used to trap End of channels)
        result = isFunc(iterator.return)
          ? iterator.return(undefined)
          : { done: true };
      } else {
        result = iterator.next(value);
      }

      if (result.done) {
        /**
          This Generator has ended, terminate the main task and notify the fork queue
        **/
        if (mainTask.status !== "cancelled") {
          mainTask.status = "done";
        }

        if (mainTask.finished) {
          mainTask.finished({ value: result.value, error: false });
        }
      } else {
        digestEffect(result.value, next);
      }
    } catch (error: any) {
      if (mainTask.status === "cancelled") {
        throw error;
      }
      mainTask.status = "aborted";

      if (mainTask.finished) {
        mainTask.finished({ value: error, error: true });
      }
    }
  }

  function runEffect(
    effect: any & { "@@fx/IO": boolean },
    effectId: number,
    finished: Next,
  ) {
    /**
      each effect runner must attach its own logic of cancellation to the provided callback
      it allows this generator to propagate cancellation downward.

      ATTENTION! effect runners must setup the cancel logic by setting cb.cancel = [cancelMethod]
      And the setup must occur before calling the callback

      This is a sort of inversion of control: called async functions are responsible
      of completing the flow by calling the provided continuation; while caller functions
      are responsible for aborting the current flow by calling the attached cancel function

      Library users can attach their own cancellation logic to promises by defining a
      promise[CANCEL] method in their returned promises
      ATTENTION! calling cancel must have no effect on an already completed or cancelled effect
    **/
    if (isPromise(effect)) {
      resolvePromise(effect, finished);
    } else if (isIterator(effect)) {
      // resolve iterator
      runtime({
        iterator: effect,
        meta,
        env,
        parentEffectId: effectId,
        cont: finished,
      });
    } else if (effect?.["@@fx/IO"]) {
      const effectRunner = effectRunnerMap[effect.type];
      if (effectRunner) {
        effectRunner({
          env,
          payload: effect.payload,
          effectId,
          finished,
          task,
          digestEffect,
        });
      }
    } else {
      // anything else returned as is
      next({ value: effect, error: false });
    }
  }

  function digestEffect(effect: any & { "@@fx/IO": boolean }, finished: Next) {
    const effectId = env.createId();

    /**
      completion callback and cancel callback are mutually exclusive
      We can't cancel an already completed effect
      And We can't complete an already cancelled effectId
    **/
    let effectSettled = false;

    // Completion callback passed to the appropriate effect runner
    function complete({ value, error }: NextProps) {
      if (effectSettled) {
        return;
      }

      effectSettled = true;
      finished.cancel = noop; // defensive measure
      finished({ value, error });
    }
    // tracks down the current cancel
    complete.cancel = noop;

    function cancel() {
      // prevents cancelling an already completed effect
      if (effectSettled) {
        return;
      }

      effectSettled = true;

      complete.cancel(); // propagates cancel downward
      complete.cancel = noop; // defensive measure
    }
    // setup cancellation logic on the parent cb
    finished.cancel = cancel;

    runEffect(effect, effectId, complete);
  }
}

export function createRuntime({
  channel = stdChannel(),
  createId = createIdCreator(),
}: RunProps = {}) {
  if (!channel) {
    channel = stdChannel();
  }

  if (!createId) {
    createId = createIdCreator();
  }

  function _run<Fn extends (...args: any[]) => any = (...args: any[]) => any>(
    fn: Fn,
    ...args: Parameters<Fn>
  ) {
    const iterator = fn(...args);
    const effectId = createId();
    const env = {
      channel,
      createId,
    };
    const meta = getMetaInfo(fn);

    const task = channel.scheduler.immediately(() =>
      runtime({
        iterator,
        meta,
        env,
        parentEffectId: effectId,
        isRoot: true,
      }),
    );

    return task;
  }

  return _run;
}

export const run = createRuntime();
