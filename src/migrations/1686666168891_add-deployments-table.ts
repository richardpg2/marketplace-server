/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate"

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    { schema: "substreams", name: "deployments" },
    {
      schema: { type: "text", notNull: true, primaryKey: true, unique: true },
      network: {
        type: "text",
        notNull: true,
      },
      created_at: {
        type: "timestamp",
        default: pgm.func("current_timestamp"),
      },
    }
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: "substreams", name: "deployments" })
}
