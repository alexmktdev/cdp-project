"use client"

/**
 * Configuración de la entidad emisora (nombre e ID codificador del estado).
 * Lee/escribe en Firestore configuracion/entidad. Roles sa, admin y director pueden editar.
 * Funcionarios emisores inactivos no pueden ver ni acceder (misma lógica que Crear CDP).
 */
import { useState, useEffect } from "react"  // importamos useState y useEffect de react
import Link from "next/link"  // importamos Link de next/link, para poder redirigir a la página de login
import { Card, CardContent } from "@/components/ui/card"  // importamos Card y CardContent de @/components/ui/card, para poder mostrar el formulario de configuración de la entidad
import { Button } from "@/components/ui/button"  // importamos Button de @/components/ui/button, para poder mostrar el botón de guardar la configuración de la entidad
import { Input } from "@/components/ui/input"  // importamos Input de @/components/ui/input, para poder mostrar el input del formulario de configuración de la entidad
import { Label } from "@/components/ui/label"  // importamos Label de @/components/ui/label, para poder mostrar el label del formulario de configuración de la entidad
import { Building2, Save, Loader2, ExternalLink, AlertCircle, LayoutDashboard } from "lucide-react"  // importamos Building2, Save, Loader2, ExternalLink, AlertCircle, LayoutDashboard de lucide-react, para poder mostrar los iconos de la página
import { toast } from "sonner"  // importamos toast de sonner, para poder mostrar los mensajes de error y éxito
import { db, serverTimestamp } from "@/lib/firebase"  // importamos db y serverTimestamp de @/lib/firebase, para poder conectar a la base de datos de firebase
import { doc, getDoc, setDoc } from "firebase/firestore"  // importamos doc, getDoc, setDoc de firebase/firestore, para poder conectar a la base de datos de firebase
import { useAuth } from "@/context/auth-context"  // importamos useAuth de @/context/auth-context, para poder obtener el usuario autenticado
import { useCanCreateCDP } from "@/hooks/use-can-create-cdp"  // importamos useCanCreateCDP de @/hooks/use-can-create-cdp, para poder verificar si el usuario puede crear CDP
import { getDisplayName } from "@/lib/utils"  // importamos getDisplayName de @/lib/utils, para poder obtener el nombre completo del usuario

/** Estructura del documento configuracion/entidad en Firestore, esto es como una clase en java */
interface EntidadConfig {
  nombre: string
  identificadorCodificador: string
}

// aca, se define la función que renderiza la página de configuración de la entidad
export default function ConfiguracionEntidadPage() {
  const { user } = useAuth()  // obtenemos el usuario autenticado
  const { canCreateCDP, loading: loadingCanCreateCDP } = useCanCreateCDP()  // obtenemos si el usuario puede crear CDP y si se está cargando
  const [nombre, setNombre] = useState("")  // estado para el nombre de la entidad
  const [identificadorCodificador, setIdentificadorCodificador] = useState("")  // estado para el identificador codificador de la entidad
  const [isLoading, setIsLoading] = useState(true)  // estado para si se está cargando la página
  const [isSaving, setIsSaving] = useState(false)  // estado para si se está guardando la configuración de la entidad

  /** SuperAdmin, Admin y Director pueden editar la configuración de entidad (y solo si son funcionario activo) */
  const canEdit = (user?.role === "sa" || user?.role === "admin" || user?.role === "director") && canCreateCDP

  // aca, se carga la configuración de la entidad desde firestore
  useEffect(() => {
    let cancelled = false // estado para si se ha cancelado la carga de la configuración de la entidad
    loadConfig({ getCancelled: () => cancelled }) // se carga la configuración de la entidad desde firestore
    return () => { cancelled = true } // se cancela la carga de la configuración de la entidad cuando el componente se desmonta
  }, [])

  /** Carga el documento configuracion/entidad desde Firestore. getCancelled: opcional. */
  const loadConfig = async (opts?: { getCancelled?: () => boolean }) => {
    const getCancelled = opts?.getCancelled ?? (() => false)
    setIsLoading(true)
    try {
      const docRef = doc(db, "configuracion", "entidad")
      const docSnap = await getDoc(docRef)
      if (getCancelled()) return
      if (docSnap.exists()) {
        const data = docSnap.data() as EntidadConfig
        if (!getCancelled()) {
          setNombre(data.nombre || "")
          setIdentificadorCodificador(data.identificadorCodificador || "")
        }
      }
    } catch (error) {
      if (!getCancelled()) {
        console.error("Error al cargar configuración:", error)
        toast.error("Error al cargar la configuración de la entidad")
      }
    } finally {
      if (!getCancelled()) setIsLoading(false)
    }
  }

  /** Guarda nombre e identificador en configuracion/entidad (merge) */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canEdit) {
      toast.error("No tiene permisos para modificar la configuración")
      return
    }

    if (!nombre.trim()) {
      toast.error("Por favor ingrese el nombre de la entidad")
      return
    }

    if (!identificadorCodificador.trim()) {
      toast.error("Por favor ingrese el Identificador del Codificador del Estado")
      return
    }

    setIsSaving(true)
    try {
      const docRef = doc(db, "configuracion", "entidad")
      await setDoc(docRef, {
        nombre: nombre.trim(),
        identificadorCodificador: identificadorCodificador.trim(),
        actualizadoPor: getDisplayName(user),
        actualizadoPorUid: user?.uid || null,
        actualizadoEn: serverTimestamp(),
      }, { merge: true })

      toast.success("Configuración guardada correctamente")
    } catch (error) {
      console.error("Error al guardar configuración:", error)
      toast.error("Error al guardar la configuración")
    } finally {
      setIsSaving(false)
    }
  }

  if (loadingCanCreateCDP) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#1a2da6]" />
      </div>
    )
  }

  if (!canCreateCDP) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-10 w-10 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  No puede acceder a Configuración de Entidad
                </h2>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Su usuario está vinculado a un funcionario emisor que no está activo en <strong>Configuración → Funcionarios Emisores</strong>.
                  Solo un SuperAdmin del sistema puede activar o desactivar quién emite CDPs.
                </p>
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/dashboard" className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    Ir al Panel de Control
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
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
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Building2 className="h-7 w-7 text-[#1a2da6]" />
            Configuración de la Entidad
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Datos de la entidad emisora que se incluirán en los Certificados de Disponibilidad Presupuestaria
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-l-4 border-l-[#1a2da6]">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#1a2da6]" />
                Datos de la Entidad
              </h3>

              <div className="space-y-4">
                {/* Nombre de la Entidad */}
                <div className="space-y-2">
                  <Label htmlFor="nombre" className="flex items-center gap-1.5 text-sm font-medium">
                    Nombre de la Entidad (Servicio) *
                  </Label>
                  <Input
                    id="nombre"
                    placeholder="Ej: Ilustre Municipalidad de Molina"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    disabled={!canEdit}
                    required
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Nombre oficial de la entidad tal como aparecerá en los CDP
                  </p>
                </div>

                {/* Identificador Codificador del Estado */}
                <div className="space-y-2">
                  <Label htmlFor="idCodificador" className="flex items-center gap-1.5 text-sm font-medium">
                    Identificador Codificador del Estado (ID) *
                  </Label>
                  <Input
                    id="idCodificador"
                    placeholder="Ej: 13702"
                    value={identificadorCodificador}
                    onChange={(e) => setIdentificadorCodificador(e.target.value)}
                    disabled={!canEdit}
                    required
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    Código asignado en el Codificador del Estado.
                    <a
                      href="https://codificador.digital.gob.cl/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1a2da6] hover:underline inline-flex items-center gap-0.5"
                    >
                      Consultar aquí <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Botón Guardar */}
          {canEdit && (
            <div className="flex justify-end">
              <Button
                type="submit"
                className="bg-[#1a2da6] hover:bg-[#1a2da6]/90 px-8"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Guardar Configuración
                  </>
                )}
              </Button>
            </div>
          )}
        </form>

        {/* Info adicional */}
        <Card className="border-l-4 border-l-[#adca1f]">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              ¿Para qué se usa esta información?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Según el Instructivo N° IN4/2026 de la Contraloría General de la República, cada
              Certificado de Disponibilidad Presupuestaria debe incluir el nombre de la entidad
              emisora y su Identificador del Codificador del Estado (ID) del gobierno digital.
              Estos datos se completarán automáticamente al crear un nuevo CDP.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
