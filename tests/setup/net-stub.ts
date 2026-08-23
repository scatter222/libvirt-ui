import { EventEmitter } from 'node:events';

import { vi } from 'vitest';

import { net } from '../mocks/electron';

export interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface FakeResponse {
  status: number;
  body?: string;
}

/**
 * Stubs electron.net.request with a fake that captures what the code under
 * test sends and answers via `handler`. Return a FakeResponse to answer the
 * request, or an Error to fail it at the socket level. Returns the list of
 * captured requests for assertions.
 */
export function stubNetRequest (handler: (req: CapturedRequest) => FakeResponse | Error): CapturedRequest[] {
  const captured: CapturedRequest[] = [];

  vi.mocked(net.request).mockImplementation((options: unknown) => {
    const { method, url } = options as { method: string; url: string };
    const req = { method, url, headers: {}, body: '' } as CapturedRequest;
    captured.push(req);

    const request = new EventEmitter() as EventEmitter & {
      setHeader: (k: string, v: string) => void;
      write: (chunk: string) => void;
      end: () => void;
    };
    request.setHeader = (k, v) => { req.headers[k] = v; };
    request.write = (chunk) => { req.body += chunk; };
    request.end = () => {
      queueMicrotask(() => {
        const result = handler(req);
        if (result instanceof Error) {
          request.emit('error', result);
          return;
        }
        const response = new EventEmitter() as EventEmitter & { statusCode: number };
        response.statusCode = result.status;
        request.emit('response', response);
        queueMicrotask(() => {
          if (result.body) response.emit('data', Buffer.from(result.body));
          response.emit('end');
        });
      });
    };
    return request;
  });

  return captured;
}
