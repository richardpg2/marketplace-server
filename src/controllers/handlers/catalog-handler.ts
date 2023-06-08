import { HandlerContextWithPath, StatusCode } from "../../types"

export async function catalogHandler(
  context: Pick<HandlerContextWithPath<"catalog", "/catalog">, "url" | "components">
) {
  const {
    components: { catalog },
  } = context

  try {
    const results = await catalog.fetch()

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
