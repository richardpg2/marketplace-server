import { AppComponents } from "../../types"
import { ICollectionsComponent } from "./types"

export async function createCollectionsComponent(
  components: Pick<AppComponents, "database">
): Promise<ICollectionsComponent> {
  const { database } = components

  async function fetch(): Promise<any[]> {
    const client = await database.getPool().connect()
    try {
    } catch (error) {
      console.log("error:", error)
    } finally {
      await client.release()
    }
    const result = await client.query("SELECT * from collections")
    return result.rows
  }

  return {
    fetch,
  }
}
