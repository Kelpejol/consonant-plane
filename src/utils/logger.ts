import pino from 'pino';
import { trace, context as otelContext, Span } from '@opentelemetry/api';
import { contextManager } from './context.js';
import { redactor } from './redactor.js';

const IS_PROD = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug');

interface LogContext {
  [key: string]: any;
}

class TerraLogger {
  private logger: pino.Logger;
  private redactionEnabled: boolean;

  constructor() {
    this.redactionEnabled = process.env.DISABLE_LOG_REDACTION !== 'true';

    this.logger = pino({
      level: LOG_LEVEL,
      
      formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) => ({
          pid: bindings.pid,
          hostname: bindings.hostname,
        }),
        log: (obj) => this.enrichLog(obj),
      },

      serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          headers: this.redactionEnabled 
            ? redactor.redact(req.headers) 
            : req.headers,
          remoteAddress: req.ip,
          remotePort: req.socket?.remotePort,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
          headers: this.redactionEnabled 
            ? redactor.redact(res.getHeaders()) 
            : res.getHeaders(),
        }),
      },

      timestamp: pino.stdTimeFunctions.isoTime,

      transport: !IS_PROD ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          singleLine: false,
          levelFirst: true,
          messageFormat: '{msg} {context}',
        },
      } : undefined,

      base: {
        service: process.env.SERVICE_NAME || 'terra-backend',
        environment: process.env.NODE_ENV || 'development',
        version: process.env.SERVICE_VERSION || '1.0.0',
      },
    });
  }

  private enrichLog(obj: any): any {
    const enriched = { ...obj };

    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      enriched.trace_id = spanContext.traceId;
      enriched.span_id = spanContext.spanId;
      enriched.trace_flags = spanContext.traceFlags;
    }

    const executionContext = contextManager.getAllContext();
    if (executionContext) {
      enriched.request_id = executionContext.requestId;
      enriched.correlation_id = executionContext.correlationId;
      enriched.causation_id = executionContext.causationId;
      
      if (executionContext.clusterId) {
        enriched.cluster_id = executionContext.clusterId;
      }
      if (executionContext.agentRunId) {
        enriched.agent_run_id = executionContext.agentRunId;
      }
      if (executionContext.agentName) {
        enriched.agent_name = executionContext.agentName;
      }
      if (executionContext.userId) {
        enriched.user_id = executionContext.userId;
      }
      if (executionContext.metadata) {
        enriched.metadata = executionContext.metadata;
      }
    }

    if (this.redactionEnabled) {
      return redactor.redact(enriched, 0, IS_PROD ? 5 : 10);
    }

    return enriched;
  }

  private prepareContext(context?: LogContext): any {
    if (!context) return {};
    return this.redactionEnabled ? redactor.redact(context) : context;
  }

  trace(message: string, context?: LogContext): void {
    this.logger.trace(this.prepareContext(context), message);
    this.recordSpanEvent('trace', message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(this.prepareContext(context), message);
    this.recordSpanEvent('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(this.prepareContext(context), message);
    this.recordSpanEvent('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(this.prepareContext(context), message);
    this.recordSpanEvent('warn', message, context);
  }

  error(message: string, error?: Error | LogContext, context?: LogContext): void {
    if (error instanceof Error) {
      this.logger.error({ err: error, ...this.prepareContext(context) }, message);
      this.recordSpanEvent('error', message, { error: error.message, ...context });
      this.recordSpanError(error);
    } else {
      this.logger.error(this.prepareContext(error), message);
      this.recordSpanEvent('error', message, error);
    }
  }

  fatal(message: string, error?: Error | LogContext, context?: LogContext): void {
    if (error instanceof Error) {
      this.logger.fatal({ err: error, ...this.prepareContext(context) }, message);
      this.recordSpanEvent('fatal', message, { error: error.message, ...context });
      this.recordSpanError(error);
    } else {
      this.logger.fatal(this.prepareContext(error), message);
      this.recordSpanEvent('fatal', message, error);
    }
  }

  child(bindings: Record<string, any>): TerraLogger {
    const childLogger = new TerraLogger();
    childLogger.logger = this.logger.child(this.prepareContext(bindings));
    childLogger.redactionEnabled = this.redactionEnabled;
    return childLogger;
  }

  private recordSpanEvent(level: string, message: string, context?: LogContext): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.addEvent(`log.${level}`, {
        'log.message': message,
        'log.level': level,
        ...context,
      });
    }
  }

  private recordSpanError(error: Error): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.recordException(error);
      activeSpan.setStatus({ code: 2, message: error.message });
    }
  }

  flush(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.flush(() => resolve());
    });
  }
}

export const logger = new TerraLogger();

export function createChildLogger(bindings: Record<string, any>) {
  return logger.child(bindings);
}