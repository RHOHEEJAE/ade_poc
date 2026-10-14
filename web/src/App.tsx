import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { feedBatches, heroSlides, products } from './data'
import { adesdk } from '@adestack/sdk'
import { pushPath } from './navigation'
import type { Product, ProductSection } from './types'

const NAV_ITEMS = ['베스트', '세일', '패션', '리빙', '신상', '특가/혜택']
const CATEGORY_ITEMS = ['채소', '과일·견과·쌀', '수산·해산·건어물', '정육·가공육', '국·반찬·메인요리', '간식·과자·떡']
const CARD_STEP = 267

type IconName = 'menu' | 'search' | 'pin' | 'heart' | 'cart' | 'chevron' | 'close' | 'user'

function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const paths: Record<IconName, React.ReactNode> = {
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    heart: <><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6l1.2 1.2L12 21l7.6-7.6 1.2-1.2a5.4 5.4 0 0 0 0-7.6Z" /></>,
    cart: <><circle cx="9" cy="20" r="1" /><circle cx="19" cy="20" r="1" /><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H6" /></>,
    chevron: <><path d="m9 18 6-6-6-6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  }
  return <svg {...common}>{paths[name]}</svg>
}

function ProductCard({ product, wished, onWish, onOpen, onAdd }: {
  product: Product
  wished: boolean
  onWish: (product: Product) => void
  onOpen: (product: Product) => void
  onAdd: (product: Product) => void
}) {
  return (
    <article className="product-card" data-product-id={product.id} data-ade-kind="object" data-ade-name="ade_4523be908086" data-ade-role="product" data-ade-id-key="product_id" data-ade-product-id={product.id}>
      <div className="product-image-wrap">
        <button className="product-image-button" type="button" data-ade-kind="control" data-ade-name="ade_d78d8325c855" onClick={() => onOpen(product)} aria-label={`${product.name} 상세 보기`}>
          <img src={product.image} alt={product.name} loading="lazy" />
        </button>
        {product.badge && <span className="product-badge">{product.badge}</span>}
        <button className={`wish-button ${wished ? 'is-active' : ''}`} type="button" data-ade-kind="control" data-ade-name="ade_63d1fbd778fc" onClick={() => onWish(product)} aria-label={`${product.name} ${wished ? '찜 해제' : '찜하기'}`}>
          <Icon data-ade-pl="bd9142" name="heart" size={21} />
        </button>
      </div>
      <button className="add-button" type="button" data-ade-kind="control" data-ade-name="ade_9182c6fd028d" onClick={() => onAdd(product)}>
        <Icon data-ade-pl="f6af33" name="cart" size={20} />
        {product.action ?? '담기'}
      </button>
      <button className="product-name" type="button" data-ade-kind="control" data-ade-name="ade_e77260e0aec0" onClick={() => onOpen(product)}>{product.name}</button>
      <del>{product.originalPrice}</del>
      <div className="price-row"><strong className="discount">{product.discount}%</strong><strong>{product.salePrice}</strong></div>
      <span className="review-count">▱ {product.reviews}</span>
    </article>
  )
}

function ProductSectionView({ section, wished, onWish, onOpen, onAdd }: {
  section: ProductSection
  wished: Set<string>
  onWish: (product: Product) => void
  onOpen: (product: Product) => void
  onAdd: (product: Product) => void
}) {
  const [offset, setOffset] = useState(0)
  const maxOffset = Math.max(0, section.products.length - 4)

  return (
    <>
      {section.bandImage && <button className="band-banner" type="button" data-ade-kind="object" data-ade-name="ade_8b7b86d0d574" data-ade-role="banner" data-ade-id-key="banner_id" data-ade-banner-id={`band-${section.id}`} onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' })}><img src={section.bandImage} alt={`${section.title} 프로모션 배너`} /></button>}
      <section className="product-section" id={section.id} data-section-id={section.id}>
        <button className="section-heading" type="button" data-ade-kind="control" data-ade-name="ade_79c181d17abe">
          <span>{section.title}</span><Icon data-ade-pl="cabc9d" name="chevron" size={30} />
        </button>
        <p>{section.subtitle}</p>
        <div className="carousel-frame">
          <div className="product-track" style={{ transform: `translateX(-${offset * CARD_STEP}px)` }}>
            {section.products.map((product) => <ProductCard data-ade-pl="206a50" key={product.id} product={product} wished={wished.has(product.id)} onWish={onWish} onOpen={onOpen} onAdd={onAdd} />)}
          </div>
          {offset > 0 && <button className="carousel-arrow prev" type="button" data-ade-kind="control" data-ade-name="ade_9faf33c2c70e" onClick={() => setOffset((value) => Math.max(0, value - 1))} aria-label={`${section.title} 이전 상품`}><Icon data-ade-pl="5a451f" name="chevron" /></button>}
          {offset < maxOffset && <button className="carousel-arrow next" type="button" data-ade-kind="control" data-ade-name="ade_f24b58719578" onClick={() => setOffset((value) => Math.min(maxOffset, value + 1))} aria-label={`${section.title} 다음 상품`}><Icon data-ade-pl="10abf2" name="chevron" /></button>}
        </div>
      </section>
    </>
  )
}

export default function App() {
  const [topBannerOpen, setTopBannerOpen] = useState(true)
  const [signupOpen, setSignupOpen] = useState(true)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [activeBrand, setActiveBrand] = useState<'market' | 'beauty'>('market')
  const [activeNav, setActiveNav] = useState('베스트')
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroPaused, setHeroPaused] = useState(false)
  const [cartCount, setCartCount] = useState(0)
  const [cartOpen, setCartOpen] = useState(false)
  const [wishlistOpen, setWishlistOpen] = useState(false)
  const [wished, setWished] = useState<Set<string>>(new Set())
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [query, setQuery] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [visibleBatchCount, setVisibleBatchCount] = useState(1)
  const [loading, setLoading] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [toast, setToast] = useState('')
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)
  const toastTimerRef = useRef<number | undefined>(undefined)

  const notify = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2300)
  }, [])

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 145)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (heroPaused) return
    const timer = window.setInterval(() => setHeroIndex((value) => (value + 1) % heroSlides.length), 6000)
    return () => window.clearInterval(timer)
  }, [heroPaused])

  useEffect(() => {
    const target = sentinelRef.current
    if (!target || visibleBatchCount >= feedBatches.length) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      window.setTimeout(() => {
        setVisibleBatchCount((count) => Math.min(feedBatches.length, count + 1))
        setLoading(false)
        loadingRef.current = false
      }, import.meta.env.MODE === 'test' ? 0 : 500)
    }, { rootMargin: '240px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [visibleBatchCount])

  const visibleSections = useMemo(() => feedBatches.slice(0, visibleBatchCount).flatMap((batch) => batch.sections), [visibleBatchCount])
  const searchResults = useMemo(() => searchTerm ? products.filter((product) => product.name.toLocaleLowerCase('ko').includes(searchTerm.toLocaleLowerCase('ko'))) : [], [searchTerm])

  const addToCart = (product: Product) => {
    setCartCount((count) => count + 1)
    adesdk.track({ name: 'ade_2d9979748070', properties: { product_id: product.id } })
    notify(`${product.name}을 장바구니에 담았습니다.`)
  }

  const toggleWish = (product: Product) => {
    setWished((current) => {
      const next = new Set(current)
      if (next.has(product.id)) {
        next.delete(product.id)
        adesdk.track({ name: 'ade_030428998892', properties: { product_id: product.id } })
        notify(`${product.name}의 찜을 해제했습니다.`)
      } else {
        next.add(product.id)
        adesdk.track({ name: 'ade_27847892556b', properties: { product_id: product.id } })
        notify(`${product.name}을 찜했습니다.`)
      }
      return next
    })
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const normalized = query.trim()
    if (!normalized) return
    setSearchTerm(normalized)
    adesdk.track({ name: 'ade_ae8b72a9cd92', properties: { search_keyword: normalized } })
    pushPath(`/main?search=${encodeURIComponent(normalized)}`)
    requestAnimationFrame(() => document.getElementById('search-results')?.scrollIntoView({ behavior: 'smooth' }))
  }

  const selectNav = (item: string) => {
    setActiveNav(item)
    pushPath(`/main?nav=${encodeURIComponent(item)}`)
    notify(`${item} 메뉴를 선택했습니다.`)
  }

  const selectBrand = (brand: 'market' | 'beauty') => {
    setActiveBrand(brand)
    pushPath(`/main?site=${brand === 'market' ? 'MARKET' : 'BEAUTY'}`)
    notify(brand === 'market' ? '마켓컬리로 전환했습니다.' : '뷰티컬리로 전환했습니다.')
  }

  return (
    <div className="app-shell">
      {topBannerOpen && <div className="top-banner" data-ade-kind="object" data-ade-name="ade_988e89b743dc" data-ade-role="banner" data-ade-id-key="banner_id" data-ade-banner-id="top-signup"><button type="button" data-ade-kind="control" data-ade-name="ade_9529082d8624" onClick={() => setSignupOpen(true)}>지금 가입하고 <strong>최대 1만 2천원 할인 쿠폰</strong> 받아가세요!</button><button className="top-close" type="button" data-ade-kind="control" data-ade-name="ade_56f27e13e91e" onClick={() => setTopBannerOpen(false)} aria-label="가입 배너 닫기"><Icon data-ade-pl="fb0bcd" name="close" size={18} /></button></div>}

      <header className="site-header">
        <div className="utility"><button type="button" data-ade-kind="control" data-ade-name="ade_f201d61adcbb" onClick={() => setSignupOpen(true)}>회원가입</button><span /> <button type="button" data-ade-kind="control" data-ade-name="ade_3b88afc6f947" onClick={() => notify('로그인 데모 화면입니다.')}>로그인</button><span /> <button type="button" data-ade-kind="control" data-ade-name="ade_fc6408033a47" onClick={() => notify('고객센터 데모 화면입니다.')}>고객센터 ▾</button></div>
        <div className="brand-row">
          <button className="logo" type="button" data-ade-kind="control" data-ade-name="ade_480d55fe1e55" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Kurly</button>
          <div className="brand-switch"><button className={activeBrand === 'market' ? 'is-active' : ''} type="button" data-ade-kind="control" data-ade-name="ade_23434b6e29f1" onClick={() => selectBrand('market')}>마켓컬리</button><i /><button className={activeBrand === 'beauty' ? 'is-active' : ''} type="button" data-ade-kind="control" data-ade-name="ade_a2408c132d67" onClick={() => selectBrand('beauty')}>뷰티컬리</button></div>
          <form className="search-box" onSubmit={submitSearch} role="search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="검색어를 입력해주세요" aria-label="상품 검색어" data-ade-kind="input" data-ade-name="ade_2af026b3fb11" /><button type="submit" aria-label="검색" data-ade-kind="control" data-ade-name="ade_8b275bbaed26"><Icon data-ade-pl="13540f" name="search" /></button></form>
          <div className="header-actions">
            <button type="button" aria-label="배송지 설정" data-ade-kind="control" data-ade-name="ade_4b10f428562c" onClick={() => notify('배송지를 설정해 주세요.')}><Icon data-ade-pl="9419d2" name="pin" size={28} /></button>
            <button type="button" aria-label={`찜 목록 ${wished.size}개`} data-ade-kind="control" data-ade-name="ade_edd15d13b1b9" onClick={() => setWishlistOpen((value) => !value)}><Icon data-ade-pl="23b391" name="heart" size={28} />{wished.size > 0 && <em>{wished.size}</em>}</button>
            <button type="button" aria-label={`장바구니 ${cartCount}개`} data-ade-kind="control" data-ade-name="ade_24444c59b8fe" onClick={() => setCartOpen((value) => !value)}><Icon data-ade-pl="07081c" name="cart" size={29} /><em>{cartCount}</em></button>
          </div>
        </div>
      </header>

      <nav className={`site-nav ${scrolled ? 'is-condensed' : ''}`} aria-label="주요 메뉴">
        <div className="nav-inner">
          <button className="category-button" type="button" data-ade-kind="control" data-ade-name="ade_f40cb8b2fdb4" onClick={() => setCategoryOpen((value) => !value)} aria-expanded={categoryOpen}><Icon data-ade-pl="ee5ad7" name="menu" size={23} />카테고리</button>
          <div className="nav-links">{NAV_ITEMS.map((item) => <button key={item} className={activeNav === item ? 'is-active' : ''} type="button" data-ade-kind="object" data-ade-name="ade_8d1403cdf5b3" data-ade-id-key="menu_id" data-ade-menu-id={item} onClick={() => selectNav(item)} data-nav-id={item}>{item}</button>)}</div>
          <button className="delivery-pill" type="button" data-ade-kind="control" data-ade-name="ade_a12cf1d7d5aa" onClick={() => notify('샛별·하루 배송 지역을 확인합니다.')}><strong>샛별·하루</strong> 배송안내</button>
          <form className="compact-search" onSubmit={submitSearch} role="search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="검색어를 입력해주세요" aria-label="고정 메뉴 상품 검색어" data-ade-kind="input" data-ade-name="ade_6bb401b89740" /><button type="submit" aria-label="고정 메뉴 검색" data-ade-kind="control" data-ade-name="ade_2036e555754e"><Icon data-ade-pl="0bc358" name="search" size={20} /></button></form>
          <div className="compact-actions"><button type="button" aria-label="배송지 설정" data-ade-kind="control" data-ade-name="ade_65c6abc836d4" onClick={() => notify('배송지를 설정해 주세요.')}><Icon data-ade-pl="b802e0" name="pin" /></button><button type="button" aria-label="찜 목록" data-ade-kind="control" data-ade-name="ade_2c03ccedd05e" onClick={() => setWishlistOpen((value) => !value)}><Icon data-ade-pl="e7a3dc" name="heart" /></button><button type="button" aria-label="장바구니" data-ade-kind="control" data-ade-name="ade_2bca3d93c74d" onClick={() => setCartOpen((value) => !value)}><Icon data-ade-pl="ac61b2" name="cart" /><em>{cartCount}</em></button></div>
        </div>
        {categoryOpen && <div className="category-menu">{CATEGORY_ITEMS.map((item, index) => <button key={item} type="button" data-ade-kind="object" data-ade-name="ade_3cce47c35d39" data-ade-id-key="category_id" data-ade-category-id={item} onClick={() => { setCategoryOpen(false); notify(`${item} 카테고리를 선택했습니다.`) }}><span>{['🥬', '🍎', '🐟', '🥩', '🍲', '🍪'][index]}</span>{item}<Icon data-ade-pl="340242" name="chevron" size={17} /></button>)}</div>}
      </nav>

      <main>
        <section className="hero" aria-label="주요 기획전" onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)} onFocus={() => setHeroPaused(true)} onBlur={() => setHeroPaused(false)}>
          <div className="hero-track" style={{ transform: `translateX(-${heroIndex * 100}%)` }}>{heroSlides.map((slide) => <button key={slide.id} className="hero-slide" type="button" onClick={() => notify(slide.alt)} data-slide-id={slide.id} data-ade-kind="object" data-ade-name="ade_63e78c6ef009" data-ade-role="banner" data-ade-id-key="banner_id" data-ade-banner-id={slide.id}><img src={slide.image} alt={slide.alt} /></button>)}</div>
          <button className="hero-arrow hero-prev" type="button" data-ade-kind="control" data-ade-name="ade_4d2185bc46b0" onClick={() => setHeroIndex((heroIndex - 1 + heroSlides.length) % heroSlides.length)} aria-label="이전 기획전">‹</button>
          <button className="hero-arrow hero-next" type="button" data-ade-kind="control" data-ade-name="ade_8b67c9ce2112" onClick={() => setHeroIndex((heroIndex + 1) % heroSlides.length)} aria-label="다음 기획전">›</button>
          <span className="hero-count">{String(heroIndex + 1).padStart(2, '0')} / {String(heroSlides.length).padStart(2, '0')} 전체보기 ›</span>
        </section>

        {searchTerm ? (
          <section className="search-results content-width" id="search-results" data-section-id="search-results">
            <div className="search-result-header"><div><h2>‘{searchTerm}’ 검색 결과</h2><p>{searchResults.length}개의 상품을 찾았습니다.</p></div><button type="button" data-ade-kind="control" data-ade-name="ade_f2fe2929c4ab" onClick={() => { setSearchTerm(''); setQuery(''); pushPath('/main') }}>검색 결과 닫기</button></div>
            {searchResults.length ? <div className="search-grid">{searchResults.map((product) => <ProductCard data-ade-pl="9b18bf" key={product.id} product={product} wished={wished.has(product.id)} onWish={toggleWish} onOpen={setSelectedProduct} onAdd={addToCart} />)}</div> : <div className="empty-state"><Icon data-ade-pl="5f65e9" name="search" size={36} /><strong>일치하는 상품이 없습니다.</strong><span>다른 검색어를 입력해 주세요.</span></div>}
          </section>
        ) : (
          <div className="feed">
            {visibleSections.map((section) => <ProductSectionView data-ade-pl="78cfa8" key={section.id} section={section} wished={wished} onWish={toggleWish} onOpen={setSelectedProduct} onAdd={addToCart} />)}
            <div className="load-sentinel" ref={sentinelRef} aria-live="polite" data-testid="load-sentinel">{loading ? <><span className="spinner" />새로운 추천 상품을 불러오고 있습니다.</> : visibleBatchCount >= feedBatches.length ? '준비한 샘플 상품을 모두 불러왔습니다.' : ''}</div>
          </div>
        )}
      </main>

      <aside className="quick-menu" aria-label="빠른 메뉴"><img src="/assets/delivery-info.jpg" alt="샛별·하루 배송 안내" /><button type="button" data-ade-kind="control" data-ade-name="ade_d47bef8aba4a" onClick={() => notify('컬리 고객 제도를 확인합니다.')}>컬리 고객 제도</button><button type="button" data-ade-kind="control" data-ade-name="ade_ed5c7b6be01e" onClick={() => document.getElementById('wonder')?.scrollIntoView({ behavior: 'smooth' })}>컬리 큐레이터</button><button type="button" data-ade-kind="control" data-ade-name="ade_8fa355d0f3ad" onClick={() => document.getElementById('cart-special')?.scrollIntoView({ behavior: 'smooth' })}>레시피</button></aside>

      <footer className="footer"><div className="content-width"><div><strong>고객행복센터</strong><b>1644-1107</b><span>월~토요일 오전 7시부터 오후 6시까지</span></div><div><button type="button">컬리소개</button><button type="button">이용약관</button><button type="button">개인정보처리방침</button><button type="button">이용안내</button><p>본 화면은 ADE PoC 검증을 위한 localhost 전용 데모입니다.</p></div></div></footer>

      {signupOpen && <div className="modal-backdrop signup-backdrop" role="presentation"><button className="modal-capture-shield" type="button" tabIndex={-1} aria-label="가입 혜택 바깥 영역" onClick={() => setSignupOpen(false)} data-ade-kind="control" data-ade-name="ade_c02dc9118132" /><section className="signup-modal" role="dialog" aria-modal="true" aria-labelledby="signup-title" data-ade-kind="object" data-ade-name="ade_5fe6efa4a118" data-ade-role="modal" data-ade-id-key="modal_id" data-ade-modal-id="signup"><button className="modal-close" type="button" data-ade-kind="control" data-ade-name="ade_24cfc82831b4" onClick={() => setSignupOpen(false)} aria-label="가입 혜택 닫기"><Icon data-ade-pl="05b9f6" name="close" /></button><span className="confetti">◆　◇　◆</span><small>오직 앱에서만 가능한 첫 구매 혜택 🎉</small><h2 id="signup-title">지금 가입하고 첫 구매하면<br /><strong>최대 12,000원 할인!</strong></h2><div className="coupon-stack"><div>최초 1회<strong>무료배송</strong></div><div>4만원 이상 주문 시<strong>12,000<sup>원</sup></strong></div></div><button className="signup-cta" type="button" data-ade-kind="control" data-ade-name="ade_11efd25794b5" onClick={() => { setSignupOpen(false); notify('회원가입 혜택을 선택했습니다.') }}>지금 바로 가입하고 혜택 받기 <Icon data-ade-pl="b9c057" name="chevron" size={20} /></button><button className="signup-dismiss" type="button" data-ade-kind="control" data-ade-name="ade_f6c834f91b8b" onClick={() => setSignupOpen(false)}>닫기</button></section></div>}

      {selectedProduct && <div className="modal-backdrop" role="presentation"><button className="modal-capture-shield" type="button" tabIndex={-1} aria-label="상품 상세 바깥 영역" onClick={() => setSelectedProduct(null)} data-ade-kind="control" data-ade-name="ade_0c33c8ea5d45" /><section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title" data-product-id={selectedProduct.id} data-ade-kind="object" data-ade-name="ade_0ae55f5fe91c" data-ade-role="modal" data-ade-id-key="modal_id" data-ade-modal-id="product-detail" data-ade-parent-product-id={selectedProduct.id}><button className="modal-close" type="button" data-ade-kind="control" data-ade-name="ade_bd5013db68ab" onClick={() => setSelectedProduct(null)} aria-label="상품 상세 닫기"><Icon data-ade-pl="702bb5" name="close" /></button><img src={selectedProduct.image} alt="" /><div><span className="modal-delivery">샛별배송</span><h2 id="product-modal-title">{selectedProduct.name}</h2><p>컬리가 엄선한 상품을 로컬 데모에서 확인해 보세요.</p><del>{selectedProduct.originalPrice}</del><div className="modal-price"><strong>{selectedProduct.discount}%</strong><b>{selectedProduct.salePrice}</b></div><button className="primary-button" type="button" data-ade-kind="control" data-ade-name="ade_e3a99ba7035d" onClick={() => addToCart(selectedProduct)}>장바구니 담기</button></div></section></div>}

      {wishlistOpen && <div className="header-popover wishlist-popover" data-ade-kind="object" data-ade-name="ade_e241fda81690" data-ade-role="modal" data-ade-id-key="modal_id" data-ade-modal-id="wishlist"><strong>찜한 상품</strong><span>{wished.size ? `${wished.size}개의 상품을 찜했습니다.` : '찜한 상품이 없습니다.'}</span><button type="button" data-ade-kind="control" data-ade-name="ade_45488974f31d" onClick={() => setWishlistOpen(false)}>확인</button></div>}
      {cartOpen && <div className="header-popover cart-popover" data-ade-kind="object" data-ade-name="ade_01a489e3260c" data-ade-role="modal" data-ade-id-key="modal_id" data-ade-modal-id="cart"><strong>장바구니</strong><span>{cartCount ? `${cartCount}개의 상품이 담겨 있습니다.` : '장바구니가 비어 있습니다.'}</span><button type="button" data-ade-kind="control" data-ade-name="ade_345134199582" onClick={() => setCartOpen(false)}>확인</button></div>}
      {toast && <div className="toast" role="status" aria-live="polite" data-ade-kind="object" data-ade-name="ade_8f67278a3059" data-ade-role="toast" data-ade-identity-static>{toast}</div>}
    </div>
  )
}
