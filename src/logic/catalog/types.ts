export type Catalog = any

export type ICatalogComponent = {
  fetch(): Promise<Catalog>
}
