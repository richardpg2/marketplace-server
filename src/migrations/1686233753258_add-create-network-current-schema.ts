/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate"

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createSchema("substreams", { ifNotExists: true })
  pgm.createTable(
    { schema: "substreams", name: "network_schema" },
    {
      network: {
        type: "text",
        notNull: true,
        primaryKey: true,
        unique: true,
      },
      entity_schema: { type: "text", notNull: true },
    }
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: "substreams", name: "network_schema" })
  pgm.dropSchema("substreams")
}
