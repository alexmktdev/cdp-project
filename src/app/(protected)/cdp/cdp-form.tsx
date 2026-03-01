"use client"

/**
 * Formulario de creación de CDP (Certificado de Disponibilidad Presupuestaria).
 * Soporta dos tipos: Subtítulo 21 al 30, 32 y 33 (gasto corriente) y Subtítulo 31 (iniciativa de inversión).
 * Carga cuentas presupuestarias, configuración de entidad, funcionarios emisores; genera número de CDP;
 * guarda en Firestore, actualiza presupuesto de la cuenta y registra en bitácora.
 */

import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { CalendarIcon, Save, FileText, DollarSign, User, Loader2, Hash, Building2, Info, UserCheck, ChevronsUpDown, Check } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn, getDisplayName, parseDesagregacionFromCodigoCuenta } from "@/lib/utils"
import { toast } from "sonner"
import { db, serverTimestamp } from "@/lib/firebase"
import { collection, addDoc, Timestamp, query, orderBy, limit, getDocs, doc, updateDoc, getDoc } from "firebase/firestore"
import { useAuth } from "@/context/auth-context"
import { abrirPDFCDP } from "@/lib/pdf-generator"
import { registrarMovimientoCuenta } from "@/lib/bitacora"

/** Cuenta presupuestaria con imputación (subtítulo, ítem, asignación, subasignación) para IN4/2026 */
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
}

/** Input de texto que sincroniza con el padre solo al perder foco (onBlur), para reducir re-renders al escribir */
const FastInput = memo(function FastInput({
  value: externalValue,
  onValueChange,
  ...props
}: { value: string; onValueChange: (v: string) => void } & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const [localValue, setLocalValue] = useState(externalValue)

  /** Sincroniza el valor local cuando el padre cambia el valor (ej. al resetear el formulario) */
  useEffect(() => {
    setLocalValue(externalValue)
  }, [externalValue])

  return (
    <Input
      {...props}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => onValueChange(localValue)}
    />
  )
})

/** Input de monto con formato es-CL; guarda valor numérico en ref y sincroniza con el padre al perder foco */
const FastMontoInput = memo(function FastMontoInput({
  value: externalValue,
  onValueChange,
  ...props
}: { value: string; onValueChange: (raw: string) => void } & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const [localDisplay, setLocalDisplay] = useState(() => {
    if (!externalValue) return ""
    return Number(externalValue).toLocaleString("es-CL")
  })
  /** Valor numérico en bruto (solo dígitos) para enviar al padre en onBlur */
  const localRawRef = useRef(externalValue)

  /** Sincroniza display cuando el valor externo cambia desde el padre */
  useEffect(() => {
    if (externalValue !== localRawRef.current) {
      localRawRef.current = externalValue
      setLocalDisplay(externalValue ? Number(externalValue).toLocaleString("es-CL") : "")
    }
  }, [externalValue])

  /** Actualiza ref y display con solo dígitos; el valor se envía al padre en onBlur */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "")
    localRawRef.current = raw
    setLocalDisplay(raw ? Number(raw).toLocaleString("es-CL") : "")
  }

  return (
    <Input
      {...props}
      value={localDisplay}
      onChange={handleChange}
      onBlur={() => onValueChange(localRawRef.current)}
    />
  )
})

/** Rutas de imágenes de firma por id de funcionario (titular, subrogante1, subrogante2) */
const FIRMA_PATHS: Record<string, string> = {
  titular: "/firma.png",
  subrogante1: "/firma_francisca_jepsen.png",
  subrogante2: "/firma_karen_valdes.png",
}

export default function CrearCDPForm() {
  const { user } = useAuth()

  // --- Estado: datos del CDP y del memo ---
  const [fecha, setFecha] = useState<Date>(new Date())
  const [cdpNumero, setCdpNumero] = useState("")
  const [memoNumero, setMemoNumero] = useState("")
  const [fechaMemo, setFechaMemo] = useState<Date>()
  const [cargoSolicitante, setCargoSolicitante] = useState("")
  const [nombreSolicitante, setNombreSolicitante] = useState("")
  const [destinoDisponibilidad, setDestinoDisponibilidad] = useState("")
  const [montoDisponibilidad, setMontoDisponibilidad] = useState("")
  const [montoDisplay, setMontoDisplay] = useState("")
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<Cuenta | null>(null)
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [numeroItemPresupuestario, setNumeroItemPresupuestario] = useState("")
  const [nombreItemPresupuestario, setNombreItemPresupuestario] = useState("")
  const [desagregacionSubtitulo, setDesagregacionSubtitulo] = useState("")
  const [desagregacionItem, setDesagregacionItem] = useState("")
  const [desagregacionAsignacion, setDesagregacionAsignacion] = useState("")
  const [desagregacionSubasignacion, setDesagregacionSubasignacion] = useState("")
  const [areaGestion, setAreaGestion] = useState("")
  const [programa, setPrograma] = useState("")
  const [subPrograma, setSubPrograma] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isGeneratingCDP, setIsGeneratingCDP] = useState(false)
  const [cuentaComboOpen, setCuentaComboOpen] = useState(false)
  const [cuentasListReady, setCuentasListReady] = useState(false)
  const [fechaMemoError, setFechaMemoError] = useState(false)
  const fechaMemoRef = useRef<HTMLDivElement>(null)

  // --- Tipo de CDP: 21-30, 32, 33 (gasto corriente) o 31 (iniciativa de inversión) ---
  const [tipoCDP, setTipoCDP] = useState<"22-24-33" | "31">("22-24-33")

  // --- Entidad: nombre e identificador (configuración IN4/2026) ---
  const [entidadNombre, setEntidadNombre] = useState("")
  const [entidadID, setEntidadID] = useState("")

  // --- Funcionario emisor del CDP (titular o subrogante) ---
  interface FuncionarioEmisor {
    id: string
    nombre: string
    tipo: "titular" | "subrogante"
    firmaPath: string
    activo: boolean
  }
  const [funcionarios, setFuncionarios] = useState<FuncionarioEmisor[]>([])
  const [funcionarioSeleccionado, setFuncionarioSeleccionado] = useState<FuncionarioEmisor | null>(null)

  // --- Campos exclusivos Tipo B (Subtítulo 31 - Iniciativa de Inversión) ---
  const [nombreProyecto, setNombreProyecto] = useState("")
  const [codigoBIP, setCodigoBIP] = useState("")
  const [montoMaximoAnual, setMontoMaximoAnual] = useState("")
  const [montoMaximoAnualDisplay, setMontoMaximoAnualDisplay] = useState("")
  const [compromisosFuturosAnio, setCompromisosFuturosAnio] = useState("")
  const [compromisosFuturosMonto, setCompromisosFuturosMonto] = useState("")
  const [compromisosFuturosMontoDisplay, setCompromisosFuturosMontoDisplay] = useState("")

  // --- Efecto inicial: cargar cuentas, entidad, funcionarios y número de CDP en paralelo (con flag de cancelación) ---
  useEffect(() => {
    let cancelled = false
    const getCancelled = () => cancelled
    Promise.all([
      loadCuentas({ getCancelled }),
      loadEntidadConfig({ getCancelled }),
      loadFuncionarios({ getCancelled }),
      generarNumeroCDP(false, getCancelled),
    ])
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Al abrir el combo de cuenta, marca lista como no lista y a los 150ms la marca lista (evita parpadeo al renderizar opciones) */
  useEffect(() => {
    if (cuentaComboOpen) {
      setCuentasListReady(false)
      const timer = setTimeout(() => {
        setCuentasListReady(true)
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [cuentaComboOpen])

  /** Carga nombre e identificador de la entidad desde configuracion/entidad. getCancelled: opcional. */
  const loadEntidadConfig = async (opts?: { getCancelled?: () => boolean }) => {
    const getCancelled = opts?.getCancelled ?? (() => false)
    try {
      const docRef = doc(db, "configuracion", "entidad")
      const docSnap = await getDoc(docRef)
      if (getCancelled()) return
      if (docSnap.exists()) {
        const data = docSnap.data()
        if (!getCancelled()) {
          setEntidadNombre(data.nombre || "")
          setEntidadID(data.identificadorCodificador || "")
        }
      }
    } catch (error) {
      if (!getCancelled()) console.error("Error al cargar configuración de entidad:", error)
    }
  }

  /** Carga solo los funcionarios emisores activos (el que está configurado en Funcionarios Emisores). getCancelled: opcional. */
  const loadFuncionarios = async (opts?: { getCancelled?: () => boolean }) => {
    const getCancelled = opts?.getCancelled ?? (() => false)
    try {
      const docRef = doc(db, "configuracion", "funcionarios")
      const docSnap = await getDoc(docRef)
      if (getCancelled()) return
      if (docSnap.exists()) {
        const data = docSnap.data()
        const todos = (data.funcionarios || [])
          .map((f: FuncionarioEmisor) => {
            let next = { ...f }
            const correctPath = FIRMA_PATHS[f.id]
            if (correctPath && f.firmaPath !== correctPath) {
              next = { ...next, firmaPath: correctPath }
            }
            // Corregir nombre subrogante2: "Valdes" → "Valdés"
            if (f.id === "subrogante2" && f.nombre === "Karen Valdes González") {
              next = { ...next, nombre: "Karen Valdés González" }
            }
            return next
          })
        // Solo los que están activos en Configuración > Funcionarios Emisores (normalmente uno solo)
        const lista = todos.filter((f: FuncionarioEmisor) => f.activo === true)
        if (!getCancelled()) {
          setFuncionarios(lista)
          if (lista.length > 0 && !funcionarioSeleccionado) {
            setFuncionarioSeleccionado(lista[0])
          }
        }
      }
    } catch (error) {
      if (!getCancelled()) console.error("Error al cargar funcionarios:", error)
    }
  }

  /** Carga todas las cuentas presupuestarias ordenadas por código. getCancelled: opcional. */
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

  /** Obtiene el último numeroCDPSecuencia de Firestore y genera el siguiente número (ej. 00001/2026). getCancelled: opcional. */
  const generarNumeroCDP = async (showToast = false, getCancelled?: () => boolean) => {
    const cancelled = getCancelled ?? (() => false)
    setIsGeneratingCDP(true)
    try {
      const year = 2026 // Año fijo 2026
      const cdpCollection = collection(db, "cdp")
      const q = query(cdpCollection, orderBy("numeroCDPSecuencia", "desc"), limit(1))
      const querySnapshot = await getDocs(q)
      if (cancelled()) return null
      let nextNumber = 1
      if (!querySnapshot.empty) {
        const lastDoc = querySnapshot.docs[0].data()
        nextNumber = (lastDoc.numeroCDPSecuencia || 0) + 1
      }
      const numeroCDPFormatted = `${String(nextNumber).padStart(5, "0")}/${year}`
      if (!cancelled()) {
        setCdpNumero(numeroCDPFormatted)
        console.log("Número de CDP generado:", numeroCDPFormatted)
        if (showToast) toast.success(`Número de CDP generado: ${numeroCDPFormatted}`)
      }
      return nextNumber
    } catch (error) {
      if (!cancelled()) {
        console.error("Error al generar número de CDP:", error)
        toast.error("Error al generar número de CDP")
      }
      return null
    } finally {
      if (!cancelled()) setIsGeneratingCDP(false)
    }
  }

  /** Formatea valor numérico con separador de miles (es-CL) para mostrar en inputs de monto */
  const formatNumber = useCallback((value: string): string => {
    const numbers = value.replace(/\D/g, "")
    if (!numbers) return ""
    return Number(numbers).toLocaleString("es-CL")
  }, [])

  /** Actualiza monto de disponibilidad y su representación en pantalla (solo dígitos, formateado) */
  const handleMontoChange = useCallback((value: string) => {
    const cleanValue = value.replace(/\D/g, "")
    setMontoDisponibilidad(cleanValue)
    setMontoDisplay(cleanValue ? Number(cleanValue).toLocaleString("es-CL") : "")
  }, [])

  /** Actualiza monto máximo anual (Tipo 31) y su display formateado */
  const handleMontoMaximoAnualChange = useCallback((value: string) => {
    const cleanValue = value.replace(/\D/g, "")
    setMontoMaximoAnual(cleanValue)
    setMontoMaximoAnualDisplay(cleanValue ? Number(cleanValue).toLocaleString("es-CL") : "")
  }, [])

  /** Actualiza monto de compromisos futuros (Tipo 31) y su display formateado */
  const handleCompromisosFuturosMontoChange = useCallback((value: string) => {
    const cleanValue = value.replace(/\D/g, "")
    setCompromisosFuturosMonto(cleanValue)
    setCompromisosFuturosMontoDisplay(cleanValue ? Number(cleanValue).toLocaleString("es-CL") : "")
  }, [])

  /** Al elegir una cuenta se actualizan código, denominación, desagregación (de la cuenta o parseando el código) y montos */
  const handleCuentaSelect = useCallback((cuentaId: string) => {
    const cuenta = cuentas.find((c) => c.id === cuentaId)
    if (cuenta) {
      setCuentaSeleccionada(cuenta)
      setNumeroItemPresupuestario(cuenta.codigo)
      setNombreItemPresupuestario(cuenta.denominacion)
      const parsed = parseDesagregacionFromCodigoCuenta(cuenta.codigo)
      setDesagregacionSubtitulo((cuenta.subtitulo ?? "").trim() || parsed.subtitulo)
      setDesagregacionItem((cuenta.item ?? "").trim() || parsed.item)
      setDesagregacionAsignacion((cuenta.asignacion ?? "").trim() || parsed.asignacion)
      setDesagregacionSubasignacion((cuenta.subasignacion ?? "").trim() || parsed.subasignacion)
    }
  }, [cuentas])

  // --- Montos calculados para Tipo A (IN4/2026): total, comprometido a la fecha, por acto, saldo final ---
  const montoComprometidoActo = Number(montoDisponibilidad) || 0

  const montoTotalPresupuesto = useMemo(
    () => cuentaSeleccionada?.presupuestoTotal || 0,
    [cuentaSeleccionada]
  )
  const montoComprometidoFecha = useMemo(
    () => cuentaSeleccionada
      ? cuentaSeleccionada.presupuestoTotal - cuentaSeleccionada.presupuestoDisponible
      : 0,
    [cuentaSeleccionada]
  )
  const saldoFinal = useMemo(
    () => cuentaSeleccionada
      ? cuentaSeleccionada.presupuestoDisponible - montoComprometidoActo
      : 0,
    [cuentaSeleccionada, montoComprometidoActo]
  )

  /** Panel que muestra código, denominación, presupuesto e imputación de la cuenta seleccionada */
  const cuentaInfoPanel = useMemo(() => {
    if (!cuentaSeleccionada) return null
    return (
      <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-400">Código:</span>
            <span className="ml-2 font-mono font-semibold">{cuentaSeleccionada.codigo}</span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">Presupuesto Total:</span>
            <span className="ml-2 font-semibold">${cuentaSeleccionada.presupuestoTotal.toLocaleString("es-CL")}</span>
          </div>
          <div className="col-span-2">
            <span className="text-gray-600 dark:text-gray-400">Denominación:</span>
            <span className="ml-2 font-semibold">{cuentaSeleccionada.denominacion}</span>
          </div>
          <div className="col-span-2">
            <span className="text-gray-600 dark:text-gray-400">Presupuesto Disponible:</span>
            <span className={`ml-2 font-semibold ${
              cuentaSeleccionada.presupuestoDisponible > cuentaSeleccionada.presupuestoTotal * 0.5
                ? "text-green-600"
                : cuentaSeleccionada.presupuestoDisponible > cuentaSeleccionada.presupuestoTotal * 0.2
                ? "text-yellow-600"
                : "text-red-600"
            }`}>
              ${cuentaSeleccionada.presupuestoDisponible.toLocaleString("es-CL")}
            </span>
          </div>
          <div className="col-span-2 pt-2 border-t border-blue-300 dark:border-blue-700">
            <span className="text-gray-600 dark:text-gray-400 text-xs font-semibold">Fuente de financiamiento (desagregación). Complete o edite si la cuenta no los trae:</span>
            <div className="grid grid-cols-4 gap-2 mt-1">
              <div className="bg-white dark:bg-gray-800 rounded px-2 py-1 border border-blue-200 dark:border-blue-700">
                <label className="text-[10px] text-gray-500 block mb-0.5">Subtítulo</label>
                <Input className="h-8 text-sm font-mono" placeholder="—" value={desagregacionSubtitulo} onChange={(e) => setDesagregacionSubtitulo(e.target.value)} />
              </div>
              <div className="bg-white dark:bg-gray-800 rounded px-2 py-1 border border-blue-200 dark:border-blue-700">
                <label className="text-[10px] text-gray-500 block mb-0.5">Ítem</label>
                <Input className="h-8 text-sm font-mono" placeholder="—" value={desagregacionItem} onChange={(e) => setDesagregacionItem(e.target.value)} />
              </div>
              <div className="bg-white dark:bg-gray-800 rounded px-2 py-1 border border-blue-200 dark:border-blue-700">
                <label className="text-[10px] text-gray-500 block mb-0.5">Asignación</label>
                <Input className="h-8 text-sm font-mono" placeholder="—" value={desagregacionAsignacion} onChange={(e) => setDesagregacionAsignacion(e.target.value)} />
              </div>
              <div className="bg-white dark:bg-gray-800 rounded px-2 py-1 border border-blue-200 dark:border-blue-700">
                <label className="text-[10px] text-gray-500 block mb-0.5">Subasignación</label>
                <Input className="h-8 text-sm font-mono" placeholder="—" value={desagregacionSubasignacion} onChange={(e) => setDesagregacionSubasignacion(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }, [cuentaSeleccionada, desagregacionSubtitulo, desagregacionItem, desagregacionAsignacion, desagregacionSubasignacion])

  /** Panel de montos IN4/2026 para Tipo A (total, comprometido a la fecha, por acto, saldo final) */
  const montosPanel = useMemo(() => {
    if (tipoCDP !== "22-24-33" || !cuentaSeleccionada) return null
    return (
      <div className="md:col-span-2 mt-2 p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Montos según IN4/2026 (calculados automáticamente)
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <span className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Monto Total Presupuesto</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">
              $ {montoTotalPresupuesto.toLocaleString("es-CL")}
            </span>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <span className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Comprometido a la Fecha</span>
            <span className="text-sm font-bold text-orange-600">
              $ {montoComprometidoFecha.toLocaleString("es-CL")}
            </span>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <span className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Comprometido por este Acto</span>
            <span className="text-sm font-bold text-[#1a2da6]">
              $ {montoComprometidoActo.toLocaleString("es-CL")}
            </span>
          </div>
          <div className={cn(
            "rounded-lg p-3 border",
            saldoFinal >= 0
              ? "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              : "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700"
          )}>
            <span className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Saldo Final</span>
            <span className={cn(
              "text-sm font-bold",
              saldoFinal >= 0 ? "text-green-600" : "text-red-600"
            )}>
              $ {saldoFinal.toLocaleString("es-CL")}
            </span>
          </div>
        </div>
      </div>
    )
  }, [tipoCDP, cuentaSeleccionada, montoTotalPresupuesto, montoComprometidoFecha, montoComprometidoActo, saldoFinal])

  /** Panel "Quedará disponible" tras descontar el monto del acto */
  const quedaDisponiblePanel = useMemo(() => {
    if (!cuentaSeleccionada || !montoDisponibilidad || Number(montoDisponibilidad) <= 0) return null
    return (
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
        <div className="text-sm">
          <span className="text-gray-600 dark:text-gray-400">Quedará Disponible:</span>
          <span className={`ml-2 font-bold ${
            saldoFinal > cuentaSeleccionada.presupuestoTotal * 0.5
              ? "text-green-600"
              : saldoFinal > cuentaSeleccionada.presupuestoTotal * 0.2
              ? "text-yellow-600"
              : "text-red-600"
          }`}>
            ${saldoFinal.toLocaleString("es-CL")}
          </span>
          <span className="ml-2 text-xs text-gray-500">
            (Se descontará: ${Number(montoDisponibilidad).toLocaleString("es-CL")})
          </span>
        </div>
      </div>
    )
  }, [cuentaSeleccionada, montoDisponibilidad, saldoFinal])

  /** Lista de opciones del selector de cuenta (codigo, denominación, disponible) */
  const cuentasOptions = useMemo(() =>
    cuentas.map((cuenta) => (
      <SelectItem key={cuenta.id} value={cuenta.id}>
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-mono text-sm font-semibold truncate">{cuenta.codigo}</span>
            <span className="text-xs text-gray-500 truncate">{cuenta.denominacion}</span>
          </div>
          <span className={`text-xs font-bold whitespace-nowrap ${
            cuenta.presupuestoDisponible > cuenta.presupuestoTotal * 0.5
              ? "text-green-600"
              : cuenta.presupuestoDisponible > cuenta.presupuestoTotal * 0.2
              ? "text-yellow-600"
              : "text-red-600"
          }`}>
            ${cuenta.presupuestoDisponible.toLocaleString("es-CL")}
          </span>
        </div>
      </SelectItem>
    )),
    [cuentas]
  )

  /**
   * Envío del formulario: valida campos, guarda CDP en Firestore, descuenta presupuesto de la cuenta,
   * registra en bitácora, recarga cuentas y abre el PDF.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isLoading) {
      console.warn("Ya hay un proceso de guardado en curso")
      return
    }

    console.log("Iniciando validación del formulario...")
    console.log("Estado actual:", {
      fecha,
      cdpNumero,
      memoNumero,
      fechaMemo,
      cargoSolicitante,
      nombreSolicitante,
      destinoDisponibilidad,
      montoDisponibilidad,
      cuentaSeleccionada: cuentaSeleccionada?.id,
      numeroItemPresupuestario,
      nombreItemPresupuestario,
      areaGestion,
      programa,
      subPrograma
    })

    // Validación básica
    console.log("Validando fecha...", fecha)
    if (!fecha) {
      toast.error("Por favor seleccione la fecha")
      setIsLoading(false)
      return
    }
    console.log("Validando cdpNumero...", cdpNumero)
    if (!cdpNumero || cdpNumero.trim() === "") {
      toast.error("Por favor genere el número de CDP")
      setIsLoading(false)
      return
    }
    console.log("Validando memoNumero...", memoNumero)
    if (!memoNumero || memoNumero.trim() === "") {
      toast.error("Por favor ingrese el número de memo")
      setIsLoading(false)
      return
    }
    if (!fechaMemo) {
      setFechaMemoError(true)
      toast.error("Por favor seleccione la fecha del memo")
      setIsLoading(false)
      requestAnimationFrame(() => {
        fechaMemoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      })
      return
    }
    setFechaMemoError(false)
    if (!cargoSolicitante || cargoSolicitante.trim() === "") {
      toast.error("Por favor ingrese el cargo del solicitante")
      setIsLoading(false)
      return
    }
    if (!nombreSolicitante || nombreSolicitante.trim() === "") {
      toast.error("Por favor ingrese el nombre del solicitante")
      setIsLoading(false)
      return
    }
    if (!destinoDisponibilidad || destinoDisponibilidad.trim() === "") {
      toast.error("Por favor ingrese el destino de disponibilidad")
      setIsLoading(false)
      return
    }
    if (!montoDisponibilidad || montoDisponibilidad === "0" || montoDisponibilidad === "") {
      toast.error("Por favor ingrese un monto válido")
      setIsLoading(false)
      return
    }

    // Validar que haya una cuenta seleccionada
    if (!cuentaSeleccionada) {
      toast.error("Por favor seleccione una cuenta presupuestaria")
      setIsLoading(false)
      return
    }

    // Validar campos de item presupuestario (deben estar llenos por la cuenta seleccionada)
    if (!numeroItemPresupuestario || numeroItemPresupuestario.trim() === "") {
      toast.error("El código del item presupuestario no está disponible. Por favor seleccione otra cuenta")
      setIsLoading(false)
      return
    }
    if (!nombreItemPresupuestario || nombreItemPresupuestario.trim() === "") {
      toast.error("La denominación del item presupuestario no está disponible. Por favor seleccione otra cuenta")
      setIsLoading(false)
      return
    }
    if (!areaGestion || areaGestion.trim() === "") {
      toast.error("Por favor seleccione el área de gestión")
      setIsLoading(false)
      return
    }
    if (!programa || programa.trim() === "") {
      toast.error("Por favor ingrese el programa")
      setIsLoading(false)
      return
    }
    if (!subPrograma || subPrograma.trim() === "") {
      toast.error("Por favor ingrese el sub-programa")
      setIsLoading(false)
      return
    }

    // Validar campos Tipo B (Subtítulo 31)
    if (tipoCDP === "31") {
      if (!nombreProyecto || nombreProyecto.trim() === "") {
        toast.error("Por favor ingrese el nombre del estudio, programa o proyecto")
        setIsLoading(false)
        return
      }
      if (!codigoBIP || codigoBIP.trim() === "") {
        toast.error("Por favor ingrese el código BIP o INI")
        setIsLoading(false)
        return
      }
      if (!montoMaximoAnual || montoMaximoAnual === "0" || montoMaximoAnual === "") {
        toast.error("Por favor ingrese el monto máximo para el presente año")
        setIsLoading(false)
        return
      }
    }

    // Validar que la cuenta tenga presupuesto suficiente
    const montoSolicitado = Number(montoDisponibilidad)
    if (isNaN(montoSolicitado) || montoSolicitado <= 0) {
      toast.error("Por favor ingrese un monto válido mayor a cero")
      setIsLoading(false)
      return
    }
    if (cuentaSeleccionada.presupuestoDisponible < montoSolicitado) {
      toast.error(`Presupuesto insuficiente. Disponible: $${cuentaSeleccionada.presupuestoDisponible.toLocaleString("es-CL")}`)
      setIsLoading(false)
      return
    }

    console.log("Validaciones pasadas. Iniciando guardado...")
    
    // Verificar que Firebase esté inicializado
    if (!db) {
      toast.error("Error de conexión. Por favor recargue la página.")
      return
    }
    
    setIsLoading(true)

    try {
      console.log("Paso 1: Preparando datos del CDP...")
      console.log("Firebase db inicializado:", !!db)
      
      // Extraer el número de secuencia del CDP (evitar NaN si formato inesperado)
      const numSec = parseInt(cdpNumero.split("/")[0], 10)
      const numeroCDPSecuencia = Number.isNaN(numSec) ? 0 : numSec
      console.log("Número de secuencia CDP:", numeroCDPSecuencia)

      console.log("Paso 2: Creando objeto cdpData...")
      const cdpData: Record<string, any> = {
        fecha: Timestamp.fromDate(fecha),
        cdpNumero: cdpNumero,
        numeroCDPSecuencia: numeroCDPSecuencia,
        memoNumero: memoNumero.toUpperCase(),
        fechaMemo: Timestamp.fromDate(fechaMemo),
        cargoSolicitante: cargoSolicitante,
        nombreSolicitante: nombreSolicitante,
        destinoDisponibilidad: destinoDisponibilidad,
        montoDisponibilidad: montoSolicitado,
        numeroItemPresupuestario: numeroItemPresupuestario,
        nombreItemPresupuestario: nombreItemPresupuestario,
        cuentaId: cuentaSeleccionada.id,
        cuentaCodigo: cuentaSeleccionada.codigo,
        areaGestion: areaGestion,
        programa: programa,
        subPrograma: subPrograma,
        estado: "activo",
        // Campos IN4/2026
        tipoCDP: tipoCDP,
        entidadNombre: entidadNombre,
        entidadID: entidadID,
        subtitulo: desagregacionSubtitulo.trim() || "",
        item: desagregacionItem.trim() || "",
        asignacion: desagregacionAsignacion.trim() || "",
        subasignacion: desagregacionSubasignacion.trim() || "",
        anioPresupuestario: fecha.getFullYear(),
        funcionarioNombre: funcionarioSeleccionado?.nombre || "Alejandro Rojas Pinto",
        funcionarioTipo: funcionarioSeleccionado?.tipo || "titular",
        funcionarioFirmaPath: funcionarioSeleccionado?.firmaPath || "/firma.png",
        creadoPor: getDisplayName(user),
        creadoPorUid: user?.uid || null,
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      }

      // Campos específicos según tipo de CDP
      if (tipoCDP === "22-24-33") {
        cdpData.montoTotalPresupuesto = montoTotalPresupuesto
        cdpData.montoComprometidoFecha = montoComprometidoFecha
        cdpData.montoComprometidoActo = montoSolicitado
        cdpData.saldoFinal = saldoFinal
      } else {
        cdpData.nombreProyecto = nombreProyecto
        cdpData.codigoBIP = codigoBIP
        cdpData.montoMaximoAnual = Number(montoMaximoAnual) || 0
        cdpData.compromisosFuturosAnio = compromisosFuturosAnio
        cdpData.compromisosFuturosMonto = Number(compromisosFuturosMonto) || 0
      }
      console.log("cdpData creado:", cdpData)

      // Guardar documento en colección "cdp"
      console.log("Paso 3: Guardando en Firestore...")
      const docRef = await addDoc(collection(db, "cdp"), cdpData)

      console.log("Paso 4: CDP guardado con ID:", docRef.id)
      console.log("Datos guardados:", cdpData)

      console.log("Paso 5: Actualizando presupuesto de la cuenta...")
      // Descontar el monto del presupuesto disponible de la cuenta
      const cuentaRef = doc(db, "cuentas", cuentaSeleccionada.id)
      const nuevoPresupuestoDisponible = cuentaSeleccionada.presupuestoDisponible - montoSolicitado
      await updateDoc(cuentaRef, {
        presupuestoDisponible: nuevoPresupuestoDisponible,
        actualizadoEn: serverTimestamp(),
      })

      // Registrar en bitácora de movimientos de cuenta
      try {
        await registrarMovimientoCuenta({
          cuentaId: cuentaSeleccionada.id,
          codigoCuenta: cuentaSeleccionada.codigo,
          tipoAccion: "cdp_creado",
          descripcion: `CDP N° ${cdpNumero} creado. Monto certificado: $ ${montoSolicitado.toLocaleString("es-CL")}`,
          valorAnterior: { presupuestoDisponible: cuentaSeleccionada.presupuestoDisponible },
          valorNuevo: { presupuestoDisponible: nuevoPresupuestoDisponible },
          cdpId: docRef.id,
          cdpNumero,
          user: { name: user?.name, lastName: user?.lastName, email: user?.email, uid: user?.uid },
        })
      } catch (err) {
        console.error("Error al registrar en bitácora:", err)
      }
      
      console.log("Paso 6: Presupuesto actualizado. Nuevo disponible:", nuevoPresupuestoDisponible)
      
      console.log("Paso 6.1: Recargando lista de cuentas con presupuestos actualizados...")
      await loadCuentas()
      console.log("Paso 6.2: Cuentas recargadas correctamente")
      
      toast.success(
        `CDP registrado correctamente\nPresupuesto actualizado: $${nuevoPresupuestoDisponible.toLocaleString("es-CL")} disponibles`,
        { duration: 5000 }
      )
      
      // Preparar datos para el PDF (sin tocar generador: envía "22-24-33" o "31")
      const pdfData = {
        cdpNumero: cdpNumero,
        fecha: fecha,
        memoNumero: memoNumero,
        fechaMemo: fechaMemo,
        nombreSolicitante: nombreSolicitante,
        cargoSolicitante: cargoSolicitante,
        destinoDisponibilidad: destinoDisponibilidad,
        montoDisponibilidad: Number(montoDisponibilidad),
        numeroItemPresupuestario: numeroItemPresupuestario,
        nombreItemPresupuestario: nombreItemPresupuestario,
        areaGestion: areaGestion,
        programa: programa,
        subPrograma: subPrograma,
        tipoCDP: tipoCDP,
        entidadNombre: entidadNombre,
        entidadID: entidadID,
        subtitulo: desagregacionSubtitulo.trim() || "",
        item: desagregacionItem.trim() || "",
        asignacion: desagregacionAsignacion.trim() || "",
        subasignacion: desagregacionSubasignacion.trim() || "",
        anioPresupuestario: fecha.getFullYear(),
        funcionarioNombre: funcionarioSeleccionado?.nombre || "Alejandro Rojas Pinto",
        funcionarioTipo: funcionarioSeleccionado?.tipo || "titular",
        funcionarioFirmaPath: funcionarioSeleccionado?.firmaPath || "/firma.png",
        ...(tipoCDP === "22-24-33"
          ? {
              montoTotalPresupuesto: montoTotalPresupuesto,
              montoComprometidoFecha: montoComprometidoFecha,
              montoComprometidoActo: montoSolicitado,
              saldoFinal: saldoFinal,
            }
          : {
              nombreProyecto: nombreProyecto,
              codigoBIP: codigoBIP,
              montoMaximoAnual: Number(montoMaximoAnual) || 0,
              compromisosFuturosAnio: compromisosFuturosAnio,
              compromisosFuturosMonto: Number(compromisosFuturosMonto) || 0,
            }),
      }
      
      // Generar y abrir el PDF
      console.log("Paso 7: Generando PDF...")
      try {
        await abrirPDFCDP(pdfData)
        console.log("Paso 8: PDF generado correctamente")
        toast.success("PDF generado correctamente")
      } catch (pdfError: any) {
        console.error("Error al generar el PDF:", pdfError)
        console.error("Detalles del error PDF:", pdfError?.message, pdfError?.stack)
        // No bloquear el proceso si falla el PDF
        toast.error("CDP guardado pero hubo un error al generar el PDF")
      }
      
      console.log("Paso 9: Reseteando formulario...")
      try {
        await handleReset()
        console.log("Paso 10: Formulario reseteado correctamente")
      } catch (resetError: any) {
        console.error("Error al resetear formulario:", resetError)
        // Continuar aunque falle el reset
      }
      
      console.log("Paso 11: Proceso completado exitosamente")
    } catch (error: any) {
      console.error("Error completo al guardar el CDP:", error)
      console.error("Mensaje de error:", error?.message)
      console.error("Stack:", error?.stack)
      console.error("Código de error:", error?.code)
      console.error("Detalles completos:", JSON.stringify(error, null, 2))
      toast.error(`Error al guardar el CDP: ${error?.message || "Intente nuevamente"}`)
    } finally {
      console.log("Finalizando proceso (finally)...")
      setIsLoading(false)
    }
  }

  /** Limpia todos los campos del formulario y regenera el número de CDP */
  const handleReset = async () => {
    setFecha(new Date())
    setCdpNumero("")
    setMemoNumero("")
    setFechaMemo(undefined)
    setCargoSolicitante("")
    setNombreSolicitante("")
    setDestinoDisponibilidad("")
    setMontoDisponibilidad("")
    setMontoDisplay("")
    setCuentaSeleccionada(null)
    setNumeroItemPresupuestario("")
    setNombreItemPresupuestario("")
    setDesagregacionSubtitulo("")
    setDesagregacionItem("")
    setDesagregacionAsignacion("")
    setDesagregacionSubasignacion("")
    setAreaGestion("")
    setPrograma("")
    setSubPrograma("")
    setTipoCDP("22-24-33")
    setNombreProyecto("")
    setCodigoBIP("")
    setMontoMaximoAnual("")
    setMontoMaximoAnualDisplay("")
    setCompromisosFuturosAnio("")
    setCompromisosFuturosMonto("")
    setCompromisosFuturosMontoDisplay("")
    if (funcionarios.length > 0) setFuncionarioSeleccionado(funcionarios[0])
    await generarNumeroCDP()
  }

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="h-7 w-7 text-[#1a2da6]" />
              Crear CDP (Certificado de Disponibilidad Presupuestaria)
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Complete el formulario para registrar un nuevo CDP
            </p>
          </div>
        </div>

        {/* Formulario Principal */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Tipo de CDP y Datos de Entidad */}
          <Card className="border-l-4 border-l-[#1a2da6]">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Info className="h-5 w-5 text-[#1a2da6]" />
                Tipo de CDP y Entidad Emisora
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Tipo de CDP (subtítulo) */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm font-medium">
                    <FileText className="h-4 w-4 text-[#1a2da6]" />
                    Tipo de CDP * (subtítulo)
                  </Label>
                  <Select value={tipoCDP} onValueChange={(v: "22-24-33" | "31") => setTipoCDP(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccione subtítulo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="22-24-33">Subtítulo 21 al 30, 32 y 33</SelectItem>
                      <SelectItem value="31">Subtítulo 31</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400">
                    {tipoCDP === "31"
                      ? "Iniciativas de Inversión (estudios, programas, proyectos)"
                      : "Bienes y servicios, transferencias corrientes, de capital y préstamos"}
                  </p>
                </div>

                {/* Nombre Entidad */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm font-medium">
                    <Building2 className="h-4 w-4 text-[#1a2da6]" />
                    Entidad Emisora
                  </Label>
                  <Input
                    value={entidadNombre}
                    readOnly
                    className="bg-gray-50 dark:bg-gray-800"
                    placeholder="Configurar en Configuración > Entidad"
                  />
                </div>

                {/* ID Codificador */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm font-medium">
                    <Hash className="h-4 w-4 text-[#1a2da6]" />
                    ID Codificador del Estado
                  </Label>
                  <Input
                    value={entidadID}
                    readOnly
                    className="bg-gray-50 dark:bg-gray-800"
                    placeholder="Configurar en Configuración > Entidad"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Funcionario Emisor */}
          <Card className="border-l-4 border-l-[#adca1f]">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-[#adca1f]" />
                Funcionario Emisor del CDP
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm font-medium">
                    <User className="h-4 w-4 text-[#adca1f]" />
                    Quien suscribe el documento *
                  </Label>
                  <Select
                    value={funcionarioSeleccionado?.id || ""}
                    onValueChange={(id) => {
                      const func = funcionarios.find((f) => f.id === id)
                      if (func) setFuncionarioSeleccionado(func)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione un funcionario" />
                    </SelectTrigger>
                    <SelectContent>
                      {funcionarios.map((func) => (
                        <SelectItem key={func.id} value={func.id}>
                          {func.nombre} {func.tipo === "subrogante" ? "(S)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {funcionarioSeleccionado && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-500">Cargo en el documento</Label>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 pt-2">
                      {funcionarioSeleccionado.tipo === "titular"
                        ? "DIRECTOR DE ADMINISTRACIÓN Y FINANZAS"
                        : "DIRECTOR(S) DE ADMINISTRACIÓN Y FINANZAS"}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Información General del CDP */}
          <Card className="border-l-4 border-l-[#1a2da6]">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#1a2da6]" />
                Información General del CDP
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Fecha */}
                <div className="space-y-2">
                  <Label htmlFor="fecha" className="flex items-center gap-1.5 text-sm font-medium">
                    <CalendarIcon className="h-4 w-4 text-[#1a2da6]" />
                    Fecha *
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !fecha && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {fecha ? format(fecha, "dd/MM/yyyy", { locale: es }) : "Seleccionar"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={fecha}
                        onSelect={(date) => date && setFecha(date)}
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* CDP N° */}
                <div className="space-y-2">
                  <Label htmlFor="cdpNumero" className="flex items-center gap-1.5 text-sm font-medium">
                    <Hash className="h-4 w-4 text-[#1a2da6]" />
                    CDP N° *
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="cdpNumero"
                      placeholder="00001/2026"
                      value={cdpNumero}
                      readOnly
                      required
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => generarNumeroCDP(true)}
                      disabled={isGeneratingCDP || isLoading}
                      className="whitespace-nowrap"
                    >
                      {isGeneratingCDP ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Generar"
                      )}
                    </Button>
                  </div>
                </div>

                {/* Memo N° */}
                <div className="space-y-2">
                  <Label htmlFor="memoNumero" className="flex items-center gap-1.5 text-sm font-medium">
                    <Hash className="h-4 w-4 text-[#1a2da6]" />
                    Memo N° *
                  </Label>
                  <Input
                    id="memoNumero"
                    placeholder="Ej: MEMO-2024-001"
                    value={memoNumero}
                    onChange={(e) => setMemoNumero(e.target.value.toUpperCase())}
                    required
                    className="uppercase"
                  />
                </div>

                {/* Fecha Memo */}
                <div ref={fechaMemoRef} className="space-y-2">
                  <Label htmlFor="fechaMemo" className="flex items-center gap-1.5 text-sm font-medium">
                    <CalendarIcon className="h-4 w-4 text-[#1a2da6]" />
                    Fecha Memo *
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !fechaMemo && "text-muted-foreground",
                          fechaMemoError && "border-destructive focus-visible:ring-destructive"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {fechaMemo ? format(fechaMemo, "dd/MM/yyyy", { locale: es }) : "Seleccionar"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={fechaMemo}
                        onSelect={(date) => {
                          setFechaMemo(date)
                          setFechaMemoError(false)
                        }}
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                  {fechaMemoError && (
                    <p className="text-sm text-destructive">Seleccione la fecha del memo antes de continuar.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Información del Solicitante */}
          <Card className="border-l-4 border-l-[#adca1f]">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-[#adca1f]" />
                Información del Solicitante
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cargo Solicitante */}
                <div className="space-y-2">
                  <Label htmlFor="cargoSolicitante" className="flex items-center gap-1.5 text-sm font-medium">
                    <Building2 className="h-4 w-4 text-[#adca1f]" />
                    Cargo Solicitante *
                  </Label>
                  <FastInput
                    id="cargoSolicitante"
                    placeholder="Ingrese el cargo"
                    value={cargoSolicitante}
                    onValueChange={setCargoSolicitante}
                    required
                  />
                </div>

                {/* Nombre Solicitante */}
                <div className="space-y-2">
                  <Label htmlFor="nombreSolicitante" className="flex items-center gap-1.5 text-sm font-medium">
                    <User className="h-4 w-4 text-[#adca1f]" />
                    Nombre Solicitante *
                  </Label>
                  <FastInput
                    id="nombreSolicitante"
                    placeholder="Ingrese el nombre completo"
                    value={nombreSolicitante}
                    onValueChange={setNombreSolicitante}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Información Presupuestaria */}
          <Card className="border-l-4 border-l-[#1a2da6]">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-[#1a2da6]" />
                Información Presupuestaria
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Destino Disponibilidad */}
                <div className="space-y-2">
                  <Label htmlFor="destinoDisponibilidad" className="flex items-center gap-1.5 text-sm font-medium">
                    <FileText className="h-4 w-4 text-[#1a2da6]" />
                    Destino Disponibilidad *
                  </Label>
                  <FastInput
                    id="destinoDisponibilidad"
                    placeholder="Ingrese el destino"
                    value={destinoDisponibilidad}
                    onValueChange={setDestinoDisponibilidad}
                    required
                  />
                </div>

                {/* Monto Disponibilidad */}
                <div className="space-y-2">
                  <Label htmlFor="montoDisponibilidad" className="flex items-center gap-1.5 text-sm font-medium">
                    <DollarSign className="h-4 w-4 text-[#1a2da6]" />
                    Monto Disponibilidad *
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium">$</span>
                    <FastMontoInput
                      id="montoDisponibilidad"
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={montoDisponibilidad}
                      onValueChange={setMontoDisponibilidad}
                      className="pl-8"
                      required
                    />
                  </div>
                </div>

                {/* Cuenta Presupuestaria */}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cuenta" className="flex items-center gap-1.5 text-sm font-medium">
                    <Building2 className="h-4 w-4 text-[#1a2da6]" />
                    Cuenta Presupuestaria *
                  </Label>
                  <Popover open={cuentaComboOpen} onOpenChange={setCuentaComboOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={cuentaComboOpen}
                        className="w-full justify-between font-normal h-auto min-h-10"
                      >
                        {cuentaSeleccionada ? (
                          <div className="flex items-center gap-2 text-left">
                            <span className="font-mono text-sm font-semibold">{cuentaSeleccionada.codigo}</span>
                            <span className="text-xs text-gray-500 truncate">{cuentaSeleccionada.denominacion}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Seleccione una cuenta presupuestaria</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0 max-h-80 overflow-y-auto" align="start">
                      {!cuentasListReady ? (
                        <div className="flex items-center justify-center gap-2 py-6">
                          <Loader2 className="h-4 w-4 animate-spin text-[#1a2da6]" />
                          <span className="text-sm text-gray-500">Cargando cuentas...</span>
                        </div>
                      ) : (
                        <div className="py-1">
                          {cuentas.map((cuenta) => (
                            <button
                              key={cuenta.id}
                              type="button"
                              onClick={() => {
                                handleCuentaSelect(cuenta.id)
                                setCuentaComboOpen(false)
                              }}
                              className={cn(
                                "flex items-center w-full gap-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
                                cuentaSeleccionada?.id === cuenta.id && "bg-blue-50 dark:bg-blue-900/20"
                              )}
                            >
                              <Check className={cn("h-4 w-4 shrink-0", cuentaSeleccionada?.id === cuenta.id ? "text-[#1a2da6] opacity-100" : "opacity-0")} />
                              <div className="flex items-center justify-between w-full gap-2 min-w-0">
                                <div className="flex flex-col flex-1 min-w-0">
                                  <span className="font-mono text-sm font-semibold truncate">{cuenta.codigo}</span>
                                  <span className="text-xs text-gray-500 truncate">{cuenta.denominacion}</span>
                                </div>
                                <span className={`text-xs font-bold whitespace-nowrap ${
                                  cuenta.presupuestoDisponible > cuenta.presupuestoTotal * 0.5
                                    ? "text-green-600"
                                    : cuenta.presupuestoDisponible > cuenta.presupuestoTotal * 0.2
                                    ? "text-yellow-600"
                                    : "text-red-600"
                                }`}>
                                  ${cuenta.presupuestoDisponible.toLocaleString("es-CL")}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  
                  {cuentaInfoPanel}
                  {quedaDisponiblePanel}
                </div>

                {montosPanel}
              </div>
            </CardContent>
          </Card>

          {/* Campos Tipo B — Iniciativas de Inversión (Subtítulo 31) */}
          {tipoCDP === "31" && (
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-purple-500" />
                  Iniciativa de Inversión (Subtítulo 31)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Nombre del Proyecto */}
                  <div className="space-y-2">
                    <Label htmlFor="nombreProyecto" className="flex items-center gap-1.5 text-sm font-medium">
                      <FileText className="h-4 w-4 text-purple-500" />
                      Nombre del Estudio, Programa o Proyecto *
                    </Label>
                    <FastInput
                      id="nombreProyecto"
                      placeholder="Ingrese el nombre"
                      value={nombreProyecto}
                      onValueChange={setNombreProyecto}
                      required={tipoCDP === "31"}
                    />
                  </div>

                  {/* Código BIP / INI */}
                  <div className="space-y-2">
                    <Label htmlFor="codigoBIP" className="flex items-center gap-1.5 text-sm font-medium">
                      <Hash className="h-4 w-4 text-purple-500" />
                      Código BIP o INI *
                    </Label>
                    <FastInput
                      id="codigoBIP"
                      placeholder="Ej: 30123456-0 o INI-001"
                      value={codigoBIP}
                      onValueChange={setCodigoBIP}
                      required={tipoCDP === "31"}
                    />
                    <p className="text-xs text-gray-400">
                      Código del Banco Integrado de Proyectos (BIP) o código INI municipal
                    </p>
                  </div>

                  {/* Monto Máximo Anual */}
                  <div className="space-y-2">
                    <Label htmlFor="montoMaximoAnual" className="flex items-center gap-1.5 text-sm font-medium">
                      <DollarSign className="h-4 w-4 text-purple-500" />
                      Monto Máximo para el Presente Año *
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium">$</span>
                      <FastMontoInput
                        id="montoMaximoAnual"
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={montoMaximoAnual}
                        onValueChange={setMontoMaximoAnual}
                        className="pl-8"
                        required={tipoCDP === "31"}
                      />
                    </div>
                  </div>

                  {/* Compromisos Futuros */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5 text-sm font-medium">
                      <DollarSign className="h-4 w-4 text-purple-500" />
                      Compromisos Futuros
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="compromisosFuturosAnio" className="text-xs text-gray-500">Año(s)</Label>
                        <FastInput
                          id="compromisosFuturosAnio"
                          placeholder="Ej: 2027 o 2027-2028"
                          value={compromisosFuturosAnio}
                          onValueChange={setCompromisosFuturosAnio}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="compromisosFuturosMonto" className="text-xs text-gray-500">Monto ($)</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium">$</span>
                          <FastMontoInput
                            id="compromisosFuturosMonto"
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={compromisosFuturosMonto}
                            onValueChange={setCompromisosFuturosMonto}
                            className="pl-8"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Área de Gestión y Programas */}
          <Card className="border-l-4 border-l-[#adca1f]">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#adca1f]" />
                Área de Gestión y Programas
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Área de Gestión */}
                <div className="space-y-2">
                  <Label htmlFor="areaGestion" className="flex items-center gap-1.5 text-sm font-medium">
                    <Building2 className="h-4 w-4 text-[#adca1f]" />
                    Área de Gestión *
                  </Label>
                  <Select value={areaGestion} onValueChange={setAreaGestion}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar área" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="(1) Gestión Interna">(1) Gestión Interna</SelectItem>
                      <SelectItem value="(2) Servicios Comunitarios">(2) Servicios Comunitarios</SelectItem>
                      <SelectItem value="(3) Actividades Municipales">(3) Actividades Municipales</SelectItem>
                      <SelectItem value="(4) Programas Sociales">(4) Programas Sociales</SelectItem>
                      <SelectItem value="(5) Programas Recreacionales">(5) Programas Recreacionales</SelectItem>
                      <SelectItem value="(6) Programas Culturales">(6) Programas Culturales</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Programa */}
                <div className="space-y-2">
                  <Label htmlFor="programa" className="flex items-center gap-1.5 text-sm font-medium">
                    <FileText className="h-4 w-4 text-[#adca1f]" />
                    Programa *
                  </Label>
                  <FastInput
                    id="programa"
                    placeholder="Ingrese el programa"
                    value={programa}
                    onValueChange={setPrograma}
                    required
                  />
                </div>

                {/* Sub-Programa */}
                <div className="space-y-2">
                  <Label htmlFor="subPrograma" className="flex items-center gap-1.5 text-sm font-medium">
                    <FileText className="h-4 w-4 text-[#adca1f]" />
                    Sub-Programa *
                  </Label>
                  <FastInput
                    id="subPrograma"
                    placeholder="Ingrese el sub-programa"
                    value={subPrograma}
                    onValueChange={setSubPrograma}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Botones de Acción */}
          <div className="flex gap-3 justify-end">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleReset}
              className="px-6"
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="bg-[#1a2da6] hover:bg-[#1a2da6]/90 px-8"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Guardar CDP
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

