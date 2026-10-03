import { spec, type TestEvent } from 'node:test/reporters';
import { Readable } from 'node:stream';
import { createLogger, type Logger } from '../src/modules/infrastructure/logger.ts';

export function logTestEvent(event: TestEvent, log: Logger) {
  switch (event.type) {
    case 'test:dequeue':
      log.info('test.started', {
        name: event.data.name,
        file: event.data.file,
        line: event.data.line,
      });
      break;
    case 'test:pass':
    case 'test:fail': {
      const data = event.data;
      const fields = {
        name: data.name,
        file: data.file,
        line: data.line,
        durationMs: data.details.duration_ms,
        skipped: data.skip,
        todo: data.todo,
      };
      if (event.type === 'test:fail' && !data.todo)
        log.error('test.failed', { ...fields, error: event.data.details.error });
      else log.info(data.skip ? 'test.skipped' : data.todo ? 'test.todo' : 'test.passed', fields);
      break;
    }
    case 'test:summary':
      if (!event.data.file) {
        const fields = {
          durationMs: event.data.duration_ms,
          counts: event.data.counts,
          success: event.data.success,
        };
        if (event.data.success) log.info('test.finished', fields);
        else log.error('test.finished', fields);
      }
      break;
  }
}

// Keep Node's readable output and failure details, alongside structured events.
export default async function* logReporter(source: AsyncIterable<TestEvent>) {
  const lines: string[] = [];
  const log = createLogger('test.node', { sink: (line) => lines.push(line + '\n') });
  async function* events() {
    for await (const event of source) {
      logTestEvent(event, log);
      yield event;
    }
  }
  for await (const chunk of Readable.from(events()).pipe(spec())) {
    yield* lines.splice(0);
    yield chunk;
  }
  yield* lines;
}
