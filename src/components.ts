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
import { runSubstream } from "./logic/run-substream"
import { ILoggerComponent } from "@well-known-components/interfaces"

// Sets a maximun amount of times the job can be restarted to quickly to avoid infinite loops
const MAX_JOB_RESTARTS = 5
const RESTART_DELAY = 60000 // 60 seconds

function createCliJob(config: Pick<AppComponents, "config">, logger: ILoggerComponent.ILogger) {
  let runs = 0
  let startTime: number | null = null
  let stopped = false
  return {
    async start() {
      while (!stopped && runs <= MAX_JOB_RESTARTS) {
        runs++
        startTime = Date.now() // Record the start time of the job

        await runSubstream(config, logger, { logFile: "logs.txt", outDirectory: "./" })

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

  const database = await createPgComponent({ config, logs, metrics })
  const items = await createItemsComponent({ database })
  const collections = await createCollectionsComponent({ database })
  const catalog = await createCatalogComponent({ database })

  const synchronizationJobManager = createJobLifecycleManagerComponent(
    { logs },
    {
      jobManagerName: "SynchronizationJobManager",
      createJob() {
        return createCliJob({ config }, logs.getLogger("log"))
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
  }
}
