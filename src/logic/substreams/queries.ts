import SQL from "sql-template-strings"
import { IPgComponent } from "@well-known-components/pg-component"

// come up name for the initial schema when there is no schema in the database
const SCHEMA_PREFIX = "dcl"
const INITIAL_SCHEMA = `${SCHEMA_PREFIX}1`

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

export async function getLatestSchema(database: IPgComponent) {
  let schema: string | undefined
  const client = await database.getPool().connect()
  try {
    const query = SQL`
      SELECT schema_name
      FROM information_schema.schemata 
      WHERE schema_name LIKE ${SCHEMA_PREFIX} || '%'
    `
    const getLatestSchemaResult = await client.query<{ schema_name: string }>(query)
    schema = getLatestSchemaResult.rows[0]?.schema_name
  } catch (error) {
    console.log("error:", error)
  } finally {
    await client.release()
  }
  return schema
}

export async function createNewSchema(database: IPgComponent, network: string) {
  const latestSchema = await getLatestSchema(database)
  const newSchema = incrementSchema(latestSchema || INITIAL_SCHEMA)
  const client = await database.getPool().connect()
  try {
    await client.query(SQL`CREATE SCHEMA IF NOT EXISTS `.append(newSchema))
    await client.query(SQL`INSERT INTO substreams.deployments (schema, network) VALUES (${newSchema}, ${network})`)
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
