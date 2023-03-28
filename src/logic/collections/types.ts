export type Collection = any

export type ICollectionsComponent = {
  fetch(): Promise<Collection>
}
