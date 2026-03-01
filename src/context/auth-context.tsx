"use client"

/**
 * Contexto de Autenticación de la Aplicación.
 *
 * SEGURIDAD:
 * - Fuente de verdad del usuario en cliente: Firebase Auth (onAuthStateChanged) + documento Firestore users/{uid}.
 * - checkSession(): 1) Si hay usuario en Auth, comprueba users/{uid}.active; si active === false, cierra sesión
 *   (signOut + POST /api/auth/logout) y redirige a /login — evita que un usuario desactivado siga usando la app.
 *   2) Si no hay usuario en Auth pero hay cookie "session=", limpia la cookie vía logout y redirige (estado inconsistente).
 * - Al cargar usuario desde Firestore se hace doble comprobación de active; si está inactivo no se setea user y se cierra sesión.
 * - En rutas no públicas, si no hay firebaseUser se redirige a /login para no mostrar contenido protegido.
 * - checkSession se ejecuta al montar y puede llamarse periódicamente desde el layout protegido (cada 5 min).
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import { onAuthStateChange, db, auth } from "@/lib/firebase"
import { useRouter } from "next/navigation"
import { doc, getDoc } from "firebase/firestore"
import { toDateSafe } from "@/lib/utils"

/** 
 * Interfaz ExtendedUser: Define la estructura del usuario con datos extendidos.
 * Combina información básica de Firebase Auth con campos personalizados de Firestore.
 */
interface ExtendedUser {
  uid: string               // ID único del usuario
  name: string              // Nombre del funcionario
  lastName: string          // Apellido del funcionario
  email: string | null      // Correo electrónico
  lastConnection: Date | null // Fecha de última conexión
  role: string              // Rol en el sistema (admin, user, etc.)
  displayName: string | null // Nombre para mostrar (Firebase Auth)
  photoURL: string | null   // URL de la foto de perfil
  emailVerified: boolean    // Si el correo ha sido verificado
  active: boolean           // Si la cuenta está activa o deshabilitada
  companyId: string         // ID de la entidad a la que pertenece
  branchIds: string[]       // IDs de las sucursales asignadas
  createdAt?: Date | null   // Fecha de creación de la cuenta
  updatedAt?: Date | null   // Fecha de última actualización
}

/** 
 * Definición del tipo para el valor que proveerá el contexto.
 */
interface AuthContextType {
  user: ExtendedUser | null      // El usuario actual o null si no está logueado
  loading: boolean               // Estado de carga inicial
  checkSession: () => Promise<boolean> // Función para validar la sesión manualmente
}

// Creación del contexto con valores por defecto
const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  checkSession: async () => false,
})

/** 
 * Hook personalizado para acceder fácilmente al contexto de autenticación.
 */
export const useAuth = () => useContext(AuthContext)

/** 
 * Componente Proveedor que envuelve la aplicación para dar acceso al estado de auth.
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<ExtendedUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  /** 
   * SEGURIDAD: Verificación de sesión — usuario activo en Firestore y consistencia cookie/Auth.
   * Si el usuario fue desactivado por un admin, se fuerza cierre de sesión y redirect para no dejar acceso residual.
   */
  const checkSession = useCallback(async (): Promise<boolean> => {
    try {
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid))
        
        if (userDoc.exists() && userDoc.data().active === false) {
          await auth.signOut()
          await fetch("/api/auth/logout", { method: "POST" })
          router.push("/login")
          return false
        }
        return true
      }

      // Cookie sin usuario en Auth: limpiar cookie y redirigir para evitar estado inconsistente.
      const hasCookie = document.cookie.includes("session=")
      if (hasCookie) {
        await fetch("/api/auth/logout", {
          method: "POST",
        })
        router.push("/login")
        return false
      }

      return false
    } catch (error) {
      console.error("Error al verificar la sesión:", error)
      return false
    }
  }, [router])

  /**
   * Efecto principal que se suscribe a los cambios de estado de Firebase Auth.
   * Se encarga de cargar los datos de Firestore cada vez que un usuario inicia sesión.
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Validar que la sesión sea correcta antes de cargar datos
          const isSessionValid = await checkSession()

          if (!isSessionValid) {
            setUser(null)
            setLoading(false)
            router.push("/login")
            return
          }

          // Obtener datos adicionales desde la colección 'users' de Firestore
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid))

          if (userDoc.exists()) {
            const userData = userDoc.data()

            // SEGURIDAD: Doble comprobación de active antes de setear user; rechazar cuentas desactivadas.
            if (userData.active === false) {
              await auth.signOut()
              await fetch("/api/auth/logout", { method: "POST" })
              setUser(null)
              setLoading(false)
              return
            }

            // Construir el objeto de usuario extendido
            setUser({
              uid: firebaseUser.uid,
              name: userData.name || "",
              lastName: userData.lastName || "",
              email: firebaseUser.email,
              lastConnection: toDateSafe(userData.lastConnection) ?? null,
              role: userData.role || "user",
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              emailVerified: firebaseUser.emailVerified,
              active: userData.active !== false,
              companyId: userData.companyId || "",
              branchIds: userData.branchIds || [],
              createdAt: toDateSafe(userData.createdAt) ?? null,
              updatedAt: toDateSafe(userData.updatedAt) ?? null,
            })
          } else {
            // Si el usuario está en Auth pero no en Firestore (caso raro), usar datos básicos
            let name = ""
            let lastName = ""

            if (firebaseUser.displayName) {
              const nameParts = firebaseUser.displayName.split(" ")
              name = nameParts[0] || ""
              lastName = nameParts.slice(1).join(" ") || ""
            }

            setUser({
              uid: firebaseUser.uid,
              name: name,
              lastName: lastName,
              email: firebaseUser.email,
              lastConnection: null,
              role: "user",
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              emailVerified: firebaseUser.emailVerified,
              active: true,
              companyId: "",
              branchIds: [],
              createdAt: null,
              updatedAt: null,
            })
          }
        } catch (error) {
          console.error("Error al obtener datos extendidos del usuario:", error)
          // Fallback a datos básicos en caso de error de red o permisos
          setUser({
            uid: firebaseUser.uid,
            name: "",
            lastName: "",
            email: firebaseUser.email,
            lastConnection: null,
            role: "user",
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified,
            active: true,
            companyId: "",
            branchIds: [],
            createdAt: null,
            updatedAt: null,
          })
        }
      } else {
        setUser(null)
        // SEGURIDAD: En rutas no públicas, redirigir a login si no hay usuario (p. ej. sesión expirada en otra pestaña).
        const currentPath = window.location.pathname
        const publicPaths = ["/", "/login", "/forgot-password"]
        if (!publicPaths.includes(currentPath)) {
          router.push("/login")
        }
      }

      // Finalizar estado de carga inicial
      setLoading(false)
    })

    // Ejecutar verificación inicial
    checkSession()

    // Limpiar suscripción al desmontar el componente
    return () => unsubscribe()
  }, [router, checkSession])

  return (
    <AuthContext.Provider value={{ user, loading, checkSession }}>
      {children}
    </AuthContext.Provider>
  )
}
