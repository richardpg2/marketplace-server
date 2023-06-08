import { AppComponents } from "../../types"
import { IItemsComponent } from "./types"

export async function createItemsComponent(components: Pick<AppComponents, "database">): Promise<IItemsComponent> {
  const { database } = components

  async function fetch(): Promise<any[]> {
    const client = await database.getPool().connect()
    try {
    } catch (error) {
      console.log("error:", error)
    } finally {
      await client.release()
    }
    const result = await client.query("SELECT * from items")
    return result.rows
  }

  return {
    fetch,
  }
}
