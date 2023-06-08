import { AppComponents } from "../../types"
import { ICatalogComponent } from "./types"

export async function createCatalogComponent(components: Pick<AppComponents, "database">): Promise<ICatalogComponent> {
  const { database } = components

  async function fetch(): Promise<any[]> {
    const client = await database.getPool().connect()
    try {
    } catch (error) {
      console.log("error:", error)
    } finally {
      await client.release()
    }
    const result = await client.query(
      `
        SELECT
          items.*, cast(items.max_supply as numeric(77)) - COUNT(nfts) as available, MIN(orders.price), 
            (
              CASE WHEN cast(items.max_supply as numeric(77)) - COUNT(nfts) > 0
                THEN LEAST(cast(items.price as numeric(77)), MIN(cast(orders.price as numeric(77))))
                ELSE cast(MIN(orders.price) as numeric(77))
              END
            ) as min_price 
        FROM items
        JOIN nfts ON nfts.item_id = items.id
        JOIN orders ON orders.nft_id || '-' || orders.token_id = nfts.id
        --	JOIN orders ON orders.nft_id = nfts.id
        AND orders.status = 'open' 
        AND to_timestamp(substr(orders.expires_at,1, length(orders.expires_at)-3)::double precision) > now()
        GROUP BY items.id
        ORDER BY min_price
      `
    )
    return result.rows
  }

  return {
    fetch,
  }
}
