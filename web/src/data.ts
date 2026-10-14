import type { BannerSlide, FeedBatch, Product } from './types'

export const heroSlides: BannerSlide[] = [
  { id: 'wonder', image: '/assets/hero/hero-01.png', alt: '독보적 혜택 원더핫딜 최대 50% 할인' },
  { id: 'beauty', image: '/assets/hero/hero-02.png', alt: '컬리 뷰티 신상품 기획전' },
  { id: 'autumn', image: '/assets/hero/hero-03.png', alt: '가을 식탁을 위한 컬리 추천 상품' },
]

export const products: Product[] = [
  { id: 'p01', name: '[정관장 X Kurly] 홍삼정 더 클래스 농축스틱 (50일분) 2종', image: '/assets/products/product-01.jpg', originalPrice: '153,000원', salePrice: '107,100원', discount: 30, badge: '+최대15%쿠폰', reviews: '999+' },
  { id: 'p02', name: '[25-26 햇올리브][꾸악] 스페인 유기농 엑스트라버진 500mL', image: '/assets/products/product-02.jpg', originalPrice: '94,600원', salePrice: '80,410원', discount: 15, badge: '+최대15%쿠폰', reviews: '999+' },
  { id: 'p03', name: '[설화수] New 자음 2종 세트', image: '/assets/products/product-03.jpg', originalPrice: '150,000원', salePrice: '116,100원', discount: 22, badge: '5%쿠폰+증정', reviews: '999+' },
  { id: 'p04', name: '[선물세트] 옥돔&갈치&민어굴비 세트', image: '/assets/products/product-04.jpg', originalPrice: '189,000원', salePrice: '135,000원', discount: 28, badge: '+최대4만원쿠폰', reviews: '999+', action: '상세보기' },
  { id: 'p05', name: '[에스티 로더] 갈색병 50ml 스페셜 세트', image: '/assets/products/product-05.jpg', originalPrice: '200,000원', salePrice: '153,000원', discount: 23, badge: '+최대15%쿠폰', reviews: '14' },
  { id: 'p06', name: '[핀카듀에르나스 X Kurly] 오가닉 엑스트라 버진 햇올리브오일', image: '/assets/products/product-06.jpg', originalPrice: '98,900원', salePrice: '69,230원', discount: 30, badge: '선물특가', reviews: '999+' },
  { id: 'p07', name: '[선물세트] 조선호텔 LA갈비 세트 3kg', image: '/assets/products/product-07.jpg', originalPrice: '149,900원', salePrice: '142,400원', discount: 5, badge: '+최대4만원쿠폰', reviews: '117', action: '상세보기' },
  { id: 'p08', name: '[KF365] 대추방울토마토 750g', image: '/assets/products/product-08.jpg', originalPrice: '12,900원', salePrice: '9,990원', discount: 22, badge: '+10%쿠폰', reviews: '9,999+' },
  { id: 'p09', name: '치밥하기 좋은 순살 바베큐치킨', image: '/assets/products/product-09.jpg', originalPrice: '15,990원', salePrice: '13,990원~', discount: 12, badge: '멤버스특가', reviews: '9,999+' },
  { id: 'p10', name: '[KF365] 한돈 삼겹살 구이용 600g/1kg', image: '/assets/products/product-10.jpg', originalPrice: '21,200원', salePrice: '15,900원~', discount: 25, reviews: '9,999+' },
  { id: 'p11', name: '[안원당] 우거지 감자탕', image: '/assets/products/product-11.jpg', originalPrice: '8,900원', salePrice: '7,560원', discount: 15, badge: '최대10% 쿠폰', reviews: '9,999+' },
  { id: 'p12', name: '[설성목장] 한우 곰탕 600g', image: '/assets/products/product-12.jpg', originalPrice: '11,900원', salePrice: '8,560원~', discount: 28, badge: '멤버스특가', reviews: '9,999+' },
  { id: 'p13', name: '[고래사어묵] 김치 우동 전골', image: '/assets/products/product-13.jpg', originalPrice: '10,800원', salePrice: '9,280원', discount: 14, reviews: '9,999+' },
  { id: 'p14', name: '[홍익궁중전통] 육개장 (2인분)', image: '/assets/products/product-14.jpg', originalPrice: '10,800원', salePrice: '8,640원', discount: 20, reviews: '9,999+' },
  { id: 'p15', name: '고랭지 홍로 햇사과 1.3kg', image: '/assets/products/product-15.jpg', originalPrice: '24,900원', salePrice: '19,900원', discount: 20, badge: '+10%쿠폰', reviews: '9,999+' },
  { id: 'p16', name: "[Kurly's] 동물복지 유정란 20구", image: '/assets/products/product-16.jpg', originalPrice: '10,580원', salePrice: '9,522원', discount: 10, reviews: '9,999+' },
  { id: 'p17', name: '[차려낸] 햄 가득 송탄식 부대찌개', image: '/assets/products/product-17.jpg', originalPrice: '15,900원', salePrice: '10,335원', discount: 35, badge: '+최대15%쿠폰', reviews: '9,999+' },
  { id: 'p18', name: "[Kurly's] 국산콩 두부 500g", image: '/assets/products/product-18.jpg', originalPrice: '3,200원', salePrice: '2,880원', discount: 10, reviews: '9,999+' },
  { id: 'p19', name: '[조선호텔] 떡갈비 345g', image: '/assets/products/product-19.jpg', originalPrice: '9,900원', salePrice: '8,700원', discount: 12, badge: '최대15% 쿠폰', reviews: '9,999+' },
  { id: 'p20', name: '[KF365] 무농약 국산콩 콩나물 300g', image: '/assets/products/product-20.jpg', originalPrice: '1,590원', salePrice: '1,280원', discount: 19, badge: '+10%쿠폰', reviews: '9,999+' },
  { id: 'p21', name: '[압구정주꾸미] 주꾸미 볶음 2종', image: '/assets/products/product-21.jpg', originalPrice: '9,900원', salePrice: '7,800원~', discount: 21, badge: '+10% 쿠폰', reviews: '9,999+' },
  { id: 'p22', name: '[일상味소] 국내산 소고기 육전용 200g', image: '/assets/products/product-22.jpg', originalPrice: '11,000원', salePrice: '8,800원', discount: 20, badge: '+최대15%쿠폰', reviews: '9,999+' },
  { id: 'p23', name: '[KF365] 고당도 애플청포도 500g', image: '/assets/products/product-23.jpg', originalPrice: '12,900원', salePrice: '8,990원', discount: 30, reviews: '559' },
  { id: 'p24', name: '[사미헌] 갈비탕', image: '/assets/products/product-24.jpg', originalPrice: '14,500원', salePrice: '13,050원', discount: 10, badge: '베스트', reviews: '9,999+' },
]

export const feedBatches: FeedBatch[] = [
  {
    id: 'initial',
    sections: [
      { id: 'gift', title: '🎁 눈 깜짝하면 다가올 추석 준비!', subtitle: '최대 혜택으로 선물하세요! 쿠폰+최대 77% OFF', products: products.slice(0, 6) },
      { id: 'wonder', title: '🔥 원더컬리 이번 달 최대 혜택', subtitle: '가장 핫한 특가만 모아, 최대 50% 할인', products: products.slice(6, 12), bandImage: '/assets/bands/band-01.jpg' },
    ],
  },
  {
    id: 'popular-cart',
    sections: [
      { id: 'cart-special', title: '🛒 지금 가장 많이 담는 특가', subtitle: '꼭 담아야 할 추천 특가템 최대 50% OFF', products: products.slice(12, 18) },
    ],
  },
  {
    id: 'repurchase',
    sections: [
      { id: 'repurchase', title: '💜 재구매만 1만회 이상 기록!', subtitle: '한 번 맛보면 또 찾게 되는 매력', products: products.slice(18, 24), bandImage: '/assets/bands/band-02.png' },
    ],
  },
]
