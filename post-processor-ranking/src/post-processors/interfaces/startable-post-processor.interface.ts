export interface StartablePostProcessor {
  start(): Promise<void>;
}
