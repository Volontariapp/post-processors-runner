/**
 * Lit un indicateur booleen depuis la source brute : une variable d'environnement arrive en texte
 * et la conversion implicite ferait de "false" la valeur vraie.
 */
export const booleanFlag =
  (key: string) =>
  ({ obj }: { obj: Record<string, unknown> }): boolean =>
    obj[key] === true || obj[key] === 'true';
