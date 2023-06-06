export type Item = any

export type IItemsComponent = {
  fetch(): Promise<Item>
}
