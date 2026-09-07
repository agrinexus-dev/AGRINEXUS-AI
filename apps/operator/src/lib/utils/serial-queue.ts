/**
 * Fixes a confirmed pre-existing race: `robot-mission-store.ts`/
 * `mission-store.ts` fire lifecycle persistence (`persistCreate`/
 * `persistPatch`/`persistDelete`) as unawaited, fire-and-forget requests so
 * the Mission Planner/AURA never blocks on a backend round trip (see those
 * files' own doc comments). A single "propose → confirm" AURA flow issues
 * SEVERAL of these in a row for the SAME mission id (create → assign →
 * generate route → start), and — being fire-and-forget — they had no
 * guarantee of arriving at the server in the order they were issued. Live
 * testing found this could leave a mission durably saved as
 * `status: "queued", assignedRobotId: null` even though it was genuinely
 * running client-side, because a later write (e.g. "start") occasionally
 * reached the database before an earlier one (e.g. "assign").
 *
 * `runSerialized` fixes the ORDERING only — every other property of these
 * calls (fire-and-forget from the caller's perspective, errors swallowed,
 * no new store, no new execution path) is unchanged. Requests sharing the
 * same `key` (a mission id) are guaranteed to run one at a time, in the
 * order `runSerialized` was called, regardless of how long any individual
 * request takes or whether it fails — a slow/failed write for one mission
 * never blocks or corrupts the queue for a DIFFERENT mission id.
 */

const queues = new Map<string, Promise<unknown>>();

export function runSerialized<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previousTail = queues.get(key) ?? Promise.resolve();
  const result = previousTail.then(task, task);
  // The stored tail must never itself reject — a failed write must still let
  // the NEXT queued write for this key run, never permanently wedge the
  // queue. The `result` returned to THIS caller still resolves/rejects with
  // the real outcome.
  queues.set(
    key,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}
