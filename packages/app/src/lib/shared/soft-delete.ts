/**
 * Soft-delete utilities.
 *
 * Instead of physically removing rows we set `deletedAt` to the current
 * timestamp.  All list / query helpers should include `notDeleted` in their
 * `where` clause so that soft-deleted rows are invisible by default.
 */

/** Where-clause fragment that excludes soft-deleted rows. */
export const notDeleted = { deletedAt: null } as const;

/** Returns the data payload to mark a row as soft-deleted. */
export function softDelete() {
  return { deletedAt: new Date() } as const;
}

/** Returns the data payload to restore a soft-deleted row. */
export function restore() {
  return { deletedAt: null } as const;
}
