export type ISubstreamsComponent = {
  init(options: { logFile: string; outDirectory: string }): Promise<string>
  download(): Promise<void>
  setup(schema: string): Promise<number | null>
  run(schema: string): Promise<number | null>
  ready(): Promise<{ ready: boolean; delay: number }>
}
