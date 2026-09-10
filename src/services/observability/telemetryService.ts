import { sanitizeContext } from './errorReportingService';

export interface TelemetrySink {
  record(event: string, payload?: Record<string, unknown>): void;
}

export class ConsoleTelemetrySink implements TelemetrySink {
  record(event: string, payload?: Record<string, unknown>): void {
    const cleanPayload = sanitizeContext(payload);
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      payload: cleanPayload,
    };
    console.info('[Telemetry]', JSON.stringify(entry));
  }
}

export class TelemetryService {
  private sinks: TelemetrySink[] = [];

  constructor(defaultSink?: TelemetrySink) {
    if (defaultSink) {
      this.sinks.push(defaultSink);
    } else {
      this.sinks.push(new ConsoleTelemetrySink());
    }
  }

  record(event: string, payload?: Record<string, unknown>): void {
    const cleanPayload = sanitizeContext(payload);
    for (const sink of this.sinks) {
      try {
        sink.record(event, cleanPayload);
      } catch (sinkErr) {
        console.error('[Telemetry] Sink execution failed:', sinkErr);
      }
    }
  }

  addSink(sink: TelemetrySink): void {
    this.sinks.push(sink);
  }

  clearSinks(): void {
    this.sinks = [];
  }
}

export const telemetry = new TelemetryService();
