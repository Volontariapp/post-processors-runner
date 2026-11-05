import { jest } from '@jest/globals';
import type { DataSource } from 'typeorm';
import { createMock } from '@volontariapp/testing';

/** The repositories are built on top of getRepository: their methods are spied on per test. */
export function createMockGeocodingDb(): jest.Mocked<DataSource> {
  const db = createMock<DataSource>();
  db.getRepository.mockReturnValue(
    createMock<ReturnType<DataSource['getRepository']>>(),
  );
  return db;
}

export const mockLogger = (): Record<string, jest.Mock> => ({
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});
