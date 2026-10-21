import type { ChangelogArchive } from './archive';

export type { ChangelogArchive } from './archive';

/** Search only the author and category/description actually displayed per row. */
export function filterChangelog(archive: ChangelogArchive, query: string) {
  const needle = query.trim().toLowerCase();
  let totalEntries = 0;
  let matchingEntries = 0;
  const filtered: ChangelogArchive = Object.create(null);
  for (const [date, authors] of Object.entries(archive)) {
    const matchingAuthors: ChangelogArchive[string] = Object.create(null);
    for (const [author, changes] of Object.entries(authors)) {
      totalEntries += changes.length;
      const matches = !needle
        ? changes
        : changes.filter((change) => {
            const category = Object.keys(change)[0] ?? '';
            return (
              author.toLowerCase().includes(needle) ||
              category.toLowerCase().includes(needle) ||
              String(change[category] ?? '')
                .toLowerCase()
                .includes(needle)
            );
          });
      matchingEntries += matches.length;
      if (matches.length) matchingAuthors[author] = matches;
    }
    if (Object.keys(matchingAuthors).length) filtered[date] = matchingAuthors;
  }
  return {
    archive: needle ? filtered : archive,
    totalEntries,
    matchingEntries,
  };
}
