"use client"

/**
 * Hook useCanCreateCDP: determina si el usuario actual puede crear CDP.
 *
 * SEGURIDAD:
 * - La capacidad de crear CDP depende del rol (sa, admin, director ven el enlace) y de que el usuario
 *   esté asociado a un "funcionario emisor" activo en Configuración. Si coincide con un funcionario
 *   pero está inactivo → canCreateCDP false (el formulario CDP y el sidebar ocultan/deshabilitan).
 * - simularFuncionario en la URL solo se acepta si user.role es "sa" o "admin"; valores permitidos
 *   están en SIMULAR_IDS para evitar inyección. Así solo admins pueden probar vistas como otro funcionario.
 * - Sin user se devuelve canCreateCDP false. Los datos de funcionarios se leen de Firestore (configuracion/funcionarios);
 *   las reglas exigen isAuthenticated(), así que solo usuarios logueados pueden cargar el doc.
 */
import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/context/auth-context"
import { getDisplayName } from "@/lib/utils"

/** Estructura de un funcionario emisor guardado en configuracion/funcionarios */
interface FuncionarioEmisor {
  id: string
  nombre: string
  tipo: "titular" | "subrogante"
  firmaPath: string
  activo: boolean
}

/** Normaliza un nombre para comparación (minúsculas, sin acentos) */
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
}

/** SEGURIDAD: Solo admin/sa pueden usar simularFuncionario; valores fijos para evitar inyección. */
const SIMULAR_IDS = ["titular", "subrogante1", "subrogante2"] as const

/**
 * Hook que devuelve si el usuario puede crear CDP y si la comprobación sigue cargando.
 */
export function useCanCreateCDP(): { canCreateCDP: boolean; loading: boolean } {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [canCreateCDP, setCanCreateCDP] = useState(true)
  const [loading, setLoading] = useState(true)

  // SEGURIDAD: simularFuncionario solo para sa/admin; simularId debe estar en whitelist SIMULAR_IDS.
  const simularId = searchParams.get("simularFuncionario")
  const isSimulando =
    (user?.role === "sa" || user?.role === "admin") &&
    simularId &&
    SIMULAR_IDS.includes(simularId as (typeof SIMULAR_IDS)[number])

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (!user) {
        setCanCreateCDP(false)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        // Documento único que contiene la lista de funcionarios emisores
        const docRef = doc(db, "configuracion", "funcionarios")
        const docSnap = await getDoc(docRef)
        const funcionarios: FuncionarioEmisor[] = docSnap.exists()
          ? (docSnap.data().funcionarios ?? [])
          : []

        if (cancelled) return

        let matchingFuncionario: FuncionarioEmisor | undefined

        if (isSimulando && simularId) {
          // Modo prueba: buscar por id (titular, subrogante1, subrogante2)
          matchingFuncionario = funcionarios.find((f) => f.id === simularId)
        } else {
          // Modo normal: buscar por nombre completo del usuario
          const userFullName = getDisplayName(user)
          const userNormalized = normalizeName(userFullName)
          matchingFuncionario = funcionarios.find(
            (f) => normalizeName(f.nombre) === userNormalized
          )
        }

        // SEGURIDAD: Permiso de crear CDP según si el funcionario emisor asociado está activo; sin coincidencia se permite.
        if (matchingFuncionario) {
          setCanCreateCDP(matchingFuncionario.activo)
        } else {
          setCanCreateCDP(true)
        }
      } catch {
        if (!cancelled) setCanCreateCDP(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    check()
    return () => {
      cancelled = true
    }
  }, [user?.uid, user?.name, user?.lastName, user?.role, isSimulando, simularId])

  return { canCreateCDP, loading }
}
