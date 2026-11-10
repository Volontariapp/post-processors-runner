import { jest } from '@jest/globals';
import { createMock } from '@volontariapp/testing';
import type { Redis } from 'ioredis';

type RedisCallReturn = string | number | null | RedisCallReturn[];

/**
 * Stands in for the global NestRedisProvider: its stream returns one entry, then stays idle,
 * and XACK and the module destruction (disconnect) are written to `journal`.
 */
export class RecordingRedisProviderMock {
  readonly driver: jest.Mocked<Redis>;
  private delivered = false;

  constructor(private readonly journal: string[]) {
    this.driver = createMock<Redis>();
    this.driver.duplicate.mockReturnValue(this.driver);
    jest
      .spyOn(this.driver, 'call')
      .mockImplementation(
        async (command: string, ...args: (string | number | Buffer)[]) => {
          return this.answer(command, args.length);
        },
      );
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  getDriver(): Redis {
    return this.driver;
  }

  onModuleDestroy(): Promise<void> {
    this.journal.push('redis-disconnect');
    return Promise.resolve();
  }

  private async answer(
    command: string,
    argCount: number,
  ): Promise<RedisCallReturn> {
    if (command === 'XGROUP') return 'OK';
    if (command === 'XACK') {
      this.journal.push('XACK');
      return argCount - 2;
    }
    if (command === 'XREADGROUP') {
      if (!this.delivered) {
        this.delivered = true;
        return [
          [
            'stream:shutdown-probe',
            [['1-0', ['type', 'probe', 'event', '{}']]],
          ],
        ];
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      return null;
    }
    return null;
  }
}
