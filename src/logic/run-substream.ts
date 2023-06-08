import * as fs from "fs/promises"
import fetch from "node-fetch"
import { spawn } from "child_process"
import { dirname } from "path"
import { closeSync, openSync, constants, chmod } from "fs"
import { IConfigComponent, ILoggerComponent } from "@well-known-components/interfaces"
import { AppComponents } from "../types"
import { execCommand } from "./run-command"

const DEFAULT_BINARY_OS = "substreams-sink-postgres_darwin_arm64" // for local development on M1 Macs, the CI will set its OS accordingly
const DEFAULT_NETWORK = "polygon"
const DEFAULT_DCL_SUBSTREAMS_RELEASE =
  "https://github.com/decentraland/decentraland-substreams/releases/download/0.0.1/decentraland-substreams-v0.1.0.spkg"
const SUBSTREAMS_RELEASE_URL = "https://api.github.com/repos/streamingfast/substreams-sink-postgres/releases/latest"

async function getLatestReleaseUrl(binaryOS: string) {
  const response = await fetch(SUBSTREAMS_RELEASE_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch latest release information: ${response.statusText}`)
  }

  const releaseData = await response.json()
  const downloadURLs = releaseData.assets.map((asset: any) => asset.browser_download_url)
  const downloadURL = downloadURLs.find((url: string) => url.includes(binaryOS))

  return downloadURL
}

async function setExecutablePermission(path: string) {
  return new Promise<void>((resolve, reject) => {
    chmod(path, "755", (error) => {
      if (error) {
        console.log("error in chmod: ", error)
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

async function downloadBinary(binaryOS: string) {
  const binaryUrl = await getLatestReleaseUrl(binaryOS)
  const binaryPath = "./substreams-sink-postgres"
  const binaryResponse = await fetch(binaryUrl)

  if (!binaryResponse.ok) {
    throw new Error(`Failed to download binary: ${binaryResponse.statusText}`)
  }

  const binaryBuffer = await binaryResponse.buffer()
  await fs.writeFile(`${binaryPath}.tar.gz`, binaryBuffer) // downloads the tar.gz file
}

async function extractTarGz(filePath: string) {
  const tarArgs = ["-xf", `${filePath}.tar.gz`]

  return new Promise<void>((resolve, reject) => {
    const tar = spawn("tar", tarArgs)

    let errorOutput = ""

    tar.on("error", (error) => {
      reject(new Error(`Failed to execute tar: ${error.message}`))
    })

    tar.stderr.on("data", (data) => {
      errorOutput += data.toString()
    })

    tar.on("exit", (code) => {
      if (code === 0) {
        console.log("Extracted successfully!")
        resolve()
      } else {
        reject(new Error(`tar exited with code ${code}. Error output: ${errorOutput}`))
      }
    })
  })
}

async function setAuthenticationKey(config: IConfigComponent) {
  try {
    const SUBSTREAMS_API_TOKEN = await config.requireString("SUBSTREAMS_API_TOKEN")
    process.env.SUBSTREAMS_API_TOKEN = SUBSTREAMS_API_TOKEN
  } catch (error) {
    throw new Error("Failed to set authentication key: SUBSTREAMS_API_TOKEN is not set")
  }
}

async function buildDbConnectionString(config: IConfigComponent) {
  const dbUser = await config.requireString("PSQL_USER")
  const dbPassword = await config.requireString("PSQL_PASSWORD")
  const dbHost = await config.requireString("PSQL_HOST")
  const dbPort = await config.requireString("PSQL_PORT")
  const dbDatabaseName = await config.requireString("PSQL_DATABASE")
  return `psql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbDatabaseName}?sslmode=disable`
}

function getEndpointForNetwork(network: string) {
  switch (network) {
    case "goerli":
      return "goerli.eth"
    case "mainnet":
      return "mainnet.eth"
    default:
      return network // "polygon" stays the same
  }
}

async function getConfigVars(config: IConfigComponent) {
  const DB_CONNECTION_STRING = await buildDbConnectionString(config)
  const network = (await config.getString("NETWORK")) || DEFAULT_NETWORK
  const BINARY_OS = (await config.getString("BINARY_OS")) || DEFAULT_BINARY_OS
  const RELEASE_URI = (await config.getString("SPKG_PATH")) || DEFAULT_DCL_SUBSTREAMS_RELEASE

  return {
    DB_CONNECTION_STRING,
    FIREHOSE_SERVER_URI: `${getEndpointForNetwork(network)}.streamingfast.io:443`,
    RELEASE_URI,
    BINARY_OS,
  }
}

export async function runSubstream(
  components: Pick<AppComponents, "config">,
  logger: ILoggerComponent.ILogger,
  options: {
    logFile: string
    outDirectory: string
    timeout?: number
  }
) {
  const { config } = components
  // touch logfile and create folders
  await fs.mkdir(dirname(options.logFile), { recursive: true })
  await fs.mkdir(options.outDirectory, { recursive: true })
  closeSync(openSync(options.logFile, "w"))

  const binaryPath = "./substreams-sink-postgres"

  const { DB_CONNECTION_STRING, FIREHOSE_SERVER_URI, RELEASE_URI, BINARY_OS } = await getConfigVars(config)

  try {
    await fs.access(binaryPath, constants.F_OK) // check if `substreams-sink-postgres` binary exists
    logger.log("substreams-sink-postgres binary already exists!")
  } catch (error: any) {
    // if binary doesn't exist, download it
    if (error.code === "ENOENT") {
      logger.log("Downloading substreams-sink-postgres binary...")
      await downloadBinary(BINARY_OS)
      logger.log("Binary downloaded successfully!")
      logger.log("Extracting binary tar.gz!")
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

  const substreamsCommand = `./substreams-sink-postgres`
  const substreamsCommandArguments: string[] = [
    "run",
    DB_CONNECTION_STRING,
    FIREHOSE_SERVER_URI,
    RELEASE_URI,
    "db_out",
    "--development-mode",
  ]

  const { exitPromise, child } = execCommand(
    logger,
    substreamsCommand,
    substreamsCommandArguments,
    process.env as any,
    "./"
  )

  if (options.timeout) {
    setTimeout(() => {
      if (exitPromise.isPending) {
        try {
          if (!child.killed) {
            logger.warn("Process did not finish", {
              pid: child.pid?.toString() || "?",
              command: substreamsCommand,
              args: substreamsCommandArguments.join(" "),
            } as any)
            exitPromise.reject(new Error("Process did not finish"))
            if (!child.kill("SIGKILL")) {
              logger.error("Error trying to kill child process", {
                pid: child.pid?.toString() || "?",
                command: substreamsCommand,
                args: substreamsCommandArguments.join(" "),
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
