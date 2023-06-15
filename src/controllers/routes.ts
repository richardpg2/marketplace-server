import { Router } from "@well-known-components/http-server"
import { GlobalContext } from "../types"
import { catalogHandler } from "./handlers/catalog-handler"
import { collectionsHandler } from "./handlers/collections-handler"
import { itemsHandler } from "./handlers/items-handler"
import { pingHandler } from "./handlers/ping-handler"
import { readyHandler } from "./handlers/ready-handler"

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter(_globalContext: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()

  router.get("/ping", pingHandler)
  router.get("/ready", readyHandler)
  router.get("/v1/items", itemsHandler)
  router.get("/v1/collections", collectionsHandler)
  router.get("/v1/catalog", catalogHandler)

  return router
}
