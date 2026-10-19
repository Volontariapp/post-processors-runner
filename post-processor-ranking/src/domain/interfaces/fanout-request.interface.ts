import type { IFanoutRankingPayload } from '@volontariapp/messaging';

export interface FanoutRequest {
  trigger: IFanoutRankingPayload['trigger'];
  /** Identifiant de l'objet declencheur (eventId ou postId), emitterId du job. */
  subjectId: string;
  eventId?: string;
  postId?: string;
  authorId?: string;
}
