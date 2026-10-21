import dateformat from 'dateformat';

export type ChangelogArchive = Record<
  string,
  Record<string, Record<string, unknown>[]>
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Reject data the archive renderer cannot consume, without rewriting entries. */
export function isChangelogArchive(value: unknown): value is ChangelogArchive {
  if (!isRecord(value)) return false;
  for (const [date, authors] of Object.entries(value)) {
    try {
      dateformat(date, 'd mmmm yyyy', true);
    } catch {
      return false;
    }
    if (!isRecord(authors)) return false;
    for (const changes of Object.values(authors)) {
      if (!Array.isArray(changes)) return false;
      for (const change of changes) {
        if (!isRecord(change)) return false;
        // Rendering uses the first category only; retain empty and extra keys.
        const description = change[Object.keys(change)[0]];
        if (
          description !== undefined &&
          description !== null &&
          !['string', 'number', 'boolean'].includes(typeof description)
        ) {
          return false;
        }
      }
    }
  }
  return true;
}
