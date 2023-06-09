import SQL from "sql-template-strings"
import { IPgComponent } from "@well-known-components/pg-component"

// come up name for the initial schema when there is no schema in the database
const INITIAL_SCHEMA = "dcl1"

function incrementSchema(schema: string) {
  // Extract the number from the input string
  const schemaNumber = schema.match(/\d+/)?.[0]
  if (schemaNumber) {
    const number = parseInt(schemaNumber)
    const incrementedNumber = number + 1
    // Replace the number in the string with the incremented value
    return schema.replace(/\d+$/, `${incrementedNumber}`)
  }
  throw new Error("Invalid schema")
}

export async function getLatestSchema(database: IPgComponent, network: string) {
  let schema: string | undefined
  const client = await database.getPool().connect()
  try {
    const query = SQL`SELECT schema.entity_schema from substreams.network_schema as schema where schema.network = ${network}`
    const getLatestSchemaResult = await client.query<{ entity_schema: string }>(query)
    schema = getLatestSchemaResult.rows[0]?.entity_schema
  } catch (error) {
    console.log("error:", error)
  } finally {
    await client.release()
  }
  return schema
}

export async function createNewSchema(database: IPgComponent, network: string) {
  const latestSchema = await getLatestSchema(database, network)
  const newSchema = incrementSchema(latestSchema || INITIAL_SCHEMA)
  const client = await database.getPool().connect()
  try {
    const schemaCreationQuery = SQL`CREATE SCHEMA IF NOT EXISTS `.append(newSchema)
    await client.query(schemaCreationQuery)
    let networkSchemaQuery
    if (!latestSchema) {
      networkSchemaQuery = SQL`INSERT INTO substreams.network_schema (network, entity_schema) VALUES (${network}, ${newSchema})`
    } else {
      networkSchemaQuery = SQL`UPDATE substreams.network_schema SET entity_schema = ${newSchema} WHERE network = ${network}`
    }
    await client.query(networkSchemaQuery)
    const createCursorQuery = SQL`
      CREATE TABLE `
      .append(newSchema)
      .append(
        SQL`.cursors (
        id text PRIMARY KEY,
        cursor text,
        block_num bigint,
        block_id text
    );
    
    -- Indices -------------------------------------------------------
    
    CREATE UNIQUE INDEX cursor_pk ON `
          .append(newSchema)
          .append(SQL`.cursors(id text_ops)`)
      )
    await client.query(createCursorQuery)
  } catch (error) {
    console.error(error)
    throw Error("Error creating new schema")
  } finally {
    await client.release()
  }
  return newSchema
}
