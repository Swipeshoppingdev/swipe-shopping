import { lazy, Suspense, useEffect } from 'react'
import { BottomNav } from './components/BottomNav'
import { ConsentBanner } from './components/ConsentBanner'
import { Header } from './components/Header'
import { ProductSheet } from './components/ProductSheet'
import { useOutfitMode } from './lib/outfitMode'
import { useHashRoute } from './lib/useHashRoute'
import { Welcome } from './components/Welcome'
import { SocialWatcher } from './components/SocialWatcher'
import { DiscoverPage } from './pages/DiscoverPage'

// Solo Scopri è nel codice iniziale: le altre pagine si scaricano quando servono (e in anticipo, a app ferma).
const PAGES = {
  AdminPage: () => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })),
  FriendProfilePage: () => import('./pages/FriendProfilePage').then((m) => ({ default: m.FriendProfilePage })),
  FriendsPage: () => import('./pages/FriendsPage').then((m) => ({ default: m.FriendsPage })),
  GiftListPage: () => import('./pages/GiftListPage').then((m) => ({ default: m.GiftListPage })),
  ChatPage: () => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })),
  GiftsPage: () => import('./pages/GiftsPage').then((m) => ({ default: m.GiftsPage })),
  OutfitPage: () => import('./pages/OutfitPage').then((m) => ({ default: m.OutfitPage })),
  PollPage: () => import('./pages/PollPage').then((m) => ({ default: m.PollPage })),
  SantaPage: () => import('./pages/SantaPage').then((m) => ({ default: m.SantaPage })),
  StudioPage: () => import('./pages/StudioPage').then((m) => ({ default: m.StudioPage })),
  SwipeTogetherPage: () => import('./pages/SwipeTogetherPage').then((m) => ({ default: m.SwipeTogetherPage })),
  FiltersPage: () => import('./pages/FiltersPage').then((m) => ({ default: m.FiltersPage })),
  PrivacyPage: () => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
  ProfilePage: () => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
  SharedListPage: () => import('./pages/SharedListPage').then((m) => ({ default: m.SharedListPage })),
  WishlistPage: () => import('./pages/WishlistPage').then((m) => ({ default: m.WishlistPage })),
}
const AdminPage = lazy(PAGES.AdminPage)
const FriendProfilePage = lazy(PAGES.FriendProfilePage)
const FriendsPage = lazy(PAGES.FriendsPage)
const GiftListPage = lazy(PAGES.GiftListPage)
const ChatPage = lazy(PAGES.ChatPage)
const OutfitPage = lazy(PAGES.OutfitPage)
const GiftsPage = lazy(PAGES.GiftsPage)
const PollPage = lazy(PAGES.PollPage)
const SantaPage = lazy(PAGES.SantaPage)
const StudioPage = lazy(PAGES.StudioPage)
const SwipeTogetherPage = lazy(PAGES.SwipeTogetherPage)
const FiltersPage = lazy(PAGES.FiltersPage)
const PrivacyPage = lazy(PAGES.PrivacyPage)
const ProfilePage = lazy(PAGES.ProfilePage)
const SharedListPage = lazy(PAGES.SharedListPage)
const WishlistPage = lazy(PAGES.WishlistPage)
const prefetchPages = () => Object.values(PAGES).forEach((load) => void load().catch(() => {}))

export default function App() {
  const { route, hash } = useHashRoute()
  const isDiscover = route === 'scopri' || route === 'outfit' || route === 'regali'
  const inOutfit = useOutfitMode()
  useEffect(() => {
    const t = setTimeout(prefetchPages, 4000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900">
      <Header />
      <main
        className={`mx-auto flex w-full min-h-0 flex-1 flex-col px-4 ${
          isDiscover ? 'max-w-md overflow-hidden pb-[calc(5rem+env(safe-area-inset-bottom))]' : 'max-w-4xl overflow-y-auto'
        }`}
      >
        {route === 'scopri' && <DiscoverPage />}
        <Suspense fallback={null}>
        {route === 'preferiti' && <WishlistPage />}
        {route === 'filtri' && <FiltersPage />}
        {route === 'profilo' && <ProfilePage />}
        {route === 'privacy' && <PrivacyPage />}
        {route === 'admin' && <AdminPage />}
        {route === 'lista' && <SharedListPage />}
        {route === 'amici' && <FriendsPage />}
        {route === 'u' && <FriendProfilePage key={hash} />}
        {route === 'sondaggio' && <PollPage key={hash} />}
        {route === 'regalo' && <GiftListPage key={hash} />}
        {route === 'insieme' && <SwipeTogetherPage key={hash} />}
        {route === 'segreto' && <SantaPage key={hash} />}
        {route === 'chat' && <ChatPage key={hash} />}
        {route === 'outfit' && <OutfitPage />}
        {route === 'regali' && <GiftsPage />}
        {route === 'studio' && <StudioPage />}
        </Suspense>
        {/* Spazio per la barra in basso: un elemento vero, perché Safari ignora il padding in fondo ai contenitori che scorrono. */}
        {!isDiscover && <div aria-hidden className="h-[calc(6rem+env(safe-area-inset-bottom))] shrink-0" />}
      </main>
      <ConsentBanner />
      <Welcome />
      <ProductSheet />
      <SocialWatcher />
      <BottomNav current={route} hash={hash} inOutfit={inOutfit} />
    </div>
  )
}
