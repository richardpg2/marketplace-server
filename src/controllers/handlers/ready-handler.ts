import { HandlerContextWithPath } from "../../types"

const SUCCESSFUL_STATUS = 200
const FAILED_STATUS = 503

// handlers arguments only type what they need, to make unit testing easier
export async function readyHandler(
  context: Pick<HandlerContextWithPath<"substreams", "/ready">, "url" | "components">
) {
  const {
    components: { substreams },
  } = context

  const { ready, delay } = await substreams.ready()

  return {
    status: ready ? SUCCESSFUL_STATUS : FAILED_STATUS,
    body: { ready, delay },
  }
}
