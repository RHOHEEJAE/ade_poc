export interface BannerSlide {
  id: string
  image: string
  alt: string
}

export interface Product {
  id: string
  name: string
  image: string
  originalPrice: string
  salePrice: string
  discount: number
  badge?: string
  reviews: string
  action?: '담기' | '상세보기'
}

export interface ProductSection {
  id: string
  title: string
  subtitle: string
  products: Product[]
  bandImage?: string
}

export interface FeedBatch {
  id: string
  sections: ProductSection[]
}
