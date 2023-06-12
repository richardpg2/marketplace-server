// This file is the "test-environment" analogous for src/components.ts
// Here we define the test components to be used in the testing environment

import { createRunner, createLocalFetchCompoment } from "@well-known-components/test-helpers"

import { main } from "../src/service"
import { TestComponents } from "../src/types"
import { initComponents as originalInitComponents } from "../src/components"

jest.mock("@well-known-components/pg-component", () => {
  const module = jest.requireActual("@well-known-components/pg-component")
  return {
    ...module,
    createPgComponent: () => ({
      start: jest.fn(),
      getPool: jest.fn(),
    }),
  }
})

/**
 * Behaves like Jest "describe" function, used to describe a test for a
 * use case, it creates a whole new program and components to run an
 * isolated test.
 *
 * State is persistent within the steps of the test.
 */
export const test = createRunner<TestComponents>({
  main,
  initComponents,
})

async function initComponents(): Promise<TestComponents> {
  const components = await originalInitComponents()

  // Mock the start function to avoid connecting to a local database

  const { config, database } = components
  jest.spyOn(database, "start").mockResolvedValue(undefined)

  return {
    ...components,
    localFetch: await createLocalFetchCompoment(config),
  }
}
