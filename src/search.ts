/** Um bloco casa com a busca se o texto aparece (sem diferenciar maiúsculas) em algum dos campos. */
export function matchesQuery(query: string, ...fields: string[]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => field.toLowerCase().includes(needle));
}
