"use client"

/**
 * Configuración de funcionarios emisores del CDP (titular y subrogantes).
 * Solo un funcionario puede estar activo a la vez (el que emite CDPs).
 * La actividad/inactividad solo la puede cambiar un SuperAdmin del sistema.
 * Lee/escribe en Firestore configuracion/funcionarios; sa/admin pueden editar nombres.
 */
import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { UserCheck, Save, Loader2, Pen, X, Check } from "lucide-react"
import { toast } from "sonner"
import { db, auth, serverTimestamp } from "@/lib/firebase"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import { useAuth } from "@/context/auth-context"
import { getDisplayName } from "@/lib/utils"

/** Un funcionario emisor (titular o subrogante) con ruta de imagen de firma */
interface Funcionario {
  id: string
  nombre: string
  tipo: "titular" | "subrogante"
  firmaPath: string
  activo: boolean
}

/** Por defecto solo el titular está activo (solo uno puede emitir CDPs a la vez) */
const FUNCIONARIOS_DEFAULT: Funcionario[] = [
  {
    id: "titular",
    nombre: "Alejandro Rojas Pinto",
    tipo: "titular",
    firmaPath: "/firma.png",
    activo: true,
  },
  {
    id: "subrogante1",
    nombre: "Francisca Jepsen Valenzuela",
    tipo: "subrogante",
    firmaPath: "/firma_francisca_jepsen.png",
    activo: false,
  },
  {
    id: "subrogante2",
    nombre: "Karen Valdés González",
    tipo: "subrogante",
    firmaPath: "/firma_karen_valdes.png",
    activo: false,
  },
]

/** Rutas de imágenes de firma por id (para corregir paths guardados en Firestore) */
const FIRMA_PATHS: Record<string, string> = {
  titular: "/firma.png",
  subrogante1: "/firma_francisca_jepsen.png",
  subrogante2: "/firma_karen_valdes.png",
}

export default function ConfiguracionFuncionariosPage() {
  const { user } = useAuth()
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState("")

  const canEdit = user?.role === "sa" || user?.role === "admin"
  /** Solo el SuperAdmin puede activar/desactivar funcionarios (quién emite CDPs) */
  const canToggleActivo = user?.role === "sa"

  /** Carga configuracion/funcionarios desde Firestore y corrige firmaPath si viene desactualizado. getCancelled: opcional. */
  const loadFuncionarios = async (opts?: { getCancelled?: () => boolean }) => {
    const getCancelled = opts?.getCancelled ?? (() => false)
    setIsLoading(true)
    try {
      const docRef = doc(db, "configuracion", "funcionarios")
      const docSnap = await getDoc(docRef)
      if (getCancelled()) return
      if (docSnap.exists()) {
        const data = docSnap.data()
        let funcs: Funcionario[] = data.funcionarios || FUNCIONARIOS_DEFAULT

        let needsUpdate = false
        const nombreCorrectoSubrogante2 = "Karen Valdés González"
        funcs = funcs.map((f) => {
          let next = { ...f }
          const correctPath = FIRMA_PATHS[f.id]
          if (correctPath && f.firmaPath !== correctPath) {
            needsUpdate = true
            next = { ...next, firmaPath: correctPath }
          }
          // Corregir nombre subrogante2: "Valdes" → "Valdés"
          if (f.id === "subrogante2" && f.nombre === "Karen Valdes González") {
            needsUpdate = true
            next = { ...next, nombre: nombreCorrectoSubrogante2 }
          }
          return next
        })

        if (needsUpdate && !getCancelled()) {
          await setDoc(docRef, {
            funcionarios: funcs,
            actualizadoEn: serverTimestamp(),
          }, { merge: true })
        }
        if (!getCancelled()) setFuncionarios(funcs)
      } else {
        if (!getCancelled()) setFuncionarios(FUNCIONARIOS_DEFAULT)
        await setDoc(docRef, {
          funcionarios: FUNCIONARIOS_DEFAULT,
          actualizadoEn: serverTimestamp(),
        })
      }
    } catch (error) {
      if (!getCancelled()) {
        console.error("Error al cargar funcionarios:", error)
        toast.error("Error al cargar los funcionarios")
        setFuncionarios(FUNCIONARIOS_DEFAULT)
      }
    } finally {
      if (!getCancelled()) setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        loadFuncionarios({ getCancelled: () => cancelled })
      } else {
        setFuncionarios(FUNCIONARIOS_DEFAULT)
        setIsLoading(false)
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  /** Activa la edición del funcionario y carga su nombre en el campo de edición */
  const handleStartEdit = (func: Funcionario) => {
    setEditingId(func.id)
    setEditNombre(func.nombre)
  }

  /** Cancela la edición y limpia el estado */
  const handleCancelEdit = () => {
    setEditingId(null)
    setEditNombre("")
  }

  /** Guarda el nombre editado en Firestore (configuracion/funcionarios) y actualiza el estado local */
  const handleSaveEdit = async (id: string) => {
    if (!editNombre.trim()) {
      toast.error("El nombre no puede estar vacío")
      return
    }

    const updated = funcionarios.map((f) =>
      f.id === id ? { ...f, nombre: editNombre.trim() } : f
    )

    setIsSaving(true)
    try {
      const docRef = doc(db, "configuracion", "funcionarios")
      await setDoc(docRef, {
        funcionarios: updated,
        actualizadoPor: getDisplayName(user),
        actualizadoPorUid: user?.uid || null,
        actualizadoEn: serverTimestamp(),
      })

      setFuncionarios(updated)
      setEditingId(null)
      setEditNombre("")
      toast.success("Funcionario actualizado correctamente")
    } catch (error) {
      console.error("Error al guardar:", error)
      toast.error("Error al guardar los cambios")
    } finally {
      setIsSaving(false)
    }
  }

  /** Activa un funcionario y desactiva el resto (solo uno puede emitir CDPs). Solo SuperAdmin. */
  const toggleActivo = async (id: string) => {
    if (!canToggleActivo) return
    const func = funcionarios.find((f) => f.id === id)
    const nuevoActivo = !func?.activo
    const updated = funcionarios.map((f) =>
      f.id === id ? { ...f, activo: nuevoActivo } : { ...f, activo: false }
    )

    try {
      const docRef = doc(db, "configuracion", "funcionarios")
      await setDoc(docRef, {
        funcionarios: updated,
        actualizadoPor: getDisplayName(user),
        actualizadoPorUid: user?.uid || null,
        actualizadoEn: serverTimestamp(),
      })

      setFuncionarios(updated)
      const f = updated.find((f) => f.id === id)
      toast.success(
        nuevoActivo
          ? `${f?.nombre} es ahora el emisor de CDPs (los demás quedan inactivos)`
          : `${f?.nombre} desactivado`
      )
    } catch (error) {
      console.error("Error al cambiar estado:", error)
      toast.error("Error al cambiar el estado")
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#1a2da6]" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <UserCheck className="h-7 w-7 text-[#1a2da6]" />
            Funcionarios Emisores de CDP
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Funcionarios autorizados para firmar los Certificados de Disponibilidad Presupuestaria
          </p>
        </div>

        <div className="space-y-4">
          {funcionarios.map((func) => (
            <Card
              key={func.id}
              className={`border-l-4 ${
                func.tipo === "titular" ? "border-l-[#1a2da6]" : "border-l-[#adca1f]"
              } ${!func.activo ? "opacity-50" : ""}`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={func.tipo === "titular" ? "default" : "secondary"}
                        className={
                          func.tipo === "titular"
                            ? "bg-[#1a2da6]"
                            : "bg-[#adca1f] text-gray-900"
                        }
                      >
                        {func.tipo === "titular" ? "Titular" : "Subrogante"}
                      </Badge>
                      <Badge variant={func.activo ? "outline" : "destructive"}>
                        {func.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>

                    {editingId === func.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editNombre}
                          onChange={(e) => setEditNombre(e.target.value)}
                          className="max-w-md"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSaveEdit(func.id)}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 text-green-600" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelEdit}
                        >
                          <X className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {func.nombre}
                      </p>
                    )}

                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {func.tipo === "titular"
                        ? "DIRECTOR DE ADMINISTRACIÓN Y FINANZAS"
                        : "DIRECTOR(S) DE ADMINISTRACIÓN Y FINANZAS"}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Firma: {func.firmaPath}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {canEdit && editingId !== func.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStartEdit(func)}
                      >
                        <Pen className="h-4 w-4" />
                      </Button>
                    )}
                    {canToggleActivo && editingId !== func.id && (
                      <Button
                        size="sm"
                        variant={func.activo ? "outline" : "default"}
                        onClick={() => toggleActivo(func.id)}
                        className={!func.activo ? "bg-[#1a2da6] hover:bg-[#1a2da6]/90" : ""}
                      >
                        {func.activo ? "Desactivar" : "Activar"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-l-4 border-l-[#adca1f]">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              ¿Cómo funciona?
            </h3>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
              <li>Solo un funcionario puede estar activo a la vez: es el único que puede emitir CDPs (y ver "Crear CDP" en el menú)</li>
              <li>Activar/desactivar funcionarios solo lo puede hacer un SuperAdmin del sistema</li>
              <li>Al crear un CDP se usa el funcionario activo para la firma</li>
              <li>El cargo en el PDF será "DIRECTOR" para el titular y "DIRECTOR(S)" para subrogantes</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
