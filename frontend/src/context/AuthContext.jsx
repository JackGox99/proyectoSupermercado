import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AUTH_KEY, STORE_KEY, onUnauthorized, readJSON } from '../api'

const AuthContext = createContext(null)

const DEFAULT_BRAND = '#4ADE80'

/**
 * AuthProvider — sesión del usuario y tienda activa.
 *
 * - `user`: respuesta del login { token, user_id, username, nombre, rol, sede_id, sede }.
 * - `store`: tienda sobre la que se opera.
 *     · Administrador general: la que elige en el selector de tiendas
 *       (null = vista general / consolidado).
 *     · Resto de roles: siempre su tienda asignada.
 *
 * La tienda activa define el color principal de la interfaz, de modo que cada
 * tienda se ve distinta y el usuario siempre sabe en cuál está trabajando.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readJSON(AUTH_KEY))
  const [store, setStore] = useState(() => readJSON(STORE_KEY))

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

  // Si la sesión expira (401) se cierra localmente.
  useEffect(() => {
    onUnauthorized(() => logout())
  }, [logout])

  // Color de la tienda activa como color principal de la interfaz.
  useEffect(() => {
    const color = store?.color || DEFAULT_BRAND
    document.documentElement.style.setProperty('--color-brand-primary', color)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  }, [store?.color])

  const value = useMemo(() => ({
    user,
    store,
    rol: user?.rol ?? '',
    isAuthenticated: !!user,
    isGeneralAdmin: user?.rol === 'admin',
    login,
    logout,
    selectStore,
  }), [user, store, login, logout, selectStore])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
