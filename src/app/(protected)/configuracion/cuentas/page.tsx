"use client"

/**
 * Configuración de cuentas presupuestarias: listado, crear/editar, carga masiva,
 * ver CDPs asociados y bitácora por cuenta. Permisos por rol (supervisor solo lectura).
 * Si el usuario es funcionario emisor inactivo (no puede crear CDP), tampoco puede modificar cuentas.
 */
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Pencil, Eye, Search, DollarSign, Upload, Download, Loader2, FileText, X, ChevronLeft, ChevronRight, History, AlertCircle, LayoutDashboard } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn, toDateSafe, getDisplayName } from "@/lib/utils"
import { toast } from "sonner"
import { db } from "@/lib/firebase"
import { collection, addDoc, getDocs, updateDoc, doc, query, orderBy, where, Timestamp, serverTimestamp } from "firebase/firestore"
import { useAuth } from "@/context/auth-context"
import { useCanCreateCDP } from "@/hooks/use-can-create-cdp"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"

/** Cuenta presupuestaria en Firestore con imputación (subtítulo, ítem, asignación, subasignación) */
interface Cuenta {
  id: string
  codigo: string
  denominacion: string
  presupuestoTotal: number
  presupuestoDisponible: number
  subtitulo?: string
  item?: string
  asignacion?: string
  subasignacion?: string
  creadoPor: string
  creadoEn: Timestamp
  actualizadoEn: Timestamp
}

/** CDP resumido para el diálogo "CDPs de esta cuenta" */
interface CDP {
  id: string
  cdpNumero: string
  fecha: Timestamp
  montoDisponibilidad: number
  areaGestion: string
  nombreSolicitante: string
  destinoDisponibilidad: string
  estado: string
  creadoPor: string
  creadoEn: Timestamp
}

/** Registro de la colección bitacora_cuentas */
interface RegistroBitacora {
  id: string
  cuentaId: string
  codigoCuenta: string
  tipoAccion: "creacion" | "edicion" | "recalculo" | "ajuste_cdp" | "cdp_creado" | "cdp_editado" | "cdp_eliminado"
  descripcion: string
  valorAnterior?: any
  valorNuevo?: any
  realizadoPor: string
  realizadoPorUid: string
  fecha: Timestamp
  cdpId?: string
  cdpNumero?: string
}

export default function ConfiguracionCuentasPage() {
  const { user } = useAuth()
  const { canCreateCDP, loading: loadingCanCreateCDP } = useCanCreateCDP()
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isMassiveUploadOpen, setIsMassiveUploadOpen] = useState(false)
  const [selectedCuenta, setSelectedCuenta] = useState<Cuenta | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isCDPDialogOpen, setIsCDPDialogOpen] = useState(false)
  const [cdps, setCdps] = useState<CDP[]>([])
  const [isLoadingCDPs, setIsLoadingCDPs] = useState(false)
  const [cuentaParaCDPs, setCuentaParaCDPs] = useState<Cuenta | null>(null)

  const [isBitacoraDialogOpen, setIsBitacoraDialogOpen] = useState(false)
  const [bitacora, setBitacora] = useState<RegistroBitacora[]>([])
  const [isLoadingBitacora, setIsLoadingBitacora] = useState(false)
  const [cuentaParaBitacora, setCuentaParaBitacora] = useState<Cuenta | null>(null)
  const [currentBitacoraPage, setCurrentBitacoraPage] = useState(1)
  const bitacoraItemsPerPage = 10

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const isSupervisor = user?.role === "supervisor"
  const canEdit = !isSupervisor && canCreateCDP

  const [codigo, setCodigo] = useState("")
  const [denominacion, setDenominacion] = useState("")
  const [presupuestoTotal, setPresupuestoTotal] = useState("")
  const [presupuestoDisplay, setPresupuestoDisplay] = useState("")
  const [subtitulo, setSubtitulo] = useState("")
  const [itemPres, setItemPres] = useState("")
  const [asignacion, setAsignacion] = useState("")
  const [subasignacion, setSubasignacion] = useState("")

  /** Carga todas las cuentas presupuestarias desde Firestore ordenadas por código. getCancelled: opcional. */
  const loadCuentas = async (opts?: { getCancelled?: () => boolean }) => {
    const getCancelled = opts?.getCancelled ?? (() => false)
    try {
      const q = query(collection(db, "cuentas"), orderBy("codigo", "asc"))
      const querySnapshot = await getDocs(q)
      if (getCancelled()) return
      const cuentasData: Cuenta[] = []
      querySnapshot.forEach((doc) => {
        cuentasData.push({ id: doc.id, ...doc.data() } as Cuenta)
      })
      if (!getCancelled()) setCuentas(cuentasData)
    } catch (error) {
      if (!getCancelled()) {
        console.error("Error al cargar cuentas:", error)
        toast.error("Error al cargar las cuentas")
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    loadCuentas({ getCancelled: () => cancelled })
    return () => { cancelled = true }
  }, [])

  /** Carga CDPs asociados a una cuenta y abre el diálogo de listado */
  const loadCDPs = async (cuenta: Cuenta) => {
    setIsLoadingCDPs(true)
    setCuentaParaCDPs(cuenta)
    setIsCDPDialogOpen(true)
    
    try {
      // Intentar con orderBy primero
      let q = query(
        collection(db, "cdp"),
        where("cuentaId", "==", cuenta.id),
        orderBy("fecha", "desc")
      )
      
      try {
        const querySnapshot = await getDocs(q)
        const cdpsData: CDP[] = []
        querySnapshot.forEach((doc) => {
          cdpsData.push({ id: doc.id, ...doc.data() } as CDP)
        })
        // Ordenar por fecha (toDateSafe por si fecha no es Timestamp)
        cdpsData.sort((a, b) => {
          const tA = toDateSafe(a.fecha)?.getTime() ?? 0
          const tB = toDateSafe(b.fecha)?.getTime() ?? 0
          return tB - tA
        })
        setCdps(cdpsData)
      } catch (orderError: any) {
        // Si falla por falta de índice, intentar sin orderBy
        if (orderError.code === 'failed-precondition') {
          console.warn("Índice compuesto no encontrado, cargando sin ordenar")
          q = query(
            collection(db, "cdp"),
            where("cuentaId", "==", cuenta.id)
          )
          const querySnapshot = await getDocs(q)
          const cdpsData: CDP[] = []
          querySnapshot.forEach((doc) => {
            cdpsData.push({ id: doc.id, ...doc.data() } as CDP)
          })
          // Ordenar por fecha (toDateSafe por si fecha no es Timestamp)
          cdpsData.sort((a, b) => {
            const tA = toDateSafe(a.fecha)?.getTime() ?? 0
            const tB = toDateSafe(b.fecha)?.getTime() ?? 0
            return tB - tA
          })
          setCdps(cdpsData)
        } else {
          throw orderError
        }
      }
    } catch (error) {
      console.error("Error al cargar CDPs:", error)
      toast.error("Error al cargar los CDPs. Verifique la consola para más detalles.")
      setCdps([])
    } finally {
      setIsLoadingCDPs(false)
    }
  }

  /** Recalcula presupuesto disponible según CDPs de la cuenta, actualiza Firestore y registra en bitácora */
  const recalcularPresupuesto = async (cuenta: Cuenta) => {
    try {
      // Obtener todos los CDPs de esta cuenta
      const q = query(
        collection(db, "cdp"),
        where("cuentaId", "==", cuenta.id)
      )
      const querySnapshot = await getDocs(q)
      
      // Sumar todos los montos
      let totalGastado = 0
      querySnapshot.forEach((doc) => {
        const cdpData = doc.data()
        totalGastado += cdpData.montoDisponibilidad || 0
      })
      
      // Calcular nuevo presupuesto disponible
      const nuevoPresupuestoDisponible = cuenta.presupuestoTotal - totalGastado
      
      // Actualizar en Firebase
      const cuentaRef = doc(db, "cuentas", cuenta.id)
      await updateDoc(cuentaRef, {
        presupuestoDisponible: nuevoPresupuestoDisponible,
        actualizadoEn: serverTimestamp(),
      })
      
      // Registrar en bitácora
      await registrarBitacora(
        cuenta.id,
        cuenta.codigo,
        "recalculo",
        `Presupuesto recalculado. Gastado: $${formatMonto(totalGastado)}. Nuevo disponible: $${formatMonto(nuevoPresupuestoDisponible)}`,
        { presupuestoDisponible: cuenta.presupuestoDisponible },
        { presupuestoDisponible: nuevoPresupuestoDisponible }
      )
      
      console.log(`✅ Presupuesto recalculado para ${cuenta.codigo}:`)
      console.log(`   Total: $${cuenta.presupuestoTotal.toLocaleString("es-CL")}`)
      console.log(`   Gastado: $${totalGastado.toLocaleString("es-CL")}`)
      console.log(`   Disponible: $${nuevoPresupuestoDisponible.toLocaleString("es-CL")}`)
      
      return { totalGastado, nuevoPresupuestoDisponible }
    } catch (error) {
      console.error("Error al recalcular presupuesto:", error)
      throw error
    }
  }

  // Función para registrar en la bitácora
  const registrarBitacora = async (
    cuentaId: string,
    codigoCuenta: string,
    tipoAccion: "creacion" | "edicion" | "recalculo" | "ajuste_cdp",
    descripcion: string,
    valorAnterior?: any,
    valorNuevo?: any
  ) => {
    try {
      await addDoc(collection(db, "bitacora_cuentas"), {
        cuentaId,
        codigoCuenta,
        tipoAccion,
        descripcion,
        valorAnterior: valorAnterior || null,
        valorNuevo: valorNuevo || null,
        realizadoPor: getDisplayName(user),
        realizadoPorUid: user?.uid || null,
        fecha: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error al registrar en bitácora:", error)
    }
  }

  /** Carga registros de bitácora para una cuenta y abre el diálogo de bitácora */
  const loadBitacora = async (cuenta: Cuenta) => {
    setIsLoadingBitacora(true)
    setCuentaParaBitacora(cuenta)
    setIsBitacoraDialogOpen(true)
    setCurrentBitacoraPage(1)
    
    try {
      let q = query(
        collection(db, "bitacora_cuentas"),
        where("cuentaId", "==", cuenta.id),
        orderBy("fecha", "desc")
      )
      
      try {
        const querySnapshot = await getDocs(q)
        const bitacoraData: RegistroBitacora[] = []
        querySnapshot.forEach((doc) => {
          bitacoraData.push({ id: doc.id, ...doc.data() } as RegistroBitacora)
        })
        setBitacora(bitacoraData)
      } catch (orderError: any) {
        if (orderError.code === 'failed-precondition') {
          console.warn("Índice compuesto no encontrado, cargando sin ordenar")
          q = query(
            collection(db, "bitacora_cuentas"),
            where("cuentaId", "==", cuenta.id)
          )
          const querySnapshot = await getDocs(q)
          const bitacoraData: RegistroBitacora[] = []
          querySnapshot.forEach((doc) => {
            bitacoraData.push({ id: doc.id, ...doc.data() } as RegistroBitacora)
          })
          // Ordenar por fecha (toDateSafe por si fecha no es Timestamp)
          bitacoraData.sort((a, b) => {
            const tA = toDateSafe(a.fecha)?.getTime() ?? 0
            const tB = toDateSafe(b.fecha)?.getTime() ?? 0
            return tB - tA
          })
          setBitacora(bitacoraData)
        } else {
          throw orderError
        }
      }
    } catch (error) {
      console.error("Error al cargar bitácora:", error)
      toast.error("Error al cargar la bitácora")
      setBitacora([])
    } finally {
      setIsLoadingBitacora(false)
    }
  }

  // Función para obtener el nombre del área de gestión
  const getAreaGestionNombre = (area: string): string => {
    const areas: { [key: string]: string } = {
      "1": "Gestión Interna",
      "2": "Servicios Comunitarios",
      "3": "Actividades Municipales",
      "4": "Programas Sociales",
      "5": "Programas Recreacionales",
      "6": "Programas Culturales"
    }
    return areas[area] || area
  }
  
  // Función para obtener el nombre descriptivo de la acción
  const getTipoAccionNombre = (tipo: string): string => {
    const tipos: { [key: string]: string } = {
      "creacion": "Creación",
      "edicion": "Edición",
      "recalculo": "Recálculo",
      "ajuste_cdp": "Ajuste por CDP",
      "cdp_creado": "CDP creado",
      "cdp_editado": "CDP editado",
      "cdp_eliminado": "CDP eliminado"
    }
    return tipos[tipo] || tipo
  }
  
  // Función para obtener el color del badge según el tipo de acción
  const getTipoAccionColor = (tipo: string): string => {
    const colores: { [key: string]: string } = {
      "creacion": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      "edicion": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      "recalculo": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      "ajuste_cdp": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      "cdp_creado": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
      "cdp_editado": "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200",
      "cdp_eliminado": "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200"
    }
    return colores[tipo] || "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
  }

  const formatNumber = (value: string): string => {
    const numbers = value.replace(/\D/g, "")
    if (!numbers) return ""
    return Number(numbers).toLocaleString("es-CL")
  }

  const formatMonto = (monto: number): string => monto.toLocaleString("es-CL")

  /** Actualiza presupuesto total (valor numérico) y su representación formateada en pantalla */
  const handlePresupuestoChange = (value: string) => {
    const cleanValue = value.replace(/\D/g, "")
    setPresupuestoTotal(cleanValue)
    setPresupuestoDisplay(formatNumber(value))
  }

  /** Crea o actualiza la cuenta en Firestore; si es edición actualiza presupuesto y registra en bitácora */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!codigo.trim() || !denominacion.trim() || !presupuestoTotal) {
      toast.error("Por favor complete todos los campos")
      return
    }

    setIsLoading(true)

    try {
      if (selectedCuenta) {
        const cuentaRef = doc(db, "cuentas", selectedCuenta.id)
        const nuevoPresupuestoTotal = Number(presupuestoTotal)
        const diferencia = nuevoPresupuestoTotal - selectedCuenta.presupuestoTotal
        const nuevoPresupuestoDisponible = selectedCuenta.presupuestoDisponible + diferencia
        
        await updateDoc(cuentaRef, {
          codigo: codigo.toUpperCase(),
          denominacion: denominacion,
          presupuestoTotal: nuevoPresupuestoTotal,
          presupuestoDisponible: nuevoPresupuestoDisponible,
          subtitulo: subtitulo.trim(),
          item: itemPres.trim(),
          asignacion: asignacion.trim(),
          subasignacion: subasignacion.trim(),
          actualizadoEn: serverTimestamp(),
        })
        
        // Registrar cambios en bitácora
        const cambios = []
        if (selectedCuenta.codigo !== codigo.toUpperCase()) {
          cambios.push(`Código: ${selectedCuenta.codigo} → ${codigo.toUpperCase()}`)
        }
        if (selectedCuenta.denominacion !== denominacion) {
          cambios.push(`Denominación: "${selectedCuenta.denominacion}" → "${denominacion}"`)
        }
        if (selectedCuenta.presupuestoTotal !== nuevoPresupuestoTotal) {
          cambios.push(`Presupuesto Total: $${formatMonto(selectedCuenta.presupuestoTotal)} → $${formatMonto(nuevoPresupuestoTotal)}`)
        }
        if ((selectedCuenta.subtitulo || "") !== subtitulo.trim()) {
          cambios.push(`Subtítulo: "${selectedCuenta.subtitulo || ""}" → "${subtitulo.trim()}"`)
        }
        if ((selectedCuenta.item || "") !== itemPres.trim()) {
          cambios.push(`Ítem: "${selectedCuenta.item || ""}" → "${itemPres.trim()}"`)
        }
        if ((selectedCuenta.asignacion || "") !== asignacion.trim()) {
          cambios.push(`Asignación: "${selectedCuenta.asignacion || ""}" → "${asignacion.trim()}"`)
        }
        if ((selectedCuenta.subasignacion || "") !== subasignacion.trim()) {
          cambios.push(`Subasignación: "${selectedCuenta.subasignacion || ""}" → "${subasignacion.trim()}"`)
        }
        
        if (cambios.length > 0) {
          await registrarBitacora(
            selectedCuenta.id,
            codigo.toUpperCase(),
            "edicion",
            `Cuenta editada. Cambios: ${cambios.join(", ")}`,
            {
              codigo: selectedCuenta.codigo,
              denominacion: selectedCuenta.denominacion,
              presupuestoTotal: selectedCuenta.presupuestoTotal,
              presupuestoDisponible: selectedCuenta.presupuestoDisponible
            },
            {
              codigo: codigo.toUpperCase(),
              denominacion: denominacion,
              presupuestoTotal: nuevoPresupuestoTotal,
              presupuestoDisponible: nuevoPresupuestoDisponible
            }
          )
        }
        
        toast.success("Cuenta actualizada correctamente")
      } else {
        // Crear nueva cuenta
        const docRef = await addDoc(collection(db, "cuentas"), {
          codigo: codigo.toUpperCase(),
          denominacion: denominacion,
          presupuestoTotal: Number(presupuestoTotal),
          presupuestoDisponible: Number(presupuestoTotal),
          subtitulo: subtitulo.trim(),
          item: itemPres.trim(),
          asignacion: asignacion.trim(),
          subasignacion: subasignacion.trim(),
          creadoPor: getDisplayName(user),
          creadoPorUid: user?.uid || null,
          creadoEn: serverTimestamp(),
          actualizadoEn: serverTimestamp(),
        })
        
        // Registrar creación en bitácora
        await registrarBitacora(
          docRef.id,
          codigo.toUpperCase(),
          "creacion",
          `Cuenta creada con presupuesto inicial de $${formatMonto(Number(presupuestoTotal))}`,
          null,
          {
            codigo: codigo.toUpperCase(),
            denominacion: denominacion,
            presupuestoTotal: Number(presupuestoTotal),
            presupuestoDisponible: Number(presupuestoTotal)
          }
        )
        
        toast.success("Cuenta creada correctamente")
      }

      handleReset()
      setIsDialogOpen(false)
      loadCuentas()
    } catch (error) {
      console.error("Error al guardar cuenta:", error)
      toast.error("Error al guardar la cuenta")
    } finally {
      setIsLoading(false)
    }
  }

  // Función para procesar CSV
  /** Parsea el texto CSV/TSV y devuelve array de objetos cuenta (codigo, denominacion, monto, imputación) */
  const procesarCSV = (texto: string): { codigo: string; denominacion: string; monto: number; subtitulo: string; item: string; asignacion: string; subasignacion: string }[] => {
    const lineas = texto.split('\n').filter(linea => linea.trim() !== '')
    const cuentasCSV: { codigo: string; denominacion: string; monto: number; subtitulo: string; item: string; asignacion: string; subasignacion: string }[] = []

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i].trim()
      
      const partes = linea.includes('\t') ? linea.split('\t') : linea.split(',')
      
      if (partes.length >= 2) {
        const codigo = partes[0].trim()
        const denominacion = partes[1].trim()
        const monto = partes.length >= 3 ? parseFloat(partes[2].trim().replace(/[^0-9.-]/g, '')) : 0
        const sub = partes.length >= 4 ? partes[3].trim() : ""
        const itm = partes.length >= 5 ? partes[4].trim() : ""
        const asig = partes.length >= 6 ? partes[5].trim() : ""
        const subasig = partes.length >= 7 ? partes[6].trim() : ""
        
        if (codigo && denominacion) {
          cuentasCSV.push({
            codigo: codigo,
            denominacion: denominacion,
            monto: isNaN(monto) ? 0 : monto,
            subtitulo: sub,
            item: itm,
            asignacion: asig,
            subasignacion: subasig,
          })
        }
      }
    }

    return cuentasCSV
  }

  /** Lee el CSV, parsea filas (procesarCSV), crea cada cuenta en Firestore y actualiza progreso */
  const handleMassiveUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    if (!archivo) return

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const texto = await archivo.text()
      const cuentasCSV = procesarCSV(texto)

      if (cuentasCSV.length === 0) {
        toast.error("No se encontraron cuentas válidas en el archivo")
        setIsUploading(false)
        return
      }

      toast.info(`Procesando ${cuentasCSV.length} cuentas...`)

      let creadas = 0
      let errores = 0

      for (let i = 0; i < cuentasCSV.length; i++) {
        try {
          const cuenta = cuentasCSV[i]
          await addDoc(collection(db, "cuentas"), {
            codigo: cuenta.codigo.toUpperCase(),
            denominacion: cuenta.denominacion,
            presupuestoTotal: cuenta.monto,
            presupuestoDisponible: cuenta.monto,
            subtitulo: cuenta.subtitulo,
            item: cuenta.item,
            asignacion: cuenta.asignacion,
            subasignacion: cuenta.subasignacion,
            creadoPor: getDisplayName(user),
            creadoPorUid: user?.uid || null,
            creadoEn: serverTimestamp(),
            actualizadoEn: serverTimestamp(),
          })
          creadas++
          setUploadProgress(Math.round(((i + 1) / cuentasCSV.length) * 100))
        } catch (error) {
          console.error(`Error al crear cuenta ${cuentasCSV[i].codigo}:`, error)
          errores++
        }
      }

      toast.success(`Carga completada: ${creadas} cuentas creadas, ${errores} errores`)
      setIsMassiveUploadOpen(false)
      loadCuentas()
    } catch (error) {
      console.error("Error al procesar archivo:", error)
      toast.error("Error al procesar el archivo")
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      // Reset el input
      e.target.value = ''
    }
  }

  /** Descarga un archivo CSV de ejemplo con columnas para carga masiva de cuentas */
  const descargarPlantilla = () => {
    const contenido = `CODIGO	DENOMINACION	MONTO	SUBTITULO	ITEM	ASIGNACION	SUBASIGNACION
215-00-00-000-000-000	ACREEDORES PRESUPUESTARIOS	10000000	22	04	001	000
215-21-00-000-000-000	C x P GASTOS EN PERSONAL	5000000	22	01	002	000
215-22-00-000-000-000	C x P BIENES Y SERVICIOS DE CONSUMO	3000000	22	04	003	000`

    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'plantilla_cuentas.csv'
    link.click()
  }

  /** Limpia el formulario y la cuenta seleccionada */
  const handleReset = () => {
    setCodigo("")
    setDenominacion("")
    setPresupuestoTotal("")
    setPresupuestoDisplay("")
    setSubtitulo("")
    setItemPres("")
    setAsignacion("")
    setSubasignacion("")
    setSelectedCuenta(null)
  }

  /** Rellena el formulario con los datos de la cuenta para editar */
  const handleEdit = (cuenta: Cuenta) => {
    setSelectedCuenta(cuenta)
    setCodigo(cuenta.codigo)
    setDenominacion(cuenta.denominacion)
    setPresupuestoTotal(cuenta.presupuestoTotal.toString())
    setPresupuestoDisplay(formatNumber(cuenta.presupuestoTotal.toString()))
    setSubtitulo(cuenta.subtitulo || "")
    setItemPres(cuenta.item || "")
    setAsignacion(cuenta.asignacion || "")
    setSubasignacion(cuenta.subasignacion || "")
    setIsDialogOpen(true)
  }

  /** Limpia el formulario y abre el diálogo para crear una nueva cuenta */
  const handleNuevaCuenta = () => {
    handleReset()
    setIsDialogOpen(true)
  }

  /** Cuentas filtradas por término de búsqueda (código o denominación) */
  const filteredCuentas = cuentas.filter((cuenta) =>
    cuenta.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cuenta.denominacion.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalPages = Math.ceil(filteredCuentas.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentCuentas = filteredCuentas.slice(startIndex, endIndex)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  /** Porcentaje de presupuesto disponible sobre total (puede ser negativo si se sobrepasó) */
  const calcularPorcentaje = (disponible: number, total: number): number => {
    if (total === 0) return 0
    const porcentaje = (disponible / total) * 100
    // Permitir porcentajes negativos
    return porcentaje
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
                  No puede modificar las cuentas
                </h2>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Su usuario está vinculado a un funcionario emisor que no está activo en <strong>Configuración → Funcionarios Emisores</strong>.
                  Solo un SuperAdmin del sistema puede activar o desactivar quién emite CDPs. Mientras su funcionario esté inactivo, tampoco puede acceder a la configuración de cuentas.
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

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Configuración de Cuentas
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {isSupervisor 
                ? "Visualización de las cuentas presupuestarias del municipio (Solo Lectura)"
                : "Administre las cuentas presupuestarias del municipio"
              }
            </p>
            {isSupervisor && (
              <div className="mt-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  ℹ️ Tiene permisos de solo lectura. Puede visualizar información pero no crear ni editar cuentas.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {/* Botón Descargar Plantilla - visible para todos */}
            <Button
              onClick={descargarPlantilla}
              variant="outline"
              className="border-[#1a2da6] text-[#1a2da6] hover:bg-[#1a2da6] hover:text-white"
            >
              <Download className="h-4 w-4 mr-2" />
              Plantilla CSV
            </Button>

            {/* Botón Carga Masiva - solo para usuarios con permisos de edición */}
            {canEdit && (
              <Dialog open={isMassiveUploadOpen} onOpenChange={setIsMassiveUploadOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-[#adca1f] text-[#adca1f] hover:bg-[#adca1f] hover:text-white"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Carga Masiva
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Carga Masiva de Cuentas</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Formato del archivo CSV:</strong>
                    </p>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 mt-2 space-y-1 list-disc list-inside">
                      <li>Separado por tabulador o coma</li>
                      <li>Columnas: CODIGO, DENOMINACION, MONTO, SUBTITULO, ITEM, ASIGNACION, SUBASIGNACION</li>
                      <li>Las últimas 4 columnas son opcionales</li>
                      <li>Sin encabezados (o el sistema los ignorará si son texto)</li>
                    </ul>
                  </div>

                  {isUploading && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Procesando cuentas...</span>
                        <span className="font-semibold">{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-[#1a2da6] h-2 rounded-full transition-all"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="csvFile">Seleccionar Archivo CSV</Label>
                    <Input
                      id="csvFile"
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleMassiveUpload}
                      disabled={isUploading}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsMassiveUploadOpen(false)}
                      disabled={isUploading}
                    >
                      Cerrar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            )}

            {/* Botón Nueva Cuenta - solo para usuarios con permisos de edición */}
            {canEdit && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={handleNuevaCuenta}
                    className="bg-[#1a2da6] hover:bg-[#152389] text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nueva Cuenta
                  </Button>
                </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {selectedCuenta ? "Editar Cuenta" : "Nueva Cuenta"}
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="codigo">Código de Cuenta *</Label>
                  <Input
                    id="codigo"
                    placeholder="215-00-00-000-000-000"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="denominacion">Denominación *</Label>
                  <Input
                    id="denominacion"
                    placeholder="Nombre de la cuenta"
                    value={denominacion}
                    onChange={(e) => setDenominacion(e.target.value)}
                    required
                  />
                </div>

                {/* Imputación Presupuestaria */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Imputación Presupuestaria</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="subtitulo" className="text-xs text-gray-500">Subtítulo</Label>
                      <Input
                        id="subtitulo"
                        placeholder="Ej: 22"
                        value={subtitulo}
                        onChange={(e) => setSubtitulo(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="itemPres" className="text-xs text-gray-500">Ítem</Label>
                      <Input
                        id="itemPres"
                        placeholder="Ej: 04"
                        value={itemPres}
                        onChange={(e) => setItemPres(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="asignacion" className="text-xs text-gray-500">Asignación</Label>
                      <Input
                        id="asignacion"
                        placeholder="Ej: 001"
                        value={asignacion}
                        onChange={(e) => setAsignacion(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="subasignacion" className="text-xs text-gray-500">Subasignación</Label>
                      <Input
                        id="subasignacion"
                        placeholder="Ej: 000"
                        value={subasignacion}
                        onChange={(e) => setSubasignacion(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">Desagregación según clasificador presupuestario (IN4/2026)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="presupuesto">Presupuesto Total *</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="presupuesto"
                      placeholder="0"
                      value={presupuestoDisplay}
                      onChange={(e) => handlePresupuestoChange(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      handleReset()
                      setIsDialogOpen(false)
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="bg-[#1a2da6] hover:bg-[#152389]"
                  >
                    {isLoading ? "Guardando..." : selectedCuenta ? "Actualizar" : "Crear"}
                  </Button>
                </div>
              </form>
            </DialogContent>
            </Dialog>
            )}
          </div>
        </div>

        {/* Buscador */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Buscar por código o denominación..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Tabla de Cuentas */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Listado de Cuentas ({filteredCuentas.length})
            </h2>
          </div>
          
          {filteredCuentas.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                No se encontraron cuentas
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b-2 border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Código / Denominación
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Presupuesto Total
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Gastado
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Disponible
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {currentCuentas.map((cuenta, index) => {
                      const porcentaje = calcularPorcentaje(cuenta.presupuestoDisponible, cuenta.presupuestoTotal)
                      const gastado = cuenta.presupuestoTotal - cuenta.presupuestoDisponible
                      
                      return (
                        <tr 
                          key={cuenta.id} 
                          className={cn(
                            "group hover:bg-blue-50/50 dark:hover:bg-gray-800/50 transition-all duration-150",
                            index % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/30 dark:bg-gray-900/50"
                          )}
                        >
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-mono font-bold text-[#1a2da6] dark:text-blue-400">
                                {cuenta.codigo}
                              </span>
                              <span className="text-xs text-gray-600 dark:text-gray-400">
                                {cuenta.denominacion}
                              </span>
                              {(cuenta.subtitulo || cuenta.item || cuenta.asignacion || cuenta.subasignacion) && (
                                <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">
                                  Sub: {cuenta.subtitulo || "—"} | Ítem: {cuenta.item || "—"} | Asig: {cuenta.asignacion || "—"} | SubAsig: {cuenta.subasignacion || "—"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                                $ {formatMonto(cuenta.presupuestoTotal)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className={cn(
                              "inline-flex items-center px-3 py-1.5 rounded-lg border",
                              gastado > cuenta.presupuestoTotal
                                ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700"
                                : "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"
                            )}>
                              <span className={cn(
                                "text-sm font-bold",
                                gastado > cuenta.presupuestoTotal
                                  ? "text-red-800 dark:text-red-300"
                                  : "text-orange-700 dark:text-orange-400"
                              )}>
                                $ {formatMonto(gastado)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className={cn(
                              "inline-flex items-center px-3 py-1.5 rounded-lg border",
                              cuenta.presupuestoDisponible < 0
                                ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700"
                                : porcentaje > 50 
                                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                                : porcentaje > 20
                                ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                                : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                            )}>
                              <span className={cn(
                                "text-sm font-bold",
                                cuenta.presupuestoDisponible < 0
                                  ? "text-red-800 dark:text-red-300"
                                  : porcentaje > 50 
                                  ? "text-green-700 dark:text-green-400"
                                  : porcentaje > 20
                                  ? "text-yellow-700 dark:text-yellow-400"
                                  : "text-red-700 dark:text-red-400"
                              )}>
                                {cuenta.presupuestoDisponible < 0 ? "-" : ""} $ {formatMonto(Math.abs(cuenta.presupuestoDisponible))}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col items-center gap-2">
                              {cuenta.presupuestoDisponible < 0 ? (
                                <>
                                  <Badge className="bg-red-600 text-white font-bold text-xs">
                                    SOBREGIRO
                                  </Badge>
                                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                                    {porcentaje.toFixed(1)}%
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className={cn(
                                    "text-sm font-semibold",
                                    porcentaje > 50 
                                      ? "text-green-600 dark:text-green-400"
                                      : porcentaje > 20
                                      ? "text-yellow-600 dark:text-yellow-400"
                                      : "text-red-600 dark:text-red-400"
                                  )}>
                                    {porcentaje.toFixed(1)}%
                                  </span>
                                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 max-w-24">
                                    <div
                                      className={cn(
                                        "h-2 rounded-full transition-all",
                                        porcentaje > 50 
                                          ? "bg-green-500"
                                          : porcentaje > 20
                                          ? "bg-yellow-500"
                                          : "bg-red-500"
                                      )}
                                      style={{ width: `${Math.max(0, Math.min(100, porcentaje))}%` }}
                                    ></div>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => loadCDPs(cuenta)}
                                className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-800"
                                title="Ver CDPs"
                              >
                                <Eye className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => loadBitacora(cuenta)}
                                className="h-8 w-8 p-0 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                title="Ver Historial"
                              >
                                <History className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                              </Button>
                              {canEdit && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEdit(cuenta)}
                                  className="h-8 w-8 p-0 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                  title="Editar"
                                >
                                  <Pencil className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {filteredCuentas.length > itemsPerPage && (
                <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    {/* Información de registros */}
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      Mostrando <span className="font-semibold">{startIndex + 1}</span> a{" "}
                      <span className="font-semibold">{Math.min(endIndex, filteredCuentas.length)}</span> de{" "}
                      <span className="font-semibold">{filteredCuentas.length}</span> cuentas
                    </div>

                    {/* Controles de paginación */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="h-9 px-3"
                      >
                        Primera
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="h-9 w-9 p-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>

                      {/* Números de página */}
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(page => {
                            return (
                              page === 1 ||
                              page === totalPages ||
                              (page >= currentPage - 1 && page <= currentPage + 1)
                            )
                          })
                          .map((page, index, array) => {
                            const prevPage = array[index - 1]
                            const showEllipsis = prevPage && page - prevPage > 1

                            return (
                              <div key={page} className="flex items-center gap-1">
                                {showEllipsis && (
                                  <span className="px-2 text-gray-400 dark:text-gray-500">...</span>
                                )}
                                <Button
                                  variant={currentPage === page ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setCurrentPage(page)}
                                  className={cn(
                                    "h-9 w-9 p-0",
                                    currentPage === page &&
                                      "bg-[#1a2da6] hover:bg-[#1a2da6]/90 text-white"
                                  )}
                                >
                                  {page}
                                </Button>
                              </div>
                            )
                          })}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="h-9 w-9 p-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="h-9 px-3"
                      >
                        Última
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal de CDPs */}
        {isCDPDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <Card className="w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl">
              <CardHeader className="shrink-0 border-b pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    <CardTitle className="text-xl">
                      CDPs Asociados - {cuentaParaCDPs?.codigo}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit && cuentaParaCDPs && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            toast.info("Recalculando presupuesto...")
                            const resultado = await recalcularPresupuesto(cuentaParaCDPs)
                            await loadCuentas()
                            await loadCDPs(cuentaParaCDPs)
                            toast.success(
                              `Presupuesto recalculado\nGastado: $${resultado.totalGastado.toLocaleString("es-CL")}\nDisponible: $${resultado.nuevoPresupuestoDisponible.toLocaleString("es-CL")}`,
                              { duration: 5000 }
                            )
                          } catch (error) {
                            toast.error("Error al recalcular el presupuesto")
                          }
                        }}
                        className="border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Recalcular Presupuesto
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsCDPDialogOpen(false)}
                      className="h-8 w-8"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {cuentaParaCDPs?.denominacion}
                </p>
              </CardHeader>

              <CardContent className="flex-1 overflow-hidden flex flex-col min-h-0 p-6">
                {isLoadingCDPs ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-[#1a2da6]" />
                  </div>
                ) : cdps.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400">
                      No hay CDPs asociados a esta cuenta
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 flex flex-col min-h-0 flex-1">
                    {/* Resumen */}
                    <div className="shrink-0">
                      {/* Alerta de discrepancia */}
                      {(() => {
                        const sumaCDPs = cdps.reduce((sum, cdp) => sum + cdp.montoDisponibilidad, 0)
                        const gastadoEnCuenta = cuentaParaCDPs ? cuentaParaCDPs.presupuestoTotal - cuentaParaCDPs.presupuestoDisponible : 0
                        const diferencia = Math.abs(sumaCDPs - gastadoEnCuenta)
                        const hayDiscrepancia = diferencia > 1000 // Tolerancia de $1.000
                        
                        if (hayDiscrepancia) {
                          return (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                              <div className="flex items-start gap-3">
                                <div className="shrink-0 mt-0.5">
                                  <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                  </svg>
                                </div>
                                <div className="flex-1">
                                  <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">⚠️ Error: Los montos no coinciden</h4>
                                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                                    <strong>Suma de CDPs:</strong> ${ formatMonto(sumaCDPs)}
                                    <br/>
                                    <strong>Gastado registrado:</strong> ${ formatMonto(gastadoEnCuenta)}
                                    <br/>
                                    <strong className="text-red-900 dark:text-red-100">⚠️ Diferencia: ${formatMonto(diferencia)}</strong>
                                  </p>
                                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                                    Esto significa que el presupuesto no se descontó correctamente al crear algunos CDPs.
                                  </p>
                                  {canEdit && (
                                    <p className="text-xs font-semibold text-red-700 dark:text-red-300 mt-2 bg-red-100 dark:bg-red-900/40 p-2 rounded">
                                      👉 Haz clic en "Recalcular Presupuesto" arriba para corregir automáticamente.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        }
                        
                        // Mensaje de confirmación cuando todo está correcto
                        return (
                          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-4">
                            <div className="flex items-center gap-2">
                              <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                                ✓ Los montos están correctos. Suma de CDPs = Presupuesto Gastado
                              </p>
                            </div>
                          </div>
                        )
                      })()}
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        {/* Total CDPs */}
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm flex flex-col">
                          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Total CDPs</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{cdps.length}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-auto">
                            Certificados
                          </p>
                        </div>
                        
                        {/* Presupuesto Total */}
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm flex flex-col">
                          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Presupuesto Total</p>
                          <p className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-1 wrap-break-word">
                            $ {formatMonto(cuentaParaCDPs?.presupuestoTotal || 0)}
                          </p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-auto">
                            Asignado
                          </p>
                        </div>
                        
                        {/* Suma de CDPs */}
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm flex flex-col">
                          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Suma de CDPs</p>
                          <p className="text-xl font-bold text-[#1a2da6] mb-1 wrap-break-word">
                            $ {formatMonto(cdps.reduce((sum, cdp) => sum + cdp.montoDisponibilidad, 0))}
                          </p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-auto">
                            {cdps.length} CDPs
                          </p>
                        </div>
                        
                        {/* Gastado */}
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm flex flex-col">
                          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Gastado</p>
                          <p className="text-xl font-bold text-orange-600 mb-1 wrap-break-word">
                            $ {formatMonto(cuentaParaCDPs ? cuentaParaCDPs.presupuestoTotal - cuentaParaCDPs.presupuestoDisponible : 0)}
                          </p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-auto">
                            Descontado
                          </p>
                        </div>
                        
                        {/* Disponible */}
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm flex flex-col">
                          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Disponible</p>
                          <p className={cn(
                            "text-xl font-bold mb-1 wrap-break-word",
                            (cuentaParaCDPs?.presupuestoDisponible || 0) < 0 
                              ? "text-red-600 dark:text-red-400" 
                              : "text-green-600"
                          )}>
                            {(cuentaParaCDPs?.presupuestoDisponible || 0) < 0 ? "-" : ""} $ {formatMonto(Math.abs(cuentaParaCDPs?.presupuestoDisponible || 0))}
                          </p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-auto">
                            {(cuentaParaCDPs?.presupuestoDisponible || 0) < 0 ? "Sobregiro" : "Restante"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Tabla de CDPs */}
                    <div className="border rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col">
                      <div className="overflow-auto flex-1">
                        <table className="w-full">
                          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                            <tr>
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                CDP N°
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Fecha
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Área de Gestión
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Solicitante
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Destino
                              </th>
                              <th className="px-6 py-4 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Monto
                              </th>
                              <th className="px-6 py-4 text-center text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Estado
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                            {cdps.map((cdp) => (
                              <tr key={cdp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-mono font-medium text-gray-900 dark:text-white">
                                    {cdp.cdpNumero}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm text-gray-900 dark:text-white">
                                    {toDateSafe(cdp.fecha) ? format(toDateSafe(cdp.fecha)!, "dd/MM/yyyy", { locale: es }) : "N/A"}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-sm text-gray-900 dark:text-white">
                                    {getAreaGestionNombre(cdp.areaGestion)}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-sm text-gray-900 dark:text-white">
                                    {cdp.nombreSolicitante}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-sm text-gray-900 dark:text-white max-w-md block" title={cdp.destinoDisponibilidad}>
                                    {cdp.destinoDisponibilidad}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                    $ {formatMonto(cdp.montoDisponibilidad)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                    cdp.estado === "activo" 
                                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                      : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                                  }`}>
                                    {cdp.estado === "activo" ? "Activo" : cdp.estado}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Modal de Bitácora */}
        {isBitacoraDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <Card className="w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              <CardHeader className="shrink-0 border-b pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-purple-600" />
                    <CardTitle className="text-xl">
                      Historial de Cambios - {cuentaParaBitacora?.codigo}
                    </CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsBitacoraDialogOpen(false)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {cuentaParaBitacora?.denominacion}
                </p>
              </CardHeader>

              <CardContent className="flex-1 overflow-hidden flex flex-col min-h-0 p-6">
                {isLoadingBitacora ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-[#1a2da6]" />
                  </div>
                ) : bitacora.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">
                      No hay registros en el historial de esta cuenta
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Tabla de Bitácora */}
                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex-1">
                      <div className="overflow-x-auto max-h-[calc(90vh-250px)]">
                        <table className="w-full table-auto">
                          <thead className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-700 border-b border-gray-200 dark:border-gray-600 sticky top-0">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Fecha y Hora
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Acción
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                CDP
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Descripción
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                Realizado Por
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {bitacora.slice(
                              (currentBitacoraPage - 1) * bitacoraItemsPerPage,
                              currentBitacoraPage * bitacoraItemsPerPage
                            ).map((registro, index) => {
                              const isEven = index % 2 === 0
                              return (
                                <tr
                                  key={registro.id}
                                  className={cn(
                                    "transition-colors",
                                    isEven ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-850",
                                    "hover:bg-blue-50 dark:hover:bg-blue-950"
                                  )}
                                >
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {toDateSafe(registro.fecha) ? format(toDateSafe(registro.fecha)!, "dd/MM/yyyy", { locale: es }) : "N/A"}
                                      </span>
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {toDateSafe(registro.fecha) ? format(toDateSafe(registro.fecha)!, "HH:mm:ss", { locale: es }) : ""}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <Badge className={getTipoAccionColor(registro.tipoAccion)}>
                                      {getTipoAccionNombre(registro.tipoAccion)}
                                    </Badge>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                      {registro.cdpNumero ?? "—"}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="text-sm text-gray-900 dark:text-white">
                                      {registro.descripcion}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                      {registro.realizadoPor}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Paginación de Bitácora */}
                    {bitacora.length > bitacoraItemsPerPage && (
                      <div className="mt-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 rounded-lg shadow-sm">
                        <div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            Mostrando{" "}
                            <span className="font-medium">
                              {(currentBitacoraPage - 1) * bitacoraItemsPerPage + 1}
                            </span>
                            {" "}-{" "}
                            <span className="font-medium">
                              {Math.min(currentBitacoraPage * bitacoraItemsPerPage, bitacora.length)}
                            </span>
                            {" "}de{" "}
                            <span className="font-medium">{bitacora.length}</span>
                            {" "}registros
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentBitacoraPage(1)}
                            disabled={currentBitacoraPage === 1}
                            className="h-9 px-3"
                          >
                            Primera
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentBitacoraPage(prev => Math.max(1, prev - 1))}
                            disabled={currentBitacoraPage === 1}
                            className="h-9 w-9 p-0"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>

                          {/* Números de página */}
                          <div className="flex items-center gap-1">
                            {Array.from(
                              { length: Math.ceil(bitacora.length / bitacoraItemsPerPage) },
                              (_, i) => i + 1
                            )
                              .filter(page => {
                                const totalPages = Math.ceil(bitacora.length / bitacoraItemsPerPage)
                                return (
                                  page === 1 ||
                                  page === totalPages ||
                                  (page >= currentBitacoraPage - 1 && page <= currentBitacoraPage + 1)
                                )
                              })
                              .map((page, index, array) => {
                                const prevPage = array[index - 1]
                                const showEllipsis = prevPage && page - prevPage > 1

                                return (
                                  <div key={page} className="flex items-center gap-1">
                                    {showEllipsis && (
                                      <span className="px-2 text-gray-400 dark:text-gray-500">...</span>
                                    )}
                                    <Button
                                      variant={currentBitacoraPage === page ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => setCurrentBitacoraPage(page)}
                                      className={cn(
                                        "h-9 w-9 p-0",
                                        currentBitacoraPage === page &&
                                          "bg-purple-600 hover:bg-purple-700 text-white"
                                      )}
                                    >
                                      {page}
                                    </Button>
                                  </div>
                                )
                              })}
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentBitacoraPage(prev => 
                              Math.min(Math.ceil(bitacora.length / bitacoraItemsPerPage), prev + 1)
                            )}
                            disabled={currentBitacoraPage === Math.ceil(bitacora.length / bitacoraItemsPerPage)}
                            className="h-9 w-9 p-0"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentBitacoraPage(Math.ceil(bitacora.length / bitacoraItemsPerPage))}
                            disabled={currentBitacoraPage === Math.ceil(bitacora.length / bitacoraItemsPerPage)}
                            className="h-9 px-3"
                          >
                            Última
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

