import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AUTH_KEY, STORE_KEY, onUnauthorized, readJSON } from '../api'
import { applyStoreColor, applyTheme, initialTheme } from '../lib/theme'

const AuthContext = createContext(null)

/**
 * AuthProvider — sesión del usuario, tienda activa y tema visual.
 *
 * - `user`: respuesta del login { token, user_id, username, nombre, rol, sede_id, sede }.
 * - `store`: tienda sobre la que se opera.
 *     · Administrador general: la que elige en el selector de tiendas
 *       (null = vista general / consolidado).
 *     · Resto de roles: siempre su tienda asignada.
 * - `theme`: 'light' | 'dark' (modos de color de Bootstrap 5.3).
 *
 * El color de la tienda activa se usa como color primario de la interfaz, de
 * modo que cada tienda se ve distinta y el usuario siempre sabe dónde trabaja.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readJSON(AUTH_KEY))
  const [store, setStore] = useState(() => readJSON(STORE_KEY))
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-bs-theme') || initialTheme())

  const persistStore = useCallback((s) => {
    if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s))
    else localStorage.removeItem(STORE_KEY)
    setStore(s)
  }, [])

  const login = useCallback((data) => {
    localStorage.setItem(AUTH_KEY, JSON.stringify(data))
    setUser(data)
    // Los roles de tienda quedan fijos en su tienda; el admin general empieza sin tienda.
    persistStore(data.rol === 'admin' ? null : data.sede || (data.sede_id ? { id: data.sede_id } : null))
  }, [persistStore])

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY)
    persistStore(null)
    setUser(null)
  }, [persistStore])

  /** Solo el administrador general cambia de tienda. */
  const selectStore = useCallback((s) => {
    if (user?.rol === 'admin') persistStore(s)
  }, [user?.rol, persistStore])

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  useEffect(() => {
    onUnauthorized(() => logout())
  }, [logout])

  useEffect(() => {
    applyTheme(theme)
    applyStoreColor(store?.color, theme)
  }, [theme, store?.color])

  const value = useMemo(() => ({
    user,
    store,
    theme,
    rol: user?.rol ?? '',
    isAuthenticated: !!user,
    isGeneralAdmin: user?.rol === 'admin',
    login,
    logout,
    selectStore,
    toggleTheme,
  }), [user, store, theme, login, logout, selectStore, toggleTheme])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
