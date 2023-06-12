import fetch from "node-fetch"
import * as fs from "fs/promises"
import { chmod } from "fs"
import { spawn } from "child_process"
import { IConfigComponent } from "@well-known-components/interfaces"

export const DEFAULT_BINARY_OS = "substreams-sink-postgres_darwin_arm64" // for local development on M1 Macs, the CI will set its OS accordingly
const DEFAULT_NETWORK = "polygon"
const DEFAULT_DCL_SUBSTREAMS_RELEASE =
  "https://github.com/decentraland/decentraland-substreams/releases/download/0.0.3/decentraland-substreams-v0.0.3.spkg"
const SUBSTREAMS_RELEASE_URL = "https://api.github.com/repos/streamingfast/substreams-sink-postgres/releases/latest"

async function buildDbConnectionString(config: IConfigComponent, schema: string) {
  const dbUser = await config.requireString("PG_COMPONENT_PSQL_USER")
  const dbPassword = await config.requireString("PG_COMPONENT_PSQL_PASSWORD")
  const dbHost = await config.requireString("PG_COMPONENT_PSQL_HOST")
  const dbPort = await config.requireString("PG_COMPONENT_PSQL_PORT")
  const dbDatabaseName = await config.requireString("PG_COMPONENT_PSQL_DATABASE")
  return `psql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbDatabaseName}?sslmode=disable&schema=${schema}`
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

export async function getConfigVars(config: IConfigComponent, schema: string) {
  const DB_CONNECTION_STRING = await buildDbConnectionString(config, schema)
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

export async function extractTarGz(filePath: string) {
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

export async function downloadBinary(binaryOS: string) {
  const binaryUrl = await getLatestReleaseUrl(binaryOS)
  const binaryPath = "./substreams-sink-postgres"
  const binaryResponse = await fetch(binaryUrl)

  if (!binaryResponse.ok) {
    throw new Error(`Failed to download binary: ${binaryResponse.statusText}`)
  }

  const binaryBuffer = await binaryResponse.buffer()
  await fs.writeFile(`${binaryPath}.tar.gz`, binaryBuffer) // downloads the tar.gz file
}

export async function setExecutablePermission(path: string) {
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

export async function setAuthenticationKey(config: IConfigComponent) {
  try {
    const SUBSTREAMS_API_TOKEN = await config.requireString("SUBSTREAMS_API_TOKEN")
    process.env.SUBSTREAMS_API_TOKEN = SUBSTREAMS_API_TOKEN
  } catch (error) {
    throw new Error("Failed to set authentication key SUBSTREAMS_API_TOKEN is not set")
  }
}
