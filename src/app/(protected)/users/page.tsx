"use client"

/**
 * Gestión de usuarios: listado desde Firestore (users), búsqueda, ver detalle y activar/desactivar.
 * Solo ciertos roles pueden activar/desactivar. Usa toDateSafe para fechas (createdAt, lastConnection).
 */
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Users, Search, Eye, Loader2, Mail, Calendar, UserCheck, UserX, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { db, auth } from "@/lib/firebase"
import { updateDoc, doc, Timestamp } from "firebase/firestore"
import { useAuth } from "@/context/auth-context"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useRouter } from "next/navigation"
import { toDateSafe } from "@/lib/utils"

/** Usuario (desde API o Firestore) con rol y estado activo */
interface User {
  id: string
  name: string
  lastName: string
  email: string
  role: string
  active: boolean
  createdAt: Timestamp | number
  lastConnection?: Timestamp | number
}

export default function UsuariosPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [usuarios, setUsuarios] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)

  /* Solo sa y admin pueden listar usuarios; si otro rol entra por URL, no hacemos getDocs para evitar "Missing or insufficient permissions". */
  useEffect(() => {
    if (!user) {
      setIsLoading(false)
      return
    }
    if (user.role === "sa" || user.role === "admin") {
      loadUsuarios()
    } else {
      setIsLoading(false)
    }
  }, [user])

  /** Carga la lista de usuarios vía API (solo sa/admin). Si el token expiró, refresca la cookie y reintenta. */
  const loadUsuarios = async (retryAfterRefresh = true) => {
    setIsLoading(true)
    try {
      let res = await fetch("/api/users/list", { credentials: "include" })
      if (res.status === 401 && retryAfterRefresh) {
        const body = await res.json().catch(() => ({}))
        if (body?.code === "id-token-expired" && auth.currentUser) {
          try {
            const newToken = await auth.currentUser.getIdToken(true)
            await fetch("/api/auth/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: newToken }),
            })
            res = await fetch("/api/users/list", { credentials: "include" })
          } catch (refreshErr) {
            console.error("Error al refrescar token:", refreshErr)
            toast.error("Sesión expirada. Vuelve a iniciar sesión.")
            return
          }
        }
      }
      if (!res.ok) {
        if (res.status === 401) toast.error("Sesión no disponible. Vuelve a iniciar sesión.")
        else if (res.status === 403) toast.error("No tiene permisos para ver la lista de usuarios.")
        else toast.error("Error al cargar los usuarios")
        return
      }
      const data: User[] = await res.json()
      data.sort((a, b) => {
        const tA = toDateSafe(a.createdAt)?.getTime() ?? 0
        const tB = toDateSafe(b.createdAt)?.getTime() ?? 0
        return tB - tA
      })
      setUsuarios(data)
    } catch (error) {
      console.error("Error al cargar usuarios:", error)
      toast.error("Error al cargar los usuarios")
    } finally {
      setIsLoading(false)
    }
  }

  /** Activa o desactiva el usuario en Firestore (campo active) y recarga la lista */
  const toggleActive = async (usuario: User) => {
    try {
      const userRef = doc(db, "users", usuario.id)
      await updateDoc(userRef, {
        active: !usuario.active,
      })
      toast.success(`Usuario ${!usuario.active ? "activado" : "desactivado"} correctamente`)
      loadUsuarios()
    } catch (error) {
      console.error("Error al cambiar estado:", error)
      toast.error("Error al cambiar el estado del usuario")
    }
  }

  const verDetalles = (usuario: User) => {
    setSelectedUser(usuario)
    setIsDetailsOpen(true)
  }

  /** Devuelve el nombre legible del rol (sa → SuperAdmin, etc.) */
  const getRoleName = (role: string): string => {
    const roles: { [key: string]: string } = {
      sa: "SuperAdmin",
      admin: "Administrador",
      supervisor: "Supervisor",
      municipal: "Municipal",
      director: "Director"
    }
    return roles[role] || role
  }

  /** Devuelve clases CSS del badge según el rol */
  const getRoleBadgeColor = (role: string): string => {
    const colors: { [key: string]: string } = {
      sa: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      admin: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      supervisor: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      municipal: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      director: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
    }
    return colors[role] || "bg-gray-100 text-gray-800"
  }

  /** Usuarios filtrados por término de búsqueda (nombre, apellido, email, rol) */
  const filteredUsuarios = usuarios.filter((usuario) =>
    usuario.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    usuario.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    usuario.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getRoleName(usuario.role).toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="h-8 w-8 text-[#1a2da6]" />
              Gestión de Usuarios
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Administre los usuarios del sistema
            </p>
          </div>

          <Button
            onClick={() => router.push("/users/new")}
            className="bg-[#1a2da6] hover:bg-[#152389] text-white"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Nuevo Usuario
          </Button>
        </div>

        {/* Buscador */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Buscar por nombre, apellido, email o rol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Tabla de Usuarios */}
        <Card>
          <CardHeader>
            <CardTitle>Listado de Usuarios ({filteredUsuarios.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#1a2da6]" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Usuario
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Rol
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Fecha Creación
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredUsuarios.map((usuario) => (
                      <tr key={usuario.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-[#1a2da6] text-white">
                                {usuario.name?.charAt(0) || "U"}{usuario.lastName?.charAt(0) || ""}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {usuario.name} {usuario.lastName}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                UID: {usuario.id.substring(0, 8)}...
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                            <Mail className="h-4 w-4 text-gray-400" />
                            {usuario.email}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <Badge className={getRoleBadgeColor(usuario.role)}>
                            {getRoleName(usuario.role)}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          {usuario.active ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              <UserCheck className="h-3 w-3 mr-1" />
                              Activo
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                              <UserX className="h-3 w-3 mr-1" />
                              Inactivo
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            {toDateSafe(usuario.createdAt) ? format(toDateSafe(usuario.createdAt)!, "dd/MM/yyyy", { locale: es }) : "N/A"}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <div className="flex gap-2 justify-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => verDetalles(usuario)}
                              className="h-8"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              Ver
                            </Button>
                            <Button
                              size="sm"
                              variant={usuario.active ? "outline" : "default"}
                              onClick={() => toggleActive(usuario)}
                              className={usuario.active ? "h-8" : "h-8 bg-green-600 hover:bg-green-700"}
                            >
                              {usuario.active ? (
                                <>
                                  <UserX className="h-3.5 w-3.5 mr-1" />
                                  Desactivar
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3.5 w-3.5 mr-1" />
                                  Activar
                                </>
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredUsuarios.length === 0 && !isLoading && (
                  <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400">
                      No se encontraron usuarios
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de Detalles */}
        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Detalles del Usuario
              </DialogTitle>
            </DialogHeader>

            {selectedUser && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="bg-[#1a2da6] text-white text-xl">
                      {selectedUser.name?.charAt(0) || "U"}{selectedUser.lastName?.charAt(0) || ""}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {selectedUser.name} {selectedUser.lastName}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedUser.email}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Rol</p>
                    <Badge className={`${getRoleBadgeColor(selectedUser.role)} mt-1`}>
                      {getRoleName(selectedUser.role)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Estado</p>
                    {selectedUser.active ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 mt-1">
                        <UserCheck className="h-3 w-3 mr-1" />
                        Activo
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 mt-1">
                        <UserX className="h-3 w-3 mr-1" />
                        Inactivo
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Fecha de Creación</p>
                    <p className="text-sm text-gray-900 dark:text-white mt-1">
                      {toDateSafe(selectedUser.createdAt) ? format(toDateSafe(selectedUser.createdAt)!, "dd 'de' MMMM 'de' yyyy", { locale: es }) : "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Última Conexión</p>
                    <p className="text-sm text-gray-900 dark:text-white mt-1">
                      {toDateSafe(selectedUser.lastConnection) 
                        ? format(toDateSafe(selectedUser.lastConnection)!, "dd/MM/yyyy HH:mm", { locale: es })
                        : "Nunca"}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">ID de Usuario</p>
                  <p className="text-sm text-gray-900 dark:text-white mt-1 font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">
                    {selectedUser.id}
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setIsDetailsOpen(false)}
                  >
                    Cerrar
                  </Button>
                  <Button
                    variant={selectedUser.active ? "destructive" : "default"}
                    onClick={() => {
                      toggleActive(selectedUser)
                      setIsDetailsOpen(false)
                    }}
                    className={!selectedUser.active ? "bg-green-600 hover:bg-green-700" : ""}
                  >
                    {selectedUser.active ? (
                      <>
                        <UserX className="h-4 w-4 mr-2" />
                        Desactivar Usuario
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4 mr-2" />
                        Activar Usuario
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

