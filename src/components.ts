import path from "path"
import { createDotEnvConfigComponent } from "@well-known-components/env-config-provider"
import { createServerComponent, createStatusCheckComponent } from "@well-known-components/http-server"
import { createLogComponent } from "@well-known-components/logger"
import { createPgComponent } from "@well-known-components/pg-component"
import { createFetchComponent } from "./adapters/fetch"
import { createMetricsComponent, instrumentHttpServerWithMetrics } from "@well-known-components/metrics"
import { AppComponents, GlobalContext } from "./types"
import { metricDeclarations } from "./metrics"
import { createItemsComponent } from "./logic/items/component"
import { createCollectionsComponent } from "./logic/collections/component"
import { createCatalogComponent } from "./logic/catalog/component"
import { createJobLifecycleManagerComponent } from "./job-lifecycle-manager"
import { createSubstreamsComponent } from "./logic/substreams/component"
import { ISubstreamsComponent } from "./logic/substreams/types"

// Sets a maximun amount of times the job can be restarted to quickly to avoid infinite loops
const MAX_JOB_RESTARTS = 5
const RESTART_DELAY = 60000 // 60 seconds

function createCliJob(substreams: ISubstreamsComponent) {
  let runs = 0
  let startTime: number | null = null
  let stopped = false
  return {
    async start() {
      const schema = await substreams.init({
        logFile: "logs.txt",
        outDirectory: "./",
      })

      await substreams.download()
      await substreams.setup(schema)
      while (!stopped && runs <= MAX_JOB_RESTARTS) {
        runs++
        startTime = Date.now() // Record the start time of the job

        await substreams.run(schema)

        const elapsedTime = Date.now() - startTime
        if (elapsedTime >= RESTART_DELAY) {
          runs = 0 // Reset the counter if job runs for at least 60 seconds
        }
      }
    },
    async stop() {
      stopped = true
    },
  }
}

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: [".env.default", ".env"] })
  const metrics = await createMetricsComponent(metricDeclarations, { config })
  const logs = await createLogComponent({ metrics })
  const server = await createServerComponent<GlobalContext>({ config, logs }, {})
  const statusChecks = await createStatusCheckComponent({ server, config })
  const fetch = await createFetchComponent()

  const dbUser = await config.requireString("PG_COMPONENT_PSQL_USER")
  const dbDatabaseName = await config.requireString("PG_COMPONENT_PSQL_DATABASE")
  const dbPort = await config.requireString("PG_COMPONENT_PSQL_PORT")
  const dbHost = await config.requireString("PG_COMPONENT_PSQL_HOST")
  const dbPassword = await config.requireString("PG_COMPONENT_PSQL_PASSWORD")
  const databaseUrl = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbDatabaseName}`
  const database = await createPgComponent(
    { config, logs, metrics },
    {
      migration: {
        databaseUrl,
        dir: path.resolve(__dirname, "migrations"),
        migrationsTable: "pgmigrations",
        ignorePattern: ".*\\.map",
        direction: "up",
      },
    }
  )
  await database.start() // workaround so the migrations are executed before starting the other components
  const items = await createItemsComponent({ database })
  const collections = await createCollectionsComponent({ database })
  const catalog = await createCatalogComponent({ database })
  const substreams = await createSubstreamsComponent({ config, logs, database })
  const synchronizationJobManager = await createJobLifecycleManagerComponent(
    { logs },
    {
      jobManagerName: "SynchronizationJobManager",
      createJob() {
        return createCliJob(substreams)
      },
    }
  )

  await instrumentHttpServerWithMetrics({ metrics, server, config })

  return {
    config,
    logs,
    server,
    statusChecks,
    fetch,
    metrics,
    database,
    items,
    collections,
    catalog,
    synchronizationJobManager,
    substreams,
  }
}
