import { ILoggerComponent } from "@well-known-components/interfaces"
import { closeSync, openSync } from "fs"
import * as fs from "fs/promises"
import { dirname } from "path"
import { AppComponents } from "../types"
import { execCommand } from "./run-command"

export async function runSubstream(
  logger: ILoggerComponent.ILogger,
  // components: Pick<AppComponents, "metrics">,
  options: {
    logFile: string
    outDirectory: string
    // entityId: string
    // contentServerUrl: string
    // unityPath: string
    // projectPath: string
    timeout?: number
  }
) {
  // touch logfile and create folders
  await fs.mkdir(dirname(options.logFile), { recursive: true })
  await fs.mkdir(options.outDirectory, { recursive: true })
  closeSync(openSync(options.logFile, "w"))

  // normalize content server URL
  // let contentServerUrl = options.contentServerUrl
  // if (!contentServerUrl.endsWith("/")) contentServerUrl += "/"
  // contentServerUrl += "contents/"

  // substreams-sink-postgres run \    "psql://juanma:insecure-change-me-in-prod@localhost:5432/substreams_example?sslmode=disable" \    "polygon.streamingfast.io:443" \
  //   "substreams.yaml" \
  //   db_out --development-mode

  const childArg0 = `substreams-sink-postgres run`
  const childArguments: string[] = [
    "psql://juanma:insecure-change-me-in-prod@localhost:5432/substreams_example?sslmode=disable",
    "substreams.yaml",
    "db_out",
    "--development-mode",
  ]

  const { exitPromise, child } = execCommand(logger, childArg0, childArguments, process.env as any, "./")
  // const { exitPromise, child } = execCommand(logger, childArg0, childArguments, process.env as any, options.projectPath)

  if (options.timeout) {
    setTimeout(() => {
      if (exitPromise.isPending) {
        try {
          if (!child.killed) {
            logger.warn("Process did not finish", {
              pid: child.pid?.toString() || "?",
              command: childArg0,
              args: childArguments.join(" "),
            } as any)
            // components.metrics.increment("ab_converter_timeout")
            exitPromise.reject(new Error("Process did not finish"))
            if (!child.kill("SIGKILL")) {
              logger.error("Error trying to kill child process", {
                pid: child.pid?.toString() || "?",
                command: childArg0,
                args: childArguments.join(" "),
              } as any)
            }
          }
        } catch (err: any) {
          logger.error(err)
        }
      }
    }, options.timeout)
  }

  return await exitPromise
}
