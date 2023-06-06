import * as fs from "fs/promises"
import fetch from "node-fetch"
import { spawn } from "child_process"
import { dirname } from "path"
import { closeSync, openSync, constants, chmod } from "fs"
import { IConfigComponent, ILoggerComponent } from "@well-known-components/interfaces"
import { execCommand } from "./run-command"
import { AppComponents } from "../types"

const BINARY_OS = "substreams-sink-postgres_darwin_arm64" // TODO: In the CI it will be the linux one
const SUBSTREAMS_RELEASE_URL = "https://api.github.com/repos/streamingfast/substreams-sink-postgres/releases/latest"

async function getLatestReleaseUrl() {
  const response = await fetch(SUBSTREAMS_RELEASE_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch latest release information: ${response.statusText}`)
  }

  const releaseData = await response.json()
  const downloadURLs = releaseData.assets.map((asset: any) => asset.browser_download_url)
  const downloadURL = downloadURLs.find((url: string) => url.includes(BINARY_OS))

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

async function downloadBinary() {
  const binaryUrl = await getLatestReleaseUrl()
  const binaryPath = "./substreams-sink-postgres"
  const binaryResponse = await fetch(binaryUrl)

  if (!binaryResponse.ok) {
    throw new Error(`Failed to download binary: ${binaryResponse.statusText}`)
  }

  const binaryBuffer = await binaryResponse.buffer()
  await fs.writeFile(`${binaryPath}.tar.gz`, binaryBuffer) // downloads the tar.gz file
  console.log("Binary downloaded successfully!")
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

async function getConfigVars(config: IConfigComponent) {
  try {
    const DB_CONNECTION_STRING = await config.requireString("DB_CONNECTION_STRING")
    const NETWORK = (await config.getString("NETWORK")) || "polygon" // TODO: get from env
    const FIREHOSE_SERVER_URI = `${NETWORK}.streamingfast.io:443` // TODO: get from env
    const RELEASE_URI =
      (await config.getString("SPKG_PATH")) ||
      "https://github.com/decentraland/decentraland-substreams/releases/download/0.0.1/decentraland-substreams-v0.1.0.spkg"

    return {
      DB_CONNECTION_STRING,
      FIREHOSE_SERVER_URI,
      RELEASE_URI,
    }
  } catch (error) {
    throw new Error("Failed to get config vars: DB_CONNECTION_STRING missing")
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

  try {
    await fs.access(binaryPath, constants.F_OK) // check if binary exists
    console.log("substreams-sink-postgres binary already exists!")
  } catch (error: any) {
    // if binary doesn't exist, download it
    if (error.code === "ENOENT") {
      console.log("Downloading substreams-sink-postgres binary...")
      await downloadBinary()
      await extractTarGz(binaryPath) // extract tar.gz to binary
    } else {
      console.error("Error accessing binary:", error)
      return
    }
  } finally {
    // set permissions and auth key
    await setExecutablePermission(binaryPath) // set executable permission
    await setAuthenticationKey(config) // set authentication key
  }

  const { DB_CONNECTION_STRING, FIREHOSE_SERVER_URI, RELEASE_URI } = await getConfigVars(config)

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
