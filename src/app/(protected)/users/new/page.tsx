"use client"

/**
 * Página de alta de nuevo usuario (solo sa/admin).
 * Formulario: nombre, apellido, email, contraseña, confirmar contraseña y rol.
 * Envía los datos a la API POST /api/users/create, que crea el usuario en Firebase Auth y el documento en Firestore (users).
 * Tras éxito redirige a /users; muestra errores (email ya registrado, contraseña corta, etc.).
 */
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserPlus, Mail, Lock, User, Briefcase, ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
// No necesitamos db, doc, setDoc, serverTimestamp, createUserWithEmailAndPassword, getAuth del cliente
import { useRouter } from "next/navigation"

export default function NuevoUsuarioPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  /** Estados del formulario de nuevo usuario */
  const [nombre, setNombre] = useState("")
  const [apellido, setApellido] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmarPassword, setConfirmarPassword] = useState("")
  const [rol, setRol] = useState("")
  /** Mensaje de error visible en el formulario (ej. email ya registrado) */
  const [errorMensaje, setErrorMensaje] = useState("")

  /** Llama a la API de creación de usuario en el backend y redirige a /users */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nombre.trim() || !apellido.trim() || !email.trim() || !password || !rol) {
      toast.error("Por favor complete todos los campos")
      return
    }

    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres")
      return
    }

    if (password !== confirmarPassword) {
      toast.error("Las contraseñas no coinciden")
      return
    }

    setIsLoading(true)
    setErrorMensaje("")

    try {
      const response = await fetch("/api/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: nombre.trim(), lastName: apellido.trim(), email: email.trim().toLowerCase(), password: password, role: rol }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = "Error al crear el usuario"
        switch (response.status) {
          case 401:
            errorMessage = "No autorizado. Inicie sesión nuevamente."
            break
          case 403:
            errorMessage = "No tiene permisos para crear usuarios."
            break
          case 400:
            errorMessage = errorText || "Datos inválidos."
            break
          case 409:
            errorMessage = "Este correo ya está registrado. Use otro email."
            break
          default:
            errorMessage = errorText || "Error desconocido al crear el usuario."
        }
        setErrorMensaje(errorMessage)
        toast.error(errorMessage)
        return
      }

      toast.success("Usuario creado correctamente")
      
      // Resetear formulario
      setNombre("")
      setApellido("")
      setEmail("")
      setPassword("")
      setConfirmarPassword("")
      setRol("")

      // Redirigir a la lista de usuarios después de 1 segundo
      setTimeout(() => {
        router.push("/users")
      }, 1000)
    } catch (error: unknown) {
      console.error("Error al crear usuario:", error)
      setErrorMensaje("Error de red o conexión al servidor.")
      toast.error("Error de red o conexión al servidor.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/users")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <UserPlus className="h-8 w-8 text-[#1a2da6]" />
              Nuevo Usuario
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Complete el formulario para crear un nuevo usuario
            </p>
          </div>
        </div>

        {/* Formulario */}
        <Card>
          <CardHeader>
            <CardTitle>Información del Usuario</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {errorMensaje && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                  {errorMensaje}
                </div>
              )}
              {/* Información Personal */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <User className="h-5 w-5 text-[#1a2da6]" />
                  Información Personal
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nombre" className="flex items-center gap-1.5">
                      <User className="h-4 w-4 text-[#1a2da6]" />
                      Nombre *
                    </Label>
                    <Input
                      id="nombre"
                      placeholder="Ej: Juan"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="apellido" className="flex items-center gap-1.5">
                      <User className="h-4 w-4 text-[#1a2da6]" />
                      Apellido *
                    </Label>
                    <Input
                      id="apellido"
                      placeholder="Ej: Pérez"
                      value={apellido}
                      onChange={(e) => setApellido(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Información de Cuenta */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Mail className="h-5 w-5 text-[#1a2da6]" />
                  Información de Cuenta
                </h3>

                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-[#1a2da6]" />
                    Email *
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (errorMensaje) setErrorMensaje("")
                    }}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password" className="flex items-center gap-1.5">
                      <Lock className="h-4 w-4 text-[#1a2da6]" />
                      Contraseña *
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmarPassword" className="flex items-center gap-1.5">
                      <Lock className="h-4 w-4 text-[#1a2da6]" />
                      Confirmar Contraseña *
                    </Label>
                    <Input
                      id="confirmarPassword"
                      type="password"
                      placeholder="Repetir contraseña"
                      value={confirmarPassword}
                      onChange={(e) => setConfirmarPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Rol */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-[#1a2da6]" />
                  Rol y Permisos
                </h3>

                <div className="space-y-2">
                  <Label htmlFor="rol" className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4 text-[#1a2da6]" />
                    Rol del Usuario *
                  </Label>
                  <Select value={rol} onValueChange={setRol}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar rol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sa">SuperAdmin</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="director">Director</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="municipal">Municipal</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Define los permisos y accesos del usuario en el sistema
                  </p>
                </div>
              </div>

              {/* Botones */}
              <div className="flex justify-end gap-3 pt-6 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/users")}
                  disabled={isLoading}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="bg-[#1a2da6] hover:bg-[#152389]"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Crear Usuario
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

