import { HandlerContextWithPath, StatusCode } from "../../types"

export async function collectionsHandler(
  context: Pick<HandlerContextWithPath<"collections", "/collections">, "url" | "components">
) {
  const {
    components: { collections },
  } = context

  try {
    const results = await collections.fetch()

    return {
      status: StatusCode.OK,
      body: {
        ok: true,
        data: results,
      },
    }
  } catch (error) {
    return {
      status: StatusCode.BAD_REQUEST,
      body: {
        ok: false,
        data: {},
      },
    }
  }
}
