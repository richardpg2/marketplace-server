export type ISubstreamsComponent = {
  init(options: { logFile: string; outDirectory: string }): Promise<string>
  download(): Promise<void>
  setup(schema: string): Promise<void>
  run(schema: string): Promise<void>
}
