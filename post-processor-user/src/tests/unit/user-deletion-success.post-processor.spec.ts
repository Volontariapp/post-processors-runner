import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { UserDeletionSuccessPostProcessor } from '../../post-processors/users/user-deletion-success.post-processor.js';
import { UserEventMessagingType } from '@volontariapp/messaging';
import type { Redis } from 'ioredis';
import { createMock } from '@volontariapp/testing';
import {
  createMockUserService,
  createMockOptions,
} from '../mocks/user-deletion-success.mock.js';
import { UserDeletionSuccessFactory } from '../factories/user-deletion-success.factory.js';
import { UserId, type UserService } from '@volontariapp/domain-user';

describe('UserDeletionSuccessPostProcessor', () => {
  let postProcessor: UserDeletionSuccessPostProcessor;
  let userService: UserService;
  let mockRedisDriver: jest.Mocked<Redis>;

  beforeEach(() => {
    userService = createMockUserService();
    mockRedisDriver = createMock<Redis>();
    const options = createMockOptions();

    postProcessor = new UserDeletionSuccessPostProcessor(
      userService,
      mockRedisDriver,
      options,
    );

    const mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    Object.defineProperty(postProcessor, 'logger', { value: mockLogger });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('shouldProcess', () => {
    it('should return true for USER_DELETION_SUCCESSFULL event type', () => {
      const result = postProcessor['shouldProcess'](
        UserEventMessagingType.USER_DELETION_SUCCESSFULL,
      );
      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess'](
        UserEventMessagingType.USER_DELETED,
      );
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should successfully finalize deletion when payload has valid userId', async () => {
      const targetUserId = '11111111-1111-4111-8111-111111111111';
      const eventItem = UserDeletionSuccessFactory.buildBatchEventItem({
        userId: targetUserId,
      });

      const finalizeDeletionSpy = jest
        .spyOn(userService, 'finalizeDeletion')
        .mockResolvedValue();

      await postProcessor['processEvents']([eventItem]);

      expect(finalizeDeletionSpy).toHaveBeenCalledTimes(1);
      expect(finalizeDeletionSpy).toHaveBeenCalledWith(
        new UserId(targetUserId),
      );
    });

    it('should skip processing if userId is missing from payload', async () => {
      const eventItem = UserDeletionSuccessFactory.buildBatchEventItem({
        userId: undefined,
      });

      const finalizeDeletionSpy = jest
        .spyOn(userService, 'finalizeDeletion')
        .mockResolvedValue();

      await postProcessor['processEvents']([eventItem]);

      expect(finalizeDeletionSpy).not.toHaveBeenCalled();
    });

    it('should rethrow error when userService.finalizeDeletion fails', async () => {
      const targetUserId = '22222222-2222-4222-8222-222222222222';
      const eventItem = UserDeletionSuccessFactory.buildBatchEventItem({
        userId: targetUserId,
      });

      const error = new Error('Database connection failed');
      jest.spyOn(userService, 'finalizeDeletion').mockRejectedValue(error);

      await expect(postProcessor['processEvents']([eventItem])).rejects.toThrow(
        'Database connection failed',
      );
    });
  });
});
