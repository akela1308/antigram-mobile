import { createContext, useContext } from 'react'

interface AppContextType {
  isGuest: boolean
  isLoggedIn: boolean
  isAdmin: boolean
  exitGuestMode: () => void
  unreadCount: number
  setUnreadCount: (n: number) => void
}

export const AppContext = createContext<AppContextType>({
  isGuest: false,
  isLoggedIn: false,
  isAdmin: false,
  exitGuestMode: () => {},
  unreadCount: 0,
  setUnreadCount: () => {},
})

export const useAppContext = () => useContext(AppContext)
