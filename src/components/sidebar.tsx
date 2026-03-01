"use client"

/**
 * Barra lateral (sidebar) de navegación de la aplicación.
 *
 * SEGURIDAD (autorización en UI):
 * - Cada ítem del menú tiene un array "roles"; solo se muestran enlaces para los que user.role está en item.roles.
 *   Esto es control de acceso a nivel de interfaz: oculta opciones que el usuario no debería ver. La protección real
 *   de rutas la hace el middleware (cookie) y las APIs (verifyIdToken + rol). Ocultar el menú evita confusión y
 *   reduce intentos de acceder por URL directa (que igual serían rechazados por backend/Firestore).
 * - Además del rol, se usa useCanCreateCDP(): si el usuario no puede crear CDP (funcionario emisor inactivo),
 *   se ocultan "Crear CDP", "Historial CDP", "Configuración Cuentas" y "Configuración Entidad". Doble capa:
 *   rol permite ver la sección, pero el permiso de negocio (funcionario activo) puede ocultar enlaces concretos.
 * - handleLogout: llama a logOut() (borra cookie + signOut + redirect); en error hace location.href = "/login"
 *   para garantizar salida y no dejar sesión aparente en el cliente.
 */
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { toast } from "sonner"
import { useAuth } from "@/context/auth-context"
import { useCanCreateCDP } from "@/hooks/use-can-create-cdp"
import { logOut } from "@/lib/firebase"
import { useEffect, useState } from "react"
import { useSidebar } from "@/hooks/use-sidebar"
import {
  LogOut,
  Users,
  UserPlus,
  LayoutDashboard,
  X,
  Recycle,
  Menu,
  ShoppingCart,
  Package,
  History,
  FileText,
  Settings,
  Calendar,
  Building2,
  UserCheck,
} from "lucide-react"
import Image from "next/image"
/** SEGURIDAD: Definición de ítems con array "roles" — solo se muestran si user.role está en item.roles. */
const sidebarItems = [
  {
    title: "Panel de Control",  // titulo para el panel de control
    href: "/dashboard",   // ruta para el panel de control
    icon: LayoutDashboard, // icono para el panel de control
    roles: ["sa", "admin", "supervisor", "municipal" , "director"], // Todos los roles pueden ver el inicio
  },

  // Seccion para Ingresos
  {
    title: "Ingresos de Compras", // titulo para los ingresos de compras
    href: "/ingresos", // ruta para los ingresos de compras
    icon: ShoppingCart, // icono para los ingresos de compras
    roles: ["sa", "admin", "municipal",], // roles que pueden acceder a los ingresos de compras
  },
  {
    title: "Historial de Compras", // titulo para el historial de compras
    href: "/ingresos/historial", // ruta para el historial de compras
    icon: History, // icono para el historial de compras
    roles: ["sa", "admin", "municipal",], // roles que pueden acceder al historial de compras
  },
  {
    title: "Ingresos de Suministros",
    href: "/suministros",
    icon: Package,
    roles: ["sa", "admin", "municipal",],
  },
  {
    title: "Historial de Suministros",
    href: "/suministros/historial",
    icon: History,
    roles: ["sa", "admin", "municipal",],
  },
  {
    title: "Plan Anual de Compras",
    href: "/plan-anual-de-compras",
    icon: Calendar,
    roles: ["sa", "admin", "director", "supervisor"],
  },
  {
    title: "Crear CDP",
    href: "/cdp",
    icon: FileText,
    roles: ["sa", "admin", "director",],
  },
  {
    title: "Historial CDP",
    href: "/cdp/historial",
    icon: History,
    roles: ["sa", "admin", "director", "supervisor"],
  },
  // Sección de Configuración
  {
    title: "Configuración Cuentas",
    href: "/configuracion/cuentas",
    icon: Settings,
    roles: ["sa", "admin", "director", "supervisor"],
  },
  {
    title: "Configuración Entidad",
    href: "/configuracion/entidad",
    icon: Building2,
    roles: ["sa", "admin", "director"],
  },
  {
    title: "Funcionarios Emisores",
    href: "/configuracion/funcionarios",
    icon: UserCheck,
    roles: ["sa", "admin"],
  },
  // Sección de Usuarios (SuperAdmin y Admin)
  {
    title: "Usuarios",
    href: "/users",
    icon: Users,
    roles: ["sa", "admin"],
  },
  {
    title: "Nuevo Usuario",
    href: "/users/new",
    icon: UserPlus,
    roles: ["sa", "admin"],
  },
]

/** Devuelve el nombre legible del rol para mostrar en el sidebar */
// este es el nombre del rol en el sidebar que se muestra en el perfil del usuario
function translateRole(role: string): string {
  const roleTranslations: Record<string, string> = {
    sa: "SuperAdmin",
    admin: "Administrador",
    supervisor: "Supervisor",
    assistant: "Asistente",
    municipal: "Fiscalizador Municipal",
  }

  return roleTranslations[role] || role  // si el rol no está en el objeto roleTranslations, se devuelve el rol original
}

// este es el componente que renderiza el sidebar
export function Sidebar() {
  const pathname = usePathname() // ruta actual
  const { user } = useAuth() // usuario autenticado
  const { canCreateCDP } = useCanCreateCDP() // si el usuario puede crear CDP
  const router = useRouter() // router para redirigir
  const { isOpen, toggle, close } = useSidebar() // estado del sidebar
  const [isMobile, setIsMobile] = useState(false) // si el sidebar es mobile
  const [sidebarVisible, setSidebarVisible] = useState(false) // si el sidebar es visible

  // este es el efecto que verifica si el sidebar es mobile
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768) // si el ancho de la ventana es menor a 768px, se establece isMobile en true
    }

    checkIfMobile() // se verifica si el sidebar es mobile
    window.addEventListener("resize", checkIfMobile) // se agrega un evento para verificar si el sidebar es mobile cuando se cambia el tamaño de la ventana

    return () => { // se elimina el evento cuando el componente se desmonta
      window.removeEventListener("resize", checkIfMobile) // se elimina el evento cuando el componente se desmonta
    }
  }, [])

  // este es el efecto que verifica si el sidebar es visible
  useEffect(() => {
    setSidebarVisible(isOpen) // se establece el estado del sidebar en el estado del sidebar
  }, [isOpen])

  // este es el efecto que verifica si el sidebar es mobile

  // este es el efecto que cierra sesión
  useEffect(() => {
    if (isMobile) {
      close() // se cierra el sidebar
    }
  }, [pathname, isMobile, close])
  // este es el efecto que cierra sesión
  const handleLogout = async () => {
    try {
      toast.info("Cerrando sesión...")
      await logOut()
    } catch (error) {
      console.error("Error al cerrar sesión:", error)
      toast.error("Error al cerrar sesión")
      // SEGURIDAD: Forzar redirección a /login si falla logOut para no dejar sesión aparente en el cliente.
      window.location.href = "/login"
    }
  }

// acá, se obtiene el nombre completo del usuario
  const fullName = user ? `${user.name || ""} ${user.lastName || ""}`.trim() : "Usuario"

  // acá, se obtienen las iniciales del usuario para el avatar (nombre + apellido)
  const getInitials = () => {
    if (!user) return "U" // si el usuario no existe, se devuelve "U"
    const firstInitial = user.name ? user.name.charAt(0) : "" // se obtiene la primera inicial del nombre
    const lastInitial = user.lastName ? user.lastName.charAt(0) : "" // se obtiene la primera inicial del apellido
    return (firstInitial + lastInitial).toUpperCase() || "U" // se devuelve la primera inicial del nombre y apellido en mayúsculas
  }

  // acá, se filtran los items del menú por rol del usuario y se agrupan por sección (general, ingresos, cdp, etc.)
  const groupedItems = sidebarItems.reduce( // se agrupan los items del menú por sección
    (acc, item) => {
      if (!user || !user.role) { // si el usuario no existe o no tiene un rol, se devuelve el acc
        if (item.href === "/dashboard" || item.href === "/profile") {
          const section = item.href.includes("profile") ? "perfil" : "general"
          if (!acc[section]) acc[section] = [] // si la sección no existe, se crea
          acc[section].push(item) // se agrega el item a la sección
        }
        return acc // se devuelve el acc
      }


      // aca , lo que se hace es verificar si el item tiene el rol del usuario
      // si el item tiene el rol del usuario, se agrega a la sección
      // si el item no tiene el rol del usuario, se devuelve el acc sin agregar el item a la sección
      // el item.roles es el rol del item
      // el user.role es el rol del usuario
      // si el item tiene el rol del usuario, se agrega a la sección
      // si el item no tiene el rol del usuario, se devuelve el acc sin agregar el item a la sección

      // SEGURIDAD: Filtrar por rol; además ocultar enlaces de CDP y configuración si el usuario no puede crear CDP.
      if (item.roles.includes(user.role)) {
        if (item.href === "/cdp" && !canCreateCDP) return acc
        if (item.href === "/cdp/historial" && !canCreateCDP) return acc
        if (item.href === "/configuracion/cuentas" && !canCreateCDP) return acc
        if (item.href === "/configuracion/entidad" && !canCreateCDP) return acc
        let section = "general"
        if (item.href.includes("ingresos")) section = "ingresos"
        else if (item.href.includes("users")) section = "usuarios"
        else if (item.href.includes("profile")) section = "perfil"
        else if (item.href.includes("suministros")) section = "suministros"
        else if (item.href.includes("cdp")) section = "cdp"
        else if (item.href.includes("configuracion")) section = "configuracion"
        else if (item.href.includes("plan-anual-de-compras")) section = "plan-anual-de-compras"

        if (!acc[section]) acc[section] = []
        acc[section].push(item)
      }

      return acc
    },
    {} as Record<string, typeof sidebarItems>,
  )


  // aca, se definen los nombres de las secciones del sidebar
  const sectionNames: Record<string, string> = {
    general: "General",
    usuarios: "Usuarios",
    perfil: "Perfil",
    ingresos: "Ingresos",
    suministros: "Suministros",
    cdp: "CDP",
    configuracion: "Configuración",
    "plan-anual-de-compras": "Plan Anual de Compras",
  }


  // aca, se renderiza el sidebar

  return (
    <>
      {/* Botón para abrir el sidebar en móvil */}
      {isMobile && !sidebarVisible && (
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="fixed bottom-4 right-4 z-50 h-10 w-10 bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
        >
          <Menu className="h-4 w-4" />
        </Button>
      )}

      {/* Overlay para cerrar el sidebar al hacer clic fuera */}
      {isMobile && sidebarVisible && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={toggle}
          aria-hidden="true"
        />
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full flex-col bg-white border-r-2 border-gray-200 transition-transform duration-200 dark:bg-gray-900 dark:border-gray-800 shadow-xl",
          sidebarVisible ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          isMobile ? "w-64" : "w-60",
        )}
      >
        {/* Header del sidebar */}
        <div className="flex h-16 items-center justify-center border-b-2 border-gray-200 px-4 bg-linear-to-r from-gray-50 to-white dark:border-gray-800 dark:from-gray-900 dark:to-gray-900">
          <Link href="/dashboard" className="flex items-center justify-center gap-2.5 group">
            <div className="flex items-center justify-center">
              <img src="/logo.png" alt="Logo" className="w-40 h-40 mx-auto object-contain" />  
            </div>
            </Link>
        </div>
        {/* Contenido principal del sidebar */}
        <div className="flex-1 overflow-auto py-4 px-3"> 
          {Object.entries(groupedItems).map(([section, items]) => (
            <div key={section} className="mb-6">
              <h3 className="mb-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                {sectionNames[section] || section}
              </h3>
              <nav className="space-y-1">
                {items.map((item) => {
                  const isActive = pathname === item.href

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium border-l-4 transition-colors",
                        isActive
                          ? "bg-[#1a2da6] text-white border-[#adca1f] shadow-sm dark:bg-[#1a2da6] dark:text-white dark:border-[#adca1f]"
                          : "border-transparent text-gray-700 hover:bg-gray-100 hover:border-[#adca1f]/50 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:border-[#adca1f]/50",
                      )}
                    >
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                        isActive 
                          ? "bg-white/15"
                          : "bg-gray-100 dark:bg-gray-800"
                      )}>
                        <item.icon className="h-4 w-4" />
                      </div>
                      <span>{item.title}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Footer con perfil de usuario */}
        <div className="border-t-2 border-gray-200 p-2 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3 rounded-lg bg-white p-3 border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
            <Avatar className="h-10 w-10 ring-2 ring-[#adca1f]/30">
              <AvatarFallback className="bg-[#1a2da6] text-white text-xs font-semibold">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-semibold text-gray-900 dark:text-white">{fullName}</p>
              {user?.role && (
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{translateRole(user.role)}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-9 w-9 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
