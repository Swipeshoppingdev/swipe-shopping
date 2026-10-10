import { BottomNav } from './components/BottomNav'
import { ConsentBanner } from './components/ConsentBanner'
import { Header } from './components/Header'
import { ProductSheet } from './components/ProductSheet'
import { useHashRoute } from './lib/useHashRoute'
import { Welcome } from './components/Welcome'
import { SocialWatcher } from './components/SocialWatcher'
import { AdminPage } from './pages/AdminPage'
import { DiscoverPage } from './pages/DiscoverPage'
import { FriendProfilePage } from './pages/FriendProfilePage'
import { FriendsPage } from './pages/FriendsPage'
import { GiftListPage } from './pages/GiftListPage'
import { ChatPage } from './pages/ChatPage'
import { OutfitPage } from './pages/OutfitPage'
import { PollPage } from './pages/PollPage'
import { SantaPage } from './pages/SantaPage'
import { SwipeTogetherPage } from './pages/SwipeTogetherPage'
import { FiltersPage } from './pages/FiltersPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { ProfilePage } from './pages/ProfilePage'
import { SharedListPage } from './pages/SharedListPage'
import { WishlistPage } from './pages/WishlistPage'

export default function App() {
  const { route, hash } = useHashRoute()
  const isDiscover = route === 'scopri' || route === 'outfit'

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900">
      <Header />
      <main
        className={`mx-auto flex w-full min-h-0 flex-1 flex-col px-4 ${
          isDiscover ? 'max-w-md overflow-hidden pb-[calc(5rem+env(safe-area-inset-bottom))]' : 'max-w-4xl overflow-y-auto'
        }`}
      >
        {route === 'scopri' && <DiscoverPage />}
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
        {/* Spazio per la barra in basso: un elemento vero, perché Safari ignora il padding in fondo ai contenitori che scorrono. */}
        {!isDiscover && <div aria-hidden className="h-[calc(6rem+env(safe-area-inset-bottom))] shrink-0" />}
      </main>
      <ConsentBanner />
      <Welcome />
      <ProductSheet />
      <SocialWatcher />
      <BottomNav current={route} hash={hash} />
    </div>
  )
}
