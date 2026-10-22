import {
  StorageEventMessagingType,
  StorageEntityType,
  StorageFileRejectionReason,
  StorageAttachmentRejectionReason,
  type IFileScannedPayload,
  type IFileRejectedPayload,
  type IAttachmentRejectedPayload,
} from '@volontariapp/messaging';
import type { BatchEventItem } from '@volontariapp/post-processors';
import { SOURCE_TRACEPARENT } from './trace.factory.js';

export class StorageCoverEventsFactory {
  static buildFileScannedItem(
    payloadOverrides: Partial<IFileScannedPayload> = {},
    messageId = '1700000000000-1',
  ): BatchEventItem<StorageEventMessagingType.FILE_SCANNED> {
    const payload: IFileScannedPayload = {
      fileId: 'file-123',
      entityType: StorageEntityType.EVENT_COVER,
      entityId: 'event-456',
      ownerId: 'user-789',
      ...payloadOverrides,
    };

    return {
      messageId,
      event: {
        id: 'evt-scan-1',
        type: StorageEventMessagingType.FILE_SCANNED,
        emitter: 'ms-storage',
        emitterId: payload.ownerId,
        correlationId: 'corr-1',
        traceId: 'trace-1',
        traceparent: SOURCE_TRACEPARENT,
        version: 1,
        createdAt: new Date().toISOString(),
        payload: {
          after: payload,
        },
      },
    };
  }

  static buildFileRejectedItem(
    payloadOverrides: Partial<IFileRejectedPayload> = {},
    messageId = '1700000000000-2',
  ): BatchEventItem<StorageEventMessagingType.FILE_REJECTED> {
    const payload: IFileRejectedPayload = {
      fileId: 'file-123',
      entityType: StorageEntityType.EVENT_COVER,
      entityId: 'event-456',
      ownerId: 'user-789',
      reason: StorageFileRejectionReason.MALWARE,
      ...payloadOverrides,
    };

    return {
      messageId,
      event: {
        id: 'evt-rej-1',
        type: StorageEventMessagingType.FILE_REJECTED,
        emitter: 'ms-storage',
        emitterId: payload.ownerId,
        correlationId: 'corr-2',
        traceId: 'trace-2',
        traceparent: SOURCE_TRACEPARENT,
        version: 1,
        createdAt: new Date().toISOString(),
        payload: {
          after: payload,
        },
      },
    };
  }

  static buildAttachmentRejectedItem(
    payloadOverrides: Partial<IAttachmentRejectedPayload> = {},
    messageId = '1700000000000-3',
  ): BatchEventItem<StorageEventMessagingType.ATTACHMENT_REJECTED> {
    const payload: IAttachmentRejectedPayload = {
      fileId: 'file-123',
      entityType: StorageEntityType.EVENT_COVER,
      entityId: 'event-456',
      reason: StorageAttachmentRejectionReason.NOT_FOUND,
      ...payloadOverrides,
    };

    return {
      messageId,
      event: {
        id: 'evt-att-rej-1',
        type: StorageEventMessagingType.ATTACHMENT_REJECTED,
        emitter: 'ms-storage',
        emitterId: 'emitter-3',
        correlationId: 'corr-3',
        traceId: 'trace-3',
        traceparent: SOURCE_TRACEPARENT,
        version: 1,
        createdAt: new Date().toISOString(),
        payload: {
          after: payload,
        },
      },
    };
  }
}
