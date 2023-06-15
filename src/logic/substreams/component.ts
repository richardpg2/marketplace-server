import fetch from "node-fetch"
import * as fs from "fs/promises"
import { closeSync, openSync, constants } from "fs"
import { dirname } from "path"
import { execCommand } from "../run-command"
import { AppComponents } from "../../types"
import { ISubstreamsComponent } from "./types"
import {
  DEFAULT_BINARY_OS,
  downloadBinary,
  extractTarGz,
  getConfigVars,
  setAuthenticationKey,
  setExecutablePermission,
} from "./utils"
import { createNewSchema } from "./queries"

const SINK_CLI_COMMAND = "./substreams-sink-postgres"

export async function createSubstreamsComponent(
  components: Pick<AppComponents, "config" | "logs" | "database">
): Promise<ISubstreamsComponent> {
  const { config, logs, database } = components
  const logger = logs.getLogger("log")

  // init creates the new schema and folders for logger
  async function init(options: { logFile: string; outDirectory: string }) {
    // setup logger
    await fs.mkdir(dirname(options.logFile), { recursive: true })
    await fs.mkdir(options.outDirectory, { recursive: true })
    closeSync(openSync(options.logFile, "w"))

    // creates new schema to work on
    const network = await config.requireString("NETWORK")
    return await createNewSchema(database, network)
  }

  async function download() {
    const binaryPath = "./substreams-sink-postgres"
    const BINARY_OS = (await config.getString("BINARY_OS")) || DEFAULT_BINARY_OS

    try {
      await fs.access(binaryPath, constants.F_OK) // check if `substreams-sink-postgres` binary exists
      logger.log("substreams-sink-postgres binary already exists!")
    } catch (error: any) {
      // if binary doesn't exist, download it
      if (error.code === "ENOENT") {
        logger.log("Downloading substreams-sink-postgres binary...")
        await downloadBinary(BINARY_OS)
        logger.log("Binary downloaded successfully!")
        logger.log("Extracting binary tar.gz...")
        await extractTarGz(binaryPath) // extract tar.gz to binary
        logger.log("Binary extracted successfully!")
      } else {
        logger.error("Error accessing binary:", error)
        return
      }
    } finally {
      // set permissions and auth key
      await setExecutablePermission(binaryPath) // set executable permission
      await setAuthenticationKey(config) // set authentication key
    }
  }

  async function setup(schema: string) {
    const { DB_CONNECTION_STRING } = await getConfigVars(config, schema)
    const substreamsCommandArguments: string[] = ["setup", DB_CONNECTION_STRING, "schema.sql"]

    const { exitPromise } = execCommand(logger, SINK_CLI_COMMAND, substreamsCommandArguments, process.env as any, "./")
    return exitPromise
  }

  async function run(schema: string) {
    const { DB_CONNECTION_STRING, FIREHOSE_SERVER_URI, RELEASE_URI } = await getConfigVars(config, schema)
    const substreamsCommandArguments: string[] = [
      "run",
      DB_CONNECTION_STRING,
      FIREHOSE_SERVER_URI,
      RELEASE_URI,
      "db_out",
    ]
    const { exitPromise } = execCommand(logger, SINK_CLI_COMMAND, substreamsCommandArguments, process.env as any, "./")
    return exitPromise
  }

  async function ready() {
    const THRESHOLD = 120 // number of seconds away from head block time
    const response = await fetch("http://0.0.0.0:9102") // hit prometheus metrics endpoint
    const metrics = await response.text()
    const regex = /head_block_time_drift{app="substreams_sink"} ([\d.e+]+)/
    const match = metrics.match(regex)

    if (match && match[1]) {
      const headBlockTimeDrift = Number(match[1])
      return { ready: headBlockTimeDrift < THRESHOLD, delay: headBlockTimeDrift }
    } else {
      console.log("head_block_time_drift not found in metrics.")
    }
    return { ready: false, delay: 0 }
  }

  return {
    init,
    download,
    setup,
    run,
    ready,
  }
}
