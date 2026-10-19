/** L'utilisateur se lit dans le payload, a defaut dans l'emitterId de l'enveloppe. */
export const resolveUserId = (
  payloadUserId: string | undefined,
  emitterId: string,
): string | undefined => {
  if (payloadUserId) {
    return payloadUserId;
  }
  return emitterId.length > 0 ? emitterId : undefined;
};
