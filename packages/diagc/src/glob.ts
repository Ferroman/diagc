import fg, { type Options } from 'fast-glob';

/** The paths `pattern` matches, in path order. fast-glob answers in the order the file
 * system lists entries, which changes from run to run, and so would every output
 * that follows it. */
export async function globSorted(pattern: string, options: Options = {}): Promise<string[]> {
  return (await fg(pattern, options)).sort();
}
