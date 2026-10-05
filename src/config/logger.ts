import { pino, type Logger } from "pino";
import { env, isProd } from "./env.js";

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }),
});

/** Create a namespaced child logger, e.g. loggerFor("node:rag"). */
export const loggerFor = (name: string): Logger => logger.child({ scope: name });
