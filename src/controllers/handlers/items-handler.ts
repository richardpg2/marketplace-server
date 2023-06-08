import { HandlerContextWithPath, StatusCode } from "../../types"

export async function itemsHandler(context: Pick<HandlerContextWithPath<"items", "/items">, "url" | "components">) {
  const {
    components: { items },
  } = context

  try {
    const results = await items.fetch()

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
