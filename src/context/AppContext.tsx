import { createContext, useContext } from 'react'

interface AppContextType {
  isGuest: boolean
  isLoggedIn: boolean
  isAdmin: boolean
  exitGuestMode: () => void
}

export const AppContext = createContext<AppContextType>({
  isGuest: false,
  isLoggedIn: false,
  isAdmin: false,
  exitGuestMode: () => {},
})

export const useAppContext = () => useContext(AppContext)
