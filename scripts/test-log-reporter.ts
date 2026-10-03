import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter';
import { createLogger } from '../apps/web/src/modules/infrastructure/logger.ts';

const log = createLogger('test.playwright');

export default class TestLogReporter implements Reporter {
  printsToStdio() {
    return true;
  }
  onBegin(_config: FullConfig, suite: Suite) {
    log.info('test.run_started', { total: suite.allTests().length });
  }
  onTestBegin(test: TestCase, result: TestResult) {
    log.info('test.started', {
      testId: test.id,
      name: test.titlePath().join(' > '),
      file: test.location.file,
      retry: result.retry,
    });
  }
  onTestEnd(test: TestCase, result: TestResult) {
    const fields = {
      testId: test.id,
      name: test.titlePath().join(' > '),
      file: test.location.file,
      retry: result.retry,
      status: result.status,
      durationMs: result.duration,
    };
    if (result.status !== 'skipped' && result.status !== test.expectedStatus)
      log.error('test.failed', { ...fields, errors: result.errors });
    else log.info(result.status === 'skipped' ? 'test.skipped' : 'test.passed', fields);
  }
  onError(error: TestError) {
    log.error('test.runner_failed', { error });
  }
  onEnd(result: FullResult) {
    const fields = { status: result.status, durationMs: result.duration };
    if (result.status === 'passed') log.info('test.finished', fields);
    else log.error('test.finished', fields);
  }
}
