"use client"

/**
 * Componente del historial de CDPs (listado, detalle, edición y eliminación).
 * - Carga los CDPs desde Firestore ordenados por creadoEn con paginación.
 * - Permite ver detalle, editar (según rol) y eliminar; al editar/eliminar actualiza la cuenta presupuestaria y registra en bitácora.
 * - Incluye descarga y apertura del PDF del CDP.
 */
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FileText, Loader2, Package, Download, Eye, Trash2, Edit, CalendarIcon, Save, ChevronLeft, ChevronRight, CheckCircle, Stamp } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { toast } from "sonner"
import { db } from "@/lib/firebase"
import { collection, getDocs, query, orderBy, Timestamp, deleteDoc, doc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore"
import { descargarPDFCDP, abrirPDFCDP } from "@/lib/pdf-generator"
import { useAuth } from "@/context/auth-context"
import { cn, getSubtituloFromCodigoCuenta, parseDesagregacionFromCodigoCuenta, toDateSafe } from "@/lib/utils"
import { registrarMovimientoCuenta } from "@/lib/bitacora"

/** A partir de esta fecha (inclusive) los CDP pueden ser oficializados. Antes no. */
const OFICIALIZAR_FECHA_DESDE = new Date(2026, 2, 2) // 02/03/2026

function puedeOficializarCDP(cdp: CDP): boolean {
  const d = toDateSafe(cdp.fecha)
  if (!d) return false
  const diaCDP = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return diaCDP >= OFICIALIZAR_FECHA_DESDE.getTime()
}

/** Documento CDP tal como se guarda en Firestore (con Timestamp y campos IN4/2026) */
interface CDP {
  id: string
  fecha: Timestamp
  cdpNumero: string
  memoNumero: string
  fechaMemo: Timestamp
  cargoSolicitante: string
  nombreSolicitante: string
  destinoDisponibilidad: string
  montoDisponibilidad: number
  numeroItemPresupuestario: string
  nombreItemPresupuestario: string
  areaGestion: string
  programa: string
  subPrograma: string
  estado: string
  creadoPor: string
  creadoEn: Timestamp
  cuentaId?: string
  /** Campos IN4/2026 */
  tipoCDP?: "22-24-33" | "31"
  entidadNombre?: string
  entidadID?: string
  subtitulo?: string
  item?: string
  asignacion?: string
  subasignacion?: string
  anioPresupuestario?: number
  montoTotalPresupuesto?: number
  montoComprometidoFecha?: number
  montoComprometidoActo?: number
  saldoFinal?: number
  nombreProyecto?: string
  codigoBIP?: string
  montoMaximoAnual?: number
  compromisosFuturosAnio?: string
  compromisosFuturosMonto?: number
  funcionarioNombre?: string
  funcionarioTipo?: "titular" | "subrogante"
  funcionarioFirmaPath?: string
  /** Si true, el CDP está oficializado y ya no se puede editar */
  oficializado?: boolean
  oficializadoEn?: Timestamp
  oficializadoPor?: string
}

/** Cuenta presupuestaria (solo campos necesarios para el selector de edición) */
interface Cuenta {
  id: string
  codigo: string
  denominacion: string
  presupuestoTotal: number
  presupuestoDisponible: number
}

/** Payload que envía el formulario de edición al guardar (evita estado en el padre y lag al escribir) */
export type EditCDPFormPayload = {
  editTipoCDP: "22-24-33" | "31"
  editFecha: Date | undefined
  editFechaMemo: Date | undefined
  editMemoNumero: string
  editCargoSolicitante: string
  editNombreSolicitante: string
  editDestinoDisponibilidad: string
  editMontoDisponibilidad: string
  editCuentaId: string
  editAreaGestion: string
  editPrograma: string
  editSubPrograma: string
  editNombreProyecto: string
  editCodigoBIP: string
  editMontoMaximoAnual: string
  editCompromisosFuturosAnio: string
  editCompromisosFuturosMonto: string
}

/** Formulario de edición de CDP con estado local para no re-renderizar el listado al escribir */
function EditCDPFormDialog({
  open,
  onOpenChange,
  cdp,
  cuentas,
  onSave,
  isSaving,
  formatMontoFn,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cdp: CDP | null
  cuentas: Cuenta[]
  onSave: (payload: EditCDPFormPayload) => void | Promise<void>
  isSaving: boolean
  formatMontoFn: (n: number) => string
}) {
  const [editTipoCDP, setEditTipoCDP] = useState<"22-24-33" | "31">("22-24-33")
  const [editFecha, setEditFecha] = useState<Date>()
  const [editFechaMemo, setEditFechaMemo] = useState<Date>()
  const [editMemoNumero, setEditMemoNumero] = useState("")
  const [editCargoSolicitante, setEditCargoSolicitante] = useState("")
  const [editNombreSolicitante, setEditNombreSolicitante] = useState("")
  const [editDestinoDisponibilidad, setEditDestinoDisponibilidad] = useState("")
  const [editMontoDisponibilidad, setEditMontoDisponibilidad] = useState("")
  const [editMontoDisplay, setEditMontoDisplay] = useState("")
  const [editCuentaId, setEditCuentaId] = useState("")
  const [editAreaGestion, setEditAreaGestion] = useState("")
  const [editPrograma, setEditPrograma] = useState("")
  const [editSubPrograma, setEditSubPrograma] = useState("")
  const [editNombreProyecto, setEditNombreProyecto] = useState("")
  const [editCodigoBIP, setEditCodigoBIP] = useState("")
  const [editMontoMaximoAnual, setEditMontoMaximoAnual] = useState("")
  const [editMontoMaximoAnualDisplay, setEditMontoMaximoAnualDisplay] = useState("")
  const [editCompromisosFuturosAnio, setEditCompromisosFuturosAnio] = useState("")
  const [editCompromisosFuturosMonto, setEditCompromisosFuturosMonto] = useState("")
  const [editCompromisosFuturosMontoDisplay, setEditCompromisosFuturosMontoDisplay] = useState("")

  useEffect(() => {
    if (!open || !cdp) return
    const tipo = cdp.tipoCDP ?? "22-24-33"
    setEditTipoCDP(tipo)
    setEditFecha(toDateSafe(cdp.fecha) ?? undefined)
    setEditFechaMemo(toDateSafe(cdp.fechaMemo) ?? undefined)
    setEditMemoNumero(cdp.memoNumero)
    setEditCargoSolicitante(cdp.cargoSolicitante)
    setEditNombreSolicitante(cdp.nombreSolicitante)
    setEditDestinoDisponibilidad(cdp.destinoDisponibilidad)
    setEditMontoDisponibilidad(cdp.montoDisponibilidad.toString())
    setEditMontoDisplay(formatMontoFn(cdp.montoDisponibilidad))
    setEditCuentaId(cdp.cuentaId || "")
    setEditAreaGestion(cdp.areaGestion)
    setEditPrograma(cdp.programa)
    setEditSubPrograma(cdp.subPrograma)
    if (tipo === "31") {
      setEditNombreProyecto(cdp.nombreProyecto ?? "")
      setEditCodigoBIP(cdp.codigoBIP ?? "")
      setEditMontoMaximoAnual(String(cdp.montoMaximoAnual ?? ""))
      setEditMontoMaximoAnualDisplay(cdp.montoMaximoAnual != null ? formatMontoFn(cdp.montoMaximoAnual) : "")
      setEditCompromisosFuturosAnio(cdp.compromisosFuturosAnio ?? "")
      setEditCompromisosFuturosMonto(String(cdp.compromisosFuturosMonto ?? ""))
      setEditCompromisosFuturosMontoDisplay(cdp.compromisosFuturosMonto != null ? formatMontoFn(cdp.compromisosFuturosMonto) : "")
    } else {
      setEditNombreProyecto("")
      setEditCodigoBIP("")
      setEditMontoMaximoAnual("")
      setEditMontoMaximoAnualDisplay("")
      setEditCompromisosFuturosAnio("")
      setEditCompromisosFuturosMonto("")
      setEditCompromisosFuturosMontoDisplay("")
    }
  }, [open, cdp, formatMontoFn])

  const handleMontoChange = (value: string) => {
    const numericValue = value.replace(/\D/g, "")
    setEditMontoDisponibilidad(numericValue)
    setEditMontoDisplay(numericValue ? (Number.isNaN(Number.parseInt(numericValue, 10)) ? "" : Number.parseInt(numericValue, 10).toLocaleString("es-CL")) : "")
  }
  const handleCuentaChange = (cuentaId: string) => setEditCuentaId(cuentaId)
  const handleMontoMaximoAnualChange = (value: string) => {
    const numericValue = value.replace(/\D/g, "")
    setEditMontoMaximoAnual(numericValue)
    setEditMontoMaximoAnualDisplay(numericValue ? (Number.isNaN(Number.parseInt(numericValue, 10)) ? "" : Number.parseInt(numericValue, 10).toLocaleString("es-CL")) : "")
  }
  const handleCompromisosFuturosMontoChange = (value: string) => {
    const numericValue = value.replace(/\D/g, "")
    setEditCompromisosFuturosMonto(numericValue)
    setEditCompromisosFuturosMontoDisplay(numericValue ? (Number.isNaN(Number.parseInt(numericValue, 10)) ? "" : Number.parseInt(numericValue, 10).toLocaleString("es-CL")) : "")
  }

  const handleSubmit = () => {
    if (!editFecha || !editFechaMemo) {
      toast.error("Debe seleccionar las fechas")
      return
    }
    if (!editMemoNumero?.trim() || !editCargoSolicitante?.trim() || !editNombreSolicitante?.trim() || !editDestinoDisponibilidad?.trim()) {
      toast.error("Debe completar todos los campos obligatorios")
      return
    }
    const nuevoMontoParsed = Number.parseInt(editMontoDisponibilidad || "0", 10)
    if (Number.isNaN(nuevoMontoParsed) || nuevoMontoParsed <= 0) {
      toast.error("El monto debe ser mayor a 0")
      return
    }
    if (!editCuentaId) {
      toast.error("Debe seleccionar una cuenta presupuestaria")
      return
    }
    if (editTipoCDP === "31") {
      if (!editNombreProyecto?.trim()) {
        toast.error("Debe ingresar el nombre del proyecto (Tipo 31)")
        return
      }
      if (!editCodigoBIP?.trim()) {
        toast.error("Debe ingresar el código BIP (Tipo 31)")
        return
      }
    }
    onSave({
      editTipoCDP,
      editFecha,
      editFechaMemo,
      editMemoNumero: editMemoNumero.trim(),
      editCargoSolicitante: editCargoSolicitante.trim(),
      editNombreSolicitante: editNombreSolicitante.trim(),
      editDestinoDisponibilidad: editDestinoDisponibilidad.trim(),
      editMontoDisponibilidad,
      editCuentaId,
      editAreaGestion,
      editPrograma,
      editSubPrograma,
      editNombreProyecto: editNombreProyecto.trim(),
      editCodigoBIP: editCodigoBIP.trim(),
      editMontoMaximoAnual,
      editCompromisosFuturosAnio: editCompromisosFuturosAnio.trim(),
      editCompromisosFuturosMonto,
    })
  }

  if (!cdp) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Edit className="h-6 w-6 text-blue-600" />
            Editar CDP N° {cdp.cdpNumero}
          </DialogTitle>
          <DialogDescription>
            Modifique los campos necesarios y guarde los cambios. Los montos se ajustarán automáticamente en las cuentas presupuestarias.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-red-600 dark:text-red-400 font-medium">
          Si cambia el tipo de CDP, no olvide cambiar la cuenta presupuestaria correspondiente.
        </p>
        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b pb-2">Información General</h3>
            <div className="space-y-2">
              <Label>Tipo de CDP</Label>
              <Select value={editTipoCDP} onValueChange={(v) => setEditTipoCDP(v as "22-24-33" | "31")}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="22-24-33">Subtítulo 21 al 30, 32 y 33</SelectItem>
                  <SelectItem value="31">Subtítulo 31</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-fecha">Fecha *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button id="edit-fecha" variant="outline" className={cn("w-full justify-start text-left font-normal", !editFecha && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editFecha ? format(editFecha, "PPP", { locale: es }) : "Seleccionar fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editFecha} onSelect={(date) => setEditFecha(date)} locale={es} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-memo">Memo N° *</Label>
                <Input id="edit-memo" value={editMemoNumero} onChange={(e) => setEditMemoNumero(e.target.value)} placeholder="Ej: 123/2026" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-fecha-memo">Fecha Memo *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button id="edit-fecha-memo" variant="outline" className={cn("w-full justify-start text-left font-normal", !editFechaMemo && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editFechaMemo ? format(editFechaMemo, "PPP", { locale: es }) : "Seleccionar fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editFechaMemo} onSelect={(date) => setEditFechaMemo(date)} locale={es} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b pb-2">Información del Solicitante</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-nombre">Nombre Solicitante *</Label>
                <Input id="edit-nombre" value={editNombreSolicitante} onChange={(e) => setEditNombreSolicitante(e.target.value)} placeholder="Nombre completo" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cargo">Cargo Solicitante *</Label>
                <Input id="edit-cargo" value={editCargoSolicitante} onChange={(e) => setEditCargoSolicitante(e.target.value)} placeholder="Cargo del solicitante" />
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b pb-2">Información Presupuestaria</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-monto">Monto Disponibilidad *</Label>
                <Input id="edit-monto" value={editMontoDisplay} onChange={(e) => handleMontoChange(e.target.value)} placeholder="$ 0" className="text-lg font-semibold" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cuenta">Cuenta Presupuestaria *</Label>
                <Select value={editCuentaId} onValueChange={handleCuentaChange}>
                  <SelectTrigger id="edit-cuenta" className="w-full">
                    <SelectValue placeholder="Seleccione una cuenta">
                      {editCuentaId && (() => {
                        const cuentaActual = cuentas.find(c => c.id === editCuentaId)
                        return cuentaActual ? (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{cuentaActual.codigo}</span>
                            <span className="text-sm text-gray-600">-</span>
                            <span className="text-sm truncate">{cuentaActual.denominacion}</span>
                            <span className="text-sm font-semibold text-green-600 ml-auto">$ {cuentaActual.presupuestoDisponible.toLocaleString("es-CL")}</span>
                          </div>
                        ) : "Seleccione una cuenta"
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[400px]">
                    {cuentas.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">No hay cuentas disponibles. Cargando...</div>}
                    {cuentas.map((cuenta) => (
                      <SelectItem key={cuenta.id} value={cuenta.id} className="cursor-pointer">
                        <div className="flex items-start gap-2 py-1">
                          <span className="font-semibold text-gray-900 min-w-[180px]">{cuenta.codigo}</span>
                          <span className="text-sm text-gray-600 flex-1 truncate max-w-[300px]" title={cuenta.denominacion}>{cuenta.denominacion}</span>
                          <span className="text-sm font-semibold text-green-600 ml-auto whitespace-nowrap">$ {cuenta.presupuestoDisponible.toLocaleString("es-CL")}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editCuentaId && (() => {
                  const cuentaSeleccionadaEdit = cuentas.find(c => c.id === editCuentaId)
                  const montoEdit = Number.parseInt(editMontoDisponibilidad || "0")
                  const montoOriginal = cdp?.montoDisponibilidad || 0
                  const esMismaCuenta = editCuentaId === cdp?.cuentaId
                  if (cuentaSeleccionadaEdit) {
                    let presupuestoProyectado = cuentaSeleccionadaEdit.presupuestoDisponible
                    if (esMismaCuenta) presupuestoProyectado = presupuestoProyectado + montoOriginal - montoEdit
                    else presupuestoProyectado = presupuestoProyectado - montoEdit
                    const suficiente = presupuestoProyectado >= 0
                    return (
                      <div className={cn("text-sm px-3 py-2 rounded-md mt-2", suficiente ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300")}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{suficiente ? "✓ Presupuesto suficiente" : "✗ Presupuesto insuficiente"}</span>
                        </div>
                        <div className="text-xs mt-1 space-y-0.5">
                          <div>Disponible actual: ${cuentaSeleccionadaEdit.presupuestoDisponible.toLocaleString("es-CL")}</div>
                          <div>Quedará disponible: ${presupuestoProyectado.toLocaleString("es-CL")}</div>
                        </div>
                      </div>
                    )
                  }
                  return null
                })()}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b pb-2">Área de Gestión y Programas</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-area">Área de Gestión</Label>
                <Input id="edit-area" value={editAreaGestion} onChange={(e) => setEditAreaGestion(e.target.value)} placeholder="Área" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-programa">Programa</Label>
                <Input id="edit-programa" value={editPrograma} onChange={(e) => setEditPrograma(e.target.value)} placeholder="Programa" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-subprograma">Sub-Programa</Label>
                <Input id="edit-subprograma" value={editSubPrograma} onChange={(e) => setEditSubPrograma(e.target.value)} placeholder="Sub-Programa" />
              </div>
            </div>
          </div>
          {editTipoCDP === "31" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b pb-2">Datos Subtítulo 31</h3>
              {editCuentaId && (() => {
                const cuentaEdit = cuentas.find((c) => c.id === editCuentaId)
                if (!cuentaEdit) return null
                return (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-600 dark:text-gray-400">Código:</span><span className="ml-2 font-mono font-semibold">{cuentaEdit.codigo}</span></div>
                      <div><span className="text-gray-600 dark:text-gray-400">Presupuesto Total:</span><span className="ml-2 font-semibold">$ {cuentaEdit.presupuestoTotal.toLocaleString("es-CL")}</span></div>
                      <div className="col-span-2"><span className="text-gray-600 dark:text-gray-400">Denominación:</span><span className="ml-2 font-semibold">{cuentaEdit.denominacion}</span></div>
                      <div className="col-span-2"><span className="text-gray-600 dark:text-gray-400">Presupuesto Disponible:</span><span className={cn("ml-2 font-semibold", cuentaEdit.presupuestoDisponible > cuentaEdit.presupuestoTotal * 0.5 ? "text-green-600" : cuentaEdit.presupuestoDisponible > cuentaEdit.presupuestoTotal * 0.2 ? "text-yellow-600" : "text-red-600")}>$ {cuentaEdit.presupuestoDisponible.toLocaleString("es-CL")}</span></div>
                    </div>
                  </div>
                )
              })()}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-nombre-proyecto">Nombre proyecto *</Label>
                  <Input id="edit-nombre-proyecto" value={editNombreProyecto} onChange={(e) => setEditNombreProyecto(e.target.value)} placeholder="Nombre del proyecto" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-codigo-bip">Código BIP *</Label>
                  <Input id="edit-codigo-bip" value={editCodigoBIP} onChange={(e) => setEditCodigoBIP(e.target.value)} placeholder="Código BIP o INI" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-monto-max-anual">Monto máximo para el presente año *</Label>
                  <div className="flex items-center h-10 rounded-md border border-input bg-muted/50 px-3 text-sm">
                    <span className="text-gray-500 font-medium mr-1">$</span>
                    <span className="font-semibold">{cuentas.find((x) => x.id === editCuentaId) ? cuentas.find((x) => x.id === editCuentaId)!.presupuestoTotal.toLocaleString("es-CL") : "—"}</span>
                  </div>
                  <p className="text-xs text-gray-500">Se toma del presupuesto total de la cuenta seleccionada.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-compromisos-anio">Compromisos futuros - Año(s)</Label>
                  <Input id="edit-compromisos-anio" value={editCompromisosFuturosAnio} onChange={(e) => setEditCompromisosFuturosAnio(e.target.value)} placeholder="Ej: 2027, 2028" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="edit-compromisos-monto">Compromisos futuros - Monto ($)</Label>
                  <Input id="edit-compromisos-monto" value={editCompromisosFuturosMontoDisplay} onChange={(e) => handleCompromisosFuturosMontoChange(e.target.value)} placeholder="$ 0" className="font-semibold max-w-xs" />
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3 justify-end border-t pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
              {isSaving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>) : (<><Save className="h-4 w-4 mr-2" />Guardar Cambios</>)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function HistorialCDPForm() {
  const { user } = useAuth()
  const [cdps, setCdps] = useState<CDP[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCDP, setSelectedCDP] = useState<CDP | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [cdpToDelete, setCdpToDelete] = useState<CDP | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Estados para el diálogo de edición (el formulario tiene estado local en EditCDPFormDialog para evitar lag)
  const [cdpToEdit, setCdpToEdit] = useState<CDP | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [cuentas, setCuentas] = useState<Cuenta[]>([])

  // Modal Oficializar CDP
  const [cdpToOficializar, setCdpToOficializar] = useState<CDP | null>(null)
  const [isOficializarDialogOpen, setIsOficializarDialogOpen] = useState(false)
  const [isOficializando, setIsOficializando] = useState(false)

  // Paginación del listado
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Permisos según rol: solo ciertos roles pueden editar CDPs
  const isSupervisor = user?.role === "supervisor"
  const canEdit = user?.role === "sa" || user?.role === "admin" || user?.role === "director"

  const totalPages = Math.ceil(cdps.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentCDPs = cdps.slice(startIndex, endIndex)

  /** Carga todas las cuentas presupuestarias para el selector al editar. getCancelled: opcional. */
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
      if (!getCancelled()) toast.error("Error al cargar las cuentas")
    }
  }

  /** Carga CDPs desde Firestore; si falla orderBy por tipo de dato, carga sin orden y ordena en memoria con toDateSafe. getCancelled: opcional. */
  const loadCDPs = async (opts?: { getCancelled?: () => boolean }) => {
    const getCancelled = opts?.getCancelled ?? (() => false)
    setIsLoading(true)
    try {
      const cdpCollection = collection(db, "cdp")
      let querySnapshot
      try {
        const q = query(cdpCollection, orderBy("creadoEn", "desc"))
        querySnapshot = await getDocs(q)
      } catch {
        querySnapshot = await getDocs(cdpCollection)
      }
      if (getCancelled()) return
      const cdpData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CDP[]
      cdpData.sort((a, b) => {
        const tA = toDateSafe(a.creadoEn)?.getTime() ?? toDateSafe(a.fecha)?.getTime() ?? 0
        const tB = toDateSafe(b.creadoEn)?.getTime() ?? toDateSafe(b.fecha)?.getTime() ?? 0
        return tB - tA
      })
      if (!getCancelled()) {
        setCdps(cdpData)
        setCurrentPage(1)
      }
    } catch (error) {
      if (!getCancelled()) toast.error("Error al cargar los CDPs")
    } finally {
      if (!getCancelled()) setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    loadCDPs({ getCancelled: () => cancelled })
    loadCuentas({ getCancelled: () => cancelled })
    return () => { cancelled = true }
  }, [])

  /** Formatea monto en pesos chilenos para mostrar en tabla y modales */
  const formatMonto = (monto: number): string => monto.toLocaleString("es-CL")

  /** Abre el modal de detalle del CDP seleccionado */
  const handleVerDetalles = (cdp: CDP) => {
    setSelectedCDP(cdp)
    setIsDetailsOpen(true)
  }

  /** Genera y descarga el PDF del CDP seleccionado */
  const handleDescargarPDF = async (cdp: CDP) => {
    try {
      const pdfData = {
        cdpNumero: cdp.cdpNumero,
        fecha: toDateSafe(cdp.fecha) ?? new Date(),
        memoNumero: cdp.memoNumero,
        fechaMemo: toDateSafe(cdp.fechaMemo) ?? new Date(),
        nombreSolicitante: cdp.nombreSolicitante,
        cargoSolicitante: cdp.cargoSolicitante,
        destinoDisponibilidad: cdp.destinoDisponibilidad,
        montoDisponibilidad: cdp.montoDisponibilidad,
        numeroItemPresupuestario: cdp.numeroItemPresupuestario,
        nombreItemPresupuestario: cdp.nombreItemPresupuestario,
        areaGestion: cdp.areaGestion,
        programa: cdp.programa,
        subPrograma: cdp.subPrograma,
        tipoCDP: cdp.tipoCDP,
        entidadNombre: cdp.entidadNombre,
        entidadID: cdp.entidadID,
        subtitulo: cdp.subtitulo,
        item: cdp.item,
        asignacion: cdp.asignacion,
        subasignacion: cdp.subasignacion,
        anioPresupuestario: cdp.anioPresupuestario,
        montoTotalPresupuesto: cdp.montoTotalPresupuesto,
        montoComprometidoFecha: cdp.montoComprometidoFecha,
        montoComprometidoActo: cdp.montoComprometidoActo,
        saldoFinal: cdp.saldoFinal,
        nombreProyecto: cdp.nombreProyecto,
        codigoBIP: cdp.codigoBIP,
        montoMaximoAnual: cdp.montoMaximoAnual,
        compromisosFuturosAnio: cdp.compromisosFuturosAnio,
        compromisosFuturosMonto: cdp.compromisosFuturosMonto,
        funcionarioNombre: cdp.funcionarioNombre,
        funcionarioTipo: cdp.funcionarioTipo,
        funcionarioFirmaPath: cdp.funcionarioFirmaPath,
      }
      await descargarPDFCDP(pdfData)
      toast.success("PDF descargado correctamente")
    } catch (error) {
      toast.error("Error al descargar el PDF")
    }
  }

  const handleVisualizarPDF = async (cdp: CDP) => {
    try {
      const pdfData = {
        cdpNumero: cdp.cdpNumero,
        fecha: toDateSafe(cdp.fecha) ?? new Date(),
        memoNumero: cdp.memoNumero,
        fechaMemo: toDateSafe(cdp.fechaMemo) ?? new Date(),
        nombreSolicitante: cdp.nombreSolicitante,
        cargoSolicitante: cdp.cargoSolicitante,
        destinoDisponibilidad: cdp.destinoDisponibilidad,
        montoDisponibilidad: cdp.montoDisponibilidad,
        numeroItemPresupuestario: cdp.numeroItemPresupuestario,
        nombreItemPresupuestario: cdp.nombreItemPresupuestario,
        areaGestion: cdp.areaGestion,
        programa: cdp.programa,
        subPrograma: cdp.subPrograma,
        tipoCDP: cdp.tipoCDP,
        entidadNombre: cdp.entidadNombre,
        entidadID: cdp.entidadID,
        subtitulo: cdp.subtitulo,
        item: cdp.item,
        asignacion: cdp.asignacion,
        subasignacion: cdp.subasignacion,
        anioPresupuestario: cdp.anioPresupuestario,
        montoTotalPresupuesto: cdp.montoTotalPresupuesto,
        montoComprometidoFecha: cdp.montoComprometidoFecha,
        montoComprometidoActo: cdp.montoComprometidoActo,
        saldoFinal: cdp.saldoFinal,
        nombreProyecto: cdp.nombreProyecto,
        codigoBIP: cdp.codigoBIP,
        montoMaximoAnual: cdp.montoMaximoAnual,
        compromisosFuturosAnio: cdp.compromisosFuturosAnio,
        compromisosFuturosMonto: cdp.compromisosFuturosMonto,
        funcionarioNombre: cdp.funcionarioNombre,
        funcionarioTipo: cdp.funcionarioTipo,
        funcionarioFirmaPath: cdp.funcionarioFirmaPath,
      }
      await abrirPDFCDP(pdfData)
    } catch (error) {
      console.error("Error al visualizar el PDF:", error)
      toast.error("Error al visualizar el PDF")
    }
  }

  /** Abre el modal de edición y rellena los campos con los datos del CDP (y carga cuentas si hace falta) */
  const handleEditarClick = async (cdp: CDP) => {
    console.log("✏️ Abriendo modal de edición para CDP:", cdp.cdpNumero)
    
    // Asegurar que las cuentas estén cargadas
    if (cuentas.length === 0) {
      console.log("⚠️ Cuentas no cargadas, cargando ahora...")
      await loadCuentas()
    } else {
      console.log(`📋 ${cuentas.length} cuentas ya disponibles`)
    }
    
    setCdpToEdit(cdp)
    setIsEditDialogOpen(true)
  }

  /** Guarda los cambios del CDP (recibe payload del formulario de edición) */
  const handleGuardarEdicionFromPayload = async (payload: EditCDPFormPayload) => {
    if (!cdpToEdit || !canEdit) {
      toast.error("No tiene permisos para editar CDPs")
      return
    }
    const {
      editTipoCDP,
      editFecha,
      editFechaMemo,
      editMemoNumero,
      editCargoSolicitante,
      editNombreSolicitante,
      editDestinoDisponibilidad,
      editMontoDisponibilidad,
      editCuentaId,
      editAreaGestion,
      editPrograma,
      editSubPrograma,
      editNombreProyecto,
      editCodigoBIP,
      editMontoMaximoAnual,
      editCompromisosFuturosAnio,
      editCompromisosFuturosMonto,
    } = payload

    if (!editFecha || !editFechaMemo) {
      toast.error("Faltan fecha o fecha memo")
      return
    }

    const nuevoMontoParsed = Number.parseInt(editMontoDisponibilidad || "0", 10)
    setIsSaving(true)
    try {
      console.log("📝 Iniciando edición del CDP:", cdpToEdit.cdpNumero)

      const nuevoMonto = nuevoMontoParsed
      const montoAnterior = cdpToEdit.montoDisponibilidad
      const cuentaAnteriorId = cdpToEdit.cuentaId
      const cuentaNuevaId = editCuentaId

      // 1. Ajustar presupuestos si cambió el monto o la cuenta
      if (montoAnterior !== nuevoMonto || cuentaAnteriorId !== cuentaNuevaId) {
        console.log("💰 Ajustando presupuestos...")
        console.log(`   Monto anterior: $${montoAnterior.toLocaleString("es-CL")}`)
        console.log(`   Monto nuevo: $${nuevoMonto.toLocaleString("es-CL")}`)
        console.log(`   Cuenta anterior: ${cuentaAnteriorId}`)
        console.log(`   Cuenta nueva: ${cuentaNuevaId}`)

        // Caso 1: La misma cuenta, solo cambió el monto
        if (cuentaAnteriorId === cuentaNuevaId && cuentaAnteriorId) {
          console.log("   📌 Misma cuenta, ajustando diferencia de monto...")
          
          const cuentaRef = doc(db, "cuentas", cuentaAnteriorId)
          const cuentaSnap = await getDoc(cuentaRef)
          
          if (!cuentaSnap.exists()) {
            toast.error("La cuenta no existe")
            setIsSaving(false)
            return
          }

          const presupuestoActual = cuentaSnap.data().presupuestoDisponible || 0
          const diferencia = nuevoMonto - montoAnterior

          if (diferencia > 0) {
            // Necesitamos más presupuesto
            if (presupuestoActual < diferencia) {
              toast.error(`Presupuesto insuficiente. Necesita $${diferencia.toLocaleString("es-CL")} adicionales, pero solo hay $${presupuestoActual.toLocaleString("es-CL")} disponibles.`)
              setIsSaving(false)
              return
            }
            
            await updateDoc(cuentaRef, {
              presupuestoDisponible: presupuestoActual - diferencia,
              actualizadoEn: serverTimestamp(),
            })
            try {
              const codigoCuenta = cuentaSnap.data().codigo || ""
              await registrarMovimientoCuenta({
                cuentaId: cuentaAnteriorId,
                codigoCuenta,
                tipoAccion: "cdp_editado",
                descripcion: `CDP N° ${cdpToEdit.cdpNumero} editado. Diferencia descontada: $ ${diferencia.toLocaleString("es-CL")}`,
                valorAnterior: { presupuestoDisponible: presupuestoActual },
                valorNuevo: { presupuestoDisponible: presupuestoActual - diferencia },
                cdpId: cdpToEdit.id,
                cdpNumero: cdpToEdit.cdpNumero,
                user: { name: user?.name, lastName: user?.lastName, email: user?.email, uid: user?.uid },
              })
            } catch (err) {
              console.error("Error al registrar en bitácora:", err)
            }
            console.log(`   ✅ Descontados $${diferencia.toLocaleString("es-CL")} adicionales`)
          } else if (diferencia < 0) {
            // Devolver presupuesto
            await updateDoc(cuentaRef, {
              presupuestoDisponible: presupuestoActual + Math.abs(diferencia),
              actualizadoEn: serverTimestamp(),
            })
            try {
              const codigoCuenta = cuentaSnap.data().codigo || ""
              await registrarMovimientoCuenta({
                cuentaId: cuentaAnteriorId,
                codigoCuenta,
                tipoAccion: "cdp_editado",
                descripcion: `CDP N° ${cdpToEdit.cdpNumero} editado. Diferencia devuelta: $ ${Math.abs(diferencia).toLocaleString("es-CL")}`,
                valorAnterior: { presupuestoDisponible: presupuestoActual },
                valorNuevo: { presupuestoDisponible: presupuestoActual + Math.abs(diferencia) },
                cdpId: cdpToEdit.id,
                cdpNumero: cdpToEdit.cdpNumero,
                user: { name: user?.name, lastName: user?.lastName, email: user?.email, uid: user?.uid },
              })
            } catch (err) {
              console.error("Error al registrar en bitácora:", err)
            }
            console.log(`   ✅ Devueltos $${Math.abs(diferencia).toLocaleString("es-CL")}`)
          } else {
            console.log("   ℹ️ No hay cambio en el monto")
          }
        } 
        // Caso 2: Cambió la cuenta
        else {
          console.log("   📌 Cambio de cuenta, transfiriendo montos...")
          
          // Devolver el monto a la cuenta anterior
          if (cuentaAnteriorId) {
            const cuentaAnteriorRef = doc(db, "cuentas", cuentaAnteriorId)
            const cuentaAnteriorSnap = await getDoc(cuentaAnteriorRef)
            
            if (cuentaAnteriorSnap.exists()) {
              const presupuestoActual = cuentaAnteriorSnap.data().presupuestoDisponible || 0
              await updateDoc(cuentaAnteriorRef, {
                presupuestoDisponible: presupuestoActual + montoAnterior,
                actualizadoEn: serverTimestamp(),
              })
              try {
                const codigoCuentaAnterior = cuentaAnteriorSnap.data().codigo || ""
                await registrarMovimientoCuenta({
                  cuentaId: cuentaAnteriorId,
                  codigoCuenta: codigoCuentaAnterior,
                  tipoAccion: "cdp_editado",
                  descripcion: `CDP N° ${cdpToEdit.cdpNumero} editado. Monto devuelto a cuenta anterior: $ ${montoAnterior.toLocaleString("es-CL")}`,
                  valorAnterior: { presupuestoDisponible: presupuestoActual },
                  valorNuevo: { presupuestoDisponible: presupuestoActual + montoAnterior },
                  cdpId: cdpToEdit.id,
                  cdpNumero: cdpToEdit.cdpNumero,
                  user: { name: user?.name, lastName: user?.lastName, email: user?.email, uid: user?.uid },
                })
              } catch (err) {
                console.error("Error al registrar en bitácora:", err)
              }
              console.log(`   ✅ Devueltos $${montoAnterior.toLocaleString("es-CL")} a cuenta anterior`)
            }
          }

          // Descontar de la cuenta nueva
          const cuentaNuevaRef = doc(db, "cuentas", cuentaNuevaId)
          const cuentaNuevaSnap = await getDoc(cuentaNuevaRef)
          
          if (!cuentaNuevaSnap.exists()) {
            toast.error("La cuenta nueva no existe")
            
            // Revertir: volver a descontar de la cuenta anterior
            if (cuentaAnteriorId) {
              const cuentaAnteriorRef = doc(db, "cuentas", cuentaAnteriorId)
              const cuentaAnteriorSnap = await getDoc(cuentaAnteriorRef)
              if (cuentaAnteriorSnap.exists()) {
                const presupuestoActual = cuentaAnteriorSnap.data().presupuestoDisponible || 0
                await updateDoc(cuentaAnteriorRef, {
                  presupuestoDisponible: presupuestoActual - montoAnterior,
                  actualizadoEn: serverTimestamp(),
                })
              }
            }
            
            setIsSaving(false)
            return
          }

          const presupuestoDisponible = cuentaNuevaSnap.data().presupuestoDisponible || 0
          
          if (presupuestoDisponible < nuevoMonto) {
            toast.error(`Presupuesto insuficiente en la cuenta nueva. Disponible: $${presupuestoDisponible.toLocaleString("es-CL")}, Necesario: $${nuevoMonto.toLocaleString("es-CL")}`)
            
            // Revertir: volver a descontar de la cuenta anterior
            if (cuentaAnteriorId) {
              const cuentaAnteriorRef = doc(db, "cuentas", cuentaAnteriorId)
              const cuentaAnteriorSnap = await getDoc(cuentaAnteriorRef)
              if (cuentaAnteriorSnap.exists()) {
                const presupuestoActual = cuentaAnteriorSnap.data().presupuestoDisponible || 0
                await updateDoc(cuentaAnteriorRef, {
                  presupuestoDisponible: presupuestoActual - montoAnterior,
                  actualizadoEn: serverTimestamp(),
                })
              }
            }
            
            setIsSaving(false)
            return
          }

          await updateDoc(cuentaNuevaRef, {
            presupuestoDisponible: presupuestoDisponible - nuevoMonto,
            actualizadoEn: serverTimestamp(),
          })
          try {
            const codigoCuentaNueva = cuentaNuevaSnap.data().codigo || ""
            await registrarMovimientoCuenta({
              cuentaId: cuentaNuevaId,
              codigoCuenta: codigoCuentaNueva,
              tipoAccion: "cdp_editado",
              descripcion: `CDP N° ${cdpToEdit.cdpNumero} editado. Monto descontado de nueva cuenta: $ ${nuevoMonto.toLocaleString("es-CL")}`,
              valorAnterior: { presupuestoDisponible: presupuestoDisponible },
              valorNuevo: { presupuestoDisponible: presupuestoDisponible - nuevoMonto },
              cdpId: cdpToEdit.id,
              cdpNumero: cdpToEdit.cdpNumero,
              user: { name: user?.name, lastName: user?.lastName, email: user?.email, uid: user?.uid },
            })
          } catch (err) {
            console.error("Error al registrar en bitácora:", err)
          }
          console.log(`   ✅ Descontados $${nuevoMonto.toLocaleString("es-CL")} de cuenta nueva`)
        }
      }

      // 2. Obtener datos actuales de la cuenta (tras posibles ajustes de presupuesto) para Tipo A y Tipo 31
      const cuentaRefAfter = doc(db, "cuentas", editCuentaId)
      const cuentaSnapAfter = await getDoc(cuentaRefAfter)
      const cuentaSeleccionada = cuentas.find(c => c.id === editCuentaId)
      let montoTotalPresupuesto: number | undefined
      let montoComprometidoFecha: number | undefined
      let montoComprometidoActo: number | undefined
      let saldoFinal: number | undefined
      if (cuentaSnapAfter.exists()) {
        const data = cuentaSnapAfter.data()
        const presupuestoTotal = data.presupuestoTotal ?? 0
        const presupuestoDisponible = data.presupuestoDisponible ?? 0
        montoTotalPresupuesto = presupuestoTotal
        const totalComprometido = presupuestoTotal - presupuestoDisponible
        montoComprometidoActo = nuevoMonto
        saldoFinal = presupuestoDisponible
        // Tipo A y Tipo 31: "comprometido a la fecha" = lo ya comprometido SIN este acto (evita duplicar al editar)
        montoComprometidoFecha = Math.max(0, totalComprometido - nuevoMonto)
      }

      // 3. Actualizar el CDP
      const cdpRef = doc(db, "cdp", cdpToEdit.id)
      const updateData: Record<string, unknown> = {
        tipoCDP: editTipoCDP,
        fecha: Timestamp.fromDate(editFecha),
        memoNumero: editMemoNumero,
        fechaMemo: Timestamp.fromDate(editFechaMemo),
        cargoSolicitante: editCargoSolicitante,
        nombreSolicitante: editNombreSolicitante,
        destinoDisponibilidad: editDestinoDisponibilidad,
        montoDisponibilidad: nuevoMonto,
        numeroItemPresupuestario: cuentaSeleccionada?.codigo || "",
        nombreItemPresupuestario: cuentaSeleccionada?.denominacion || "",
        areaGestion: editAreaGestion,
        programa: editPrograma,
        subPrograma: editSubPrograma,
        cuentaId: editCuentaId,
        actualizadoEn: serverTimestamp(),
        actualizadoPor: user?.email || "unknown",
      }
      if (editTipoCDP !== "31") {
        if (montoTotalPresupuesto != null) {
          updateData.montoTotalPresupuesto = montoTotalPresupuesto
          updateData.montoComprometidoFecha = montoComprometidoFecha ?? 0
          updateData.montoComprometidoActo = montoComprometidoActo ?? nuevoMonto
          updateData.saldoFinal = saldoFinal ?? 0
        }
        updateData.nombreProyecto = null
        updateData.codigoBIP = null
        updateData.montoMaximoAnual = null
        updateData.compromisosFuturosAnio = null
        updateData.compromisosFuturosMonto = null
      } else {
        updateData.nombreProyecto = editNombreProyecto.trim()
        updateData.codigoBIP = editCodigoBIP.trim()
        updateData.montoMaximoAnual = montoTotalPresupuesto ?? (Number.parseInt(editMontoMaximoAnual || "0", 10) || 0)
        updateData.compromisosFuturosAnio = editCompromisosFuturosAnio.trim() || null
        updateData.compromisosFuturosMonto = Number.parseInt(editCompromisosFuturosMonto || "0", 10) || 0
        updateData.montoComprometidoFecha = montoComprometidoFecha ?? 0
        updateData.montoComprometidoActo = montoComprometidoActo ?? nuevoMonto
        updateData.saldoFinal = saldoFinal ?? 0
      }
      await updateDoc(cdpRef, updateData)

      console.log("✅ CDP actualizado exitosamente")
      toast.success(`CDP ${cdpToEdit.cdpNumero} actualizado correctamente`)

      // 4. Recargar datos
      await loadCDPs()
      await loadCuentas()
      
      setIsEditDialogOpen(false)
      setCdpToEdit(null)
    } catch (error) {
      console.error("❌ Error al editar el CDP:", error)
      toast.error("Error al editar el CDP. Verifique la consola para más detalles.")
    } finally {
      setIsSaving(false)
    }
  }

  /** Abre el diálogo de confirmación de eliminación */
  const handleEliminarClick = (cdp: CDP) => {
    setCdpToDelete(cdp)
    setIsDeleteDialogOpen(true)
  }

  /** Elimina el CDP de Firestore, devuelve el monto a la cuenta y registra en bitácora */
  const handleEliminarConfirm = async () => {
    if (!cdpToDelete || !canEdit) {
      toast.error("No tiene permisos para eliminar CDPs")
      return
    }

    setIsDeleting(true)
    try {
      console.log("🗑️ Iniciando eliminación del CDP:", cdpToDelete.cdpNumero)
      console.log("CDP a eliminar:", cdpToDelete)

      // 1. Devolver el monto a la cuenta presupuestaria si existe cuentaId
      if (cdpToDelete.cuentaId) {
        console.log("💰 Devolviendo monto a la cuenta:", cdpToDelete.cuentaId)
        
        const cuentaRef = doc(db, "cuentas", cdpToDelete.cuentaId)
        const cuentaSnap = await getDoc(cuentaRef)

        if (cuentaSnap.exists()) {
          const cuentaData = cuentaSnap.data()
          const presupuestoActual = cuentaData.presupuestoDisponible || 0
          const nuevoPresupuesto = presupuestoActual + cdpToDelete.montoDisponibilidad

          console.log(`   Presupuesto actual: $${presupuestoActual.toLocaleString("es-CL")}`)
          console.log(`   Monto a devolver: $${cdpToDelete.montoDisponibilidad.toLocaleString("es-CL")}`)
          console.log(`   Nuevo presupuesto: $${nuevoPresupuesto.toLocaleString("es-CL")}`)

          await updateDoc(cuentaRef, {
            presupuestoDisponible: nuevoPresupuesto,
            actualizadoEn: serverTimestamp(),
          })
          try {
            const codigoCuenta = cuentaData.codigo || ""
            await registrarMovimientoCuenta({
              cuentaId: cdpToDelete.cuentaId,
              codigoCuenta,
              tipoAccion: "cdp_eliminado",
              descripcion: `CDP N° ${cdpToDelete.cdpNumero} eliminado. Monto devuelto: $ ${cdpToDelete.montoDisponibilidad.toLocaleString("es-CL")}`,
              valorAnterior: { presupuestoDisponible: presupuestoActual },
              valorNuevo: { presupuestoDisponible: nuevoPresupuesto },
              cdpId: cdpToDelete.id,
              cdpNumero: cdpToDelete.cdpNumero,
              user: { name: user?.name, lastName: user?.lastName, email: user?.email, uid: user?.uid },
            })
          } catch (err) {
            console.error("Error al registrar en bitácora:", err)
          }

          console.log("✅ Monto devuelto exitosamente a la cuenta")
        } else {
          console.warn("⚠️ Cuenta no encontrada:", cdpToDelete.cuentaId)
        }
      } else {
        console.warn("⚠️ El CDP no tiene cuentaId asociado")
      }

      // 2. Eliminar el CDP
      const cdpRef = doc(db, "cdp", cdpToDelete.id)
      await deleteDoc(cdpRef)
      console.log("✅ CDP eliminado exitosamente de la base de datos")

      // 3. Actualizar la lista
      await loadCDPs()

      toast.success(`CDP ${cdpToDelete.cdpNumero} eliminado exitosamente`)
      setIsDeleteDialogOpen(false)
      setCdpToDelete(null)
    } catch (error) {
      console.error("❌ Error al eliminar el CDP:", error)
      toast.error("Error al eliminar el CDP. Verifique la consola para más detalles.")
    } finally {
      setIsDeleting(false)
    }
  }

  /** Abre el modal de confirmación para oficializar el CDP */
  const handleOficializarClick = (cdp: CDP) => {
    setCdpToOficializar(cdp)
    setIsOficializarDialogOpen(true)
  }

  /** Oficializa el CDP en Firestore y oculta la opción de editar */
  const handleOficializarConfirm = async () => {
    if (!cdpToOficializar || !canEdit) {
      toast.error("No tiene permisos para oficializar CDPs")
      return
    }
    if (cdpToOficializar.oficializado) {
      toast.error("Este CDP ya está oficializado")
      setIsOficializarDialogOpen(false)
      setCdpToOficializar(null)
      return
    }
    if (!puedeOficializarCDP(cdpToOficializar)) {
      toast.error("Solo se puede oficializar CDPs con fecha a partir del 02/03/2026")
      setIsOficializarDialogOpen(false)
      setCdpToOficializar(null)
      return
    }
    setIsOficializando(true)
    try {
      const cdpRef = doc(db, "cdp", cdpToOficializar.id)
      await updateDoc(cdpRef, {
        oficializado: true,
        oficializadoEn: serverTimestamp(),
        oficializadoPor: user?.email || "unknown",
      })
      await loadCDPs()
      setIsOficializarDialogOpen(false)
      setCdpToOficializar(null)
      toast.success(
        <span className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
          El certificado de disponibilidad presupuestaria ha sido oficializado con éxito.
        </span>,
        { duration: 5000 }
      )
    } catch (error) {
      console.error("Error al oficializar CDP:", error)
      toast.error("Error al oficializar el CDP. Verifique la consola para más detalles.")
    } finally {
      setIsOficializando(false)
    }
  }

  return (
    <div className="p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Package className="h-7 w-7 text-[#1a2da6]" />
              Historial de CDPs
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Listado de todos los Certificados de Disponibilidad Presupuestaria
            </p>
            {isSupervisor && (
              <div className="mt-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md inline-block">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  ℹ️ Acceso de solo lectura. Puede visualizar y descargar CDPs, pero no crear nuevos.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Tabla de CDPs */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1a2da6]" />
          </div>
        ) : cdps.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No hay CDPs registrados</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b-2 border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      CDP / Fecha
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Solicitante
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Destino
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Monto
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Cuenta
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Tipo
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
                  {currentCDPs.map((cdp, index) => (
                    <tr 
                      key={cdp.id} 
                      className={cn(
                        "group hover:bg-blue-50/50 dark:hover:bg-gray-800/50 transition-all duration-150",
                        index % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/30 dark:bg-gray-900/50"
                      )}
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-bold font-mono text-[#1a2da6] dark:text-blue-400">
                            {cdp.cdpNumero}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span>{toDateSafe(cdp.fecha) ? format(toDateSafe(cdp.fecha)!, "dd/MM/yyyy", { locale: es }) : "-"}</span>
                            <span className="text-gray-300 dark:text-gray-600">•</span>
                            <span className="font-medium text-[#1a2da6] dark:text-blue-400">
                              Memo {cdp.memoNumero}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {cdp.nombreSolicitante}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]" title={cdp.cargoSolicitante}>
                            {cdp.cargoSolicitante}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 dark:text-white max-w-[250px] truncate" title={cdp.destinoDisponibilidad}>
                          {cdp.destinoDisponibilidad}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                          <span className="text-sm font-bold text-green-700 dark:text-green-400">
                            $ {formatMonto(cdp.montoDisponibilidad)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300">
                            {cdp.numeroItemPresupuestario}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[180px]" title={cdp.nombreItemPresupuestario}>
                            {cdp.nombreItemPresupuestario}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {(() => {
                          const subtitulo = getSubtituloFromCodigoCuenta(cdp.numeroItemPresupuestario)
                          const tipoLabel = subtitulo
                            ? `Subtítulo ${subtitulo}`
                            : cdp.tipoCDP === "31"
                              ? "Subtítulo 31"
                              : "Subt. 21-30, 32-33"
                          const es31 = subtitulo === "31" || cdp.tipoCDP === "31"
                          return (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs font-medium",
                                es31
                                  ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                                  : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800"
                              )}
                            >
                              {tipoLabel}
                            </Badge>
                          )
                        })()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col gap-1 items-center">
                          <Badge
                            className={cn(
                              "px-3 py-1 text-xs font-semibold rounded-full",
                              cdp.estado === "activo"
                                ? "bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700"
                                : "bg-gray-100 text-gray-700 border border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600"
                            )}
                          >
                            {cdp.estado === "activo" ? "● Activo" : "○ Inactivo"}
                          </Badge>
                          {cdp.oficializado && (
                            <Badge className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700">
                              Oficializado
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleVerDetalles(cdp)}
                            className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-800"
                            title="Ver detalles"
                          >
                            <Eye className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => await handleVisualizarPDF(cdp)}
                            className="h-8 w-8 p-0 hover:bg-[#1a2da6]/10 dark:hover:bg-[#1a2da6]/20"
                            title="Ver PDF"
                          >
                            <FileText className="h-4 w-4 text-[#1a2da6] dark:text-blue-400" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => await handleDescargarPDF(cdp)}
                            className="h-8 w-8 p-0 hover:bg-[#adca1f]/10 dark:hover:bg-[#adca1f]/20"
                            title="Descargar PDF"
                          >
                            <Download className="h-4 w-4 text-[#adca1f]" />
                          </Button>
                          {canEdit && !cdp.oficializado && (
                            <>
                              <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-0.5" />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => await handleEditarClick(cdp)}
                                className="h-8 w-8 p-0 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                title="Editar CDP"
                              >
                                <Edit className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              </Button>
                              {puedeOficializarCDP(cdp) && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleOficializarClick(cdp)}
                                className="h-8 px-2.5 bg-[#1a2da6] hover:bg-[#1a2da6]/90 text-white font-semibold shadow-md"
                                title="Oficializar CDP"
                              >
                                <Stamp className="h-4 w-4 mr-1" />
                                Oficializar
                              </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEliminarClick(cdp)}
                                className="h-8 w-8 p-0 hover:bg-red-50 dark:hover:bg-red-900/20"
                                title="Eliminar CDP"
                              >
                                <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                              </Button>
                            </>
                          )}
                          {canEdit && cdp.oficializado && (
                            <>
                              <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-0.5" />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEliminarClick(cdp)}
                                className="h-8 w-8 p-0 hover:bg-red-50 dark:hover:bg-red-900/20"
                                title="Eliminar CDP"
                              >
                                <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Paginación */}
            {cdps.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  {/* Información de registros */}
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    Mostrando <span className="font-semibold">{startIndex + 1}</span> a{" "}
                    <span className="font-semibold">{Math.min(endIndex, cdps.length)}</span> de{" "}
                    <span className="font-semibold">{cdps.length}</span> CDPs
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
                          // Mostrar primera página, última página, página actual y páginas adyacentes
                          return (
                            page === 1 ||
                            page === totalPages ||
                            (page >= currentPage - 1 && page <= currentPage + 1)
                          )
                        })
                        .map((page, index, array) => {
                          // Agregar puntos suspensivos si hay saltos
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
          </div>
        )}

        {/* Modal de Detalles */}
        {selectedCDP && (
          <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <FileText className="h-6 w-6 text-[#1a2da6]" />
                  Detalles del CDP N° {selectedCDP.cdpNumero}
                </DialogTitle>
                <DialogDescription>
                  Información completa del Certificado de Disponibilidad Presupuestaria
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Información General */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b pb-2">
                    Información General
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Fecha</label>
                      <p className="text-base text-gray-900 dark:text-white">
                        {toDateSafe(selectedCDP.fecha) ? format(toDateSafe(selectedCDP.fecha)!, "dd 'de' MMMM 'de' yyyy", { locale: es }) : "-"}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">CDP N°</label>
                      <p className="text-base font-mono font-medium text-[#1a2da6]">{selectedCDP.cdpNumero}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Memo N°</label>
                      <p className="text-base text-gray-900 dark:text-white">{selectedCDP.memoNumero}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Fecha Memo</label>
                      <p className="text-base text-gray-900 dark:text-white">
                        {toDateSafe(selectedCDP.fechaMemo) ? format(toDateSafe(selectedCDP.fechaMemo)!, "dd 'de' MMMM 'de' yyyy", { locale: es }) : "-"}
                      </p>
                    </div>
                    {(getSubtituloFromCodigoCuenta(selectedCDP.numeroItemPresupuestario) || selectedCDP.tipoCDP || selectedCDP.entidadNombre || selectedCDP.entidadID) && (
                      <>
                        <div>
                          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Tipo (subtítulo)</label>
                          <p className="text-base text-gray-900 dark:text-white">
                            {(() => {
                              const subtitulo = getSubtituloFromCodigoCuenta(selectedCDP.numeroItemPresupuestario)
                              if (subtitulo) {
                                return subtitulo === "31"
                                  ? "Subtítulo 31 (Iniciativa de Inversión)"
                                  : `Subtítulo ${subtitulo}`
                              }
                              return selectedCDP.tipoCDP === "31"
                                ? "Subtítulo 31 (Iniciativa de Inversión)"
                                : "Subtítulo 21 al 30, 32 y 33"
                            })()}
                          </p>
                        </div>
                        {selectedCDP.entidadNombre && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Entidad</label>
                            <p className="text-base text-gray-900 dark:text-white">{selectedCDP.entidadNombre}</p>
                          </div>
                        )}
                        {selectedCDP.entidadID && (
                          <div>
                            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">ID Entidad</label>
                            <p className="text-base font-mono text-gray-900 dark:text-white">{selectedCDP.entidadID}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Información del Solicitante */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b pb-2">
                    Información del Solicitante
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Nombre</label>
                      <p className="text-base text-gray-900 dark:text-white">{selectedCDP.nombreSolicitante}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Cargo</label>
                      <p className="text-base text-gray-900 dark:text-white">{selectedCDP.cargoSolicitante}</p>
                    </div>
                  </div>
                </div>

                {/* Información Presupuestaria */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b pb-2">
                    Información Presupuestaria
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Destino Disponibilidad</label>
                      <p className="text-base text-gray-900 dark:text-white">{selectedCDP.destinoDisponibilidad}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Monto Disponibilidad</label>
                      <p className="text-2xl font-bold text-green-600">
                        $ {formatMonto(selectedCDP.montoDisponibilidad)}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                      <span className="col-span-full text-xs font-semibold text-gray-600 dark:text-gray-400">Fuente de financiamiento (desagregación de la cuenta)</span>
                      {(() => {
                        const desag = parseDesagregacionFromCodigoCuenta(selectedCDP.numeroItemPresupuestario)
                        const sub = (selectedCDP.subtitulo ?? "").trim() || desag.subtitulo
                        const itm = (selectedCDP.item ?? "").trim() || desag.item
                        const asig = (selectedCDP.asignacion ?? "").trim() || desag.asignacion
                        const subasig = (selectedCDP.subasignacion ?? "").trim() || desag.subasignacion
                        return (
                          <>
                            <div>
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Subtítulo</label>
                              <p className="text-sm font-mono text-gray-900 dark:text-white">{sub || "—"}</p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Ítem</label>
                              <p className="text-sm font-mono text-gray-900 dark:text-white">{itm || "—"}</p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Asignación</label>
                              <p className="text-sm text-gray-900 dark:text-white">{asig || "—"}</p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Subasignación</label>
                              <p className="text-sm text-gray-900 dark:text-white">{subasig || "—"}</p>
                            </div>
                          </>
                        )
                      })()}
                      {selectedCDP.anioPresupuestario != null && selectedCDP.anioPresupuestario > 0 && (
                        <div>
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Año presupuestario</label>
                          <p className="text-sm text-gray-900 dark:text-white">{selectedCDP.anioPresupuestario}</p>
                        </div>
                      )}
                    </div>
                    {(selectedCDP.montoTotalPresupuesto != null || selectedCDP.montoComprometidoFecha != null || selectedCDP.montoComprometidoActo != null || selectedCDP.saldoFinal != null) && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800/50">
                        {selectedCDP.montoTotalPresupuesto != null && (
                          <div>
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Total presupuesto</label>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">$ {formatMonto(selectedCDP.montoTotalPresupuesto)}</p>
                          </div>
                        )}
                        {selectedCDP.montoComprometidoFecha != null && (
                          <div>
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Comprometido a la fecha</label>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">$ {formatMonto(selectedCDP.montoComprometidoFecha)}</p>
                          </div>
                        )}
                        {selectedCDP.montoComprometidoActo != null && (
                          <div>
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Comprometido por el acto</label>
                            <p className="text-sm font-semibold text-green-600">$ {formatMonto(selectedCDP.montoComprometidoActo)}</p>
                          </div>
                        )}
                        {selectedCDP.saldoFinal != null && (
                          <div>
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Saldo final</label>
                            <p className="text-sm font-bold text-green-700 dark:text-green-400">$ {formatMonto(selectedCDP.saldoFinal)}</p>
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">N° Item Presupuestario</label>
                      <p className="text-base font-mono text-gray-900 dark:text-white">{selectedCDP.numeroItemPresupuestario}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Nombre Item Presupuestario</label>
                      <p className="text-base text-gray-900 dark:text-white">{selectedCDP.nombreItemPresupuestario}</p>
                    </div>
                  </div>
                </div>

                {/* Iniciativa de Inversión (solo tipo 31) */}
                {selectedCDP.tipoCDP === "31" && (selectedCDP.nombreProyecto ?? selectedCDP.codigoBIP ?? selectedCDP.montoMaximoAnual ?? selectedCDP.compromisosFuturosMonto) && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b pb-2">
                      Iniciativa de Inversión (Subtítulo 31)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedCDP.nombreProyecto && (
                        <div className="md:col-span-2">
                          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Nombre del proyecto</label>
                          <p className="text-base text-gray-900 dark:text-white">{selectedCDP.nombreProyecto}</p>
                        </div>
                      )}
                      {selectedCDP.codigoBIP && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Código BIP / INI</label>
                          <p className="text-base font-mono text-gray-900 dark:text-white">{selectedCDP.codigoBIP}</p>
                        </div>
                      )}
                      {selectedCDP.montoMaximoAnual != null && selectedCDP.montoMaximoAnual > 0 && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Monto máximo anual</label>
                          <p className="text-base font-semibold text-gray-900 dark:text-white">$ {formatMonto(selectedCDP.montoMaximoAnual)}</p>
                        </div>
                      )}
                      {(selectedCDP.compromisosFuturosAnio ?? selectedCDP.compromisosFuturosMonto != null) && (
                        <div className="md:col-span-2">
                          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Compromisos futuros</label>
                          <p className="text-base text-gray-900 dark:text-white">
                            {selectedCDP.compromisosFuturosAnio || ""}
                            {selectedCDP.compromisosFuturosMonto != null && selectedCDP.compromisosFuturosMonto > 0
                              ? ` — $ ${formatMonto(selectedCDP.compromisosFuturosMonto)}`
                              : ""}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Funcionario emisor */}
                {(selectedCDP.funcionarioNombre ?? selectedCDP.funcionarioTipo) && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b pb-2">
                      Funcionario emisor del CDP
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedCDP.funcionarioNombre && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Nombre</label>
                          <p className="text-base text-gray-900 dark:text-white">{selectedCDP.funcionarioNombre}</p>
                        </div>
                      )}
                      {selectedCDP.funcionarioTipo && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Cargo</label>
                          <p className="text-base text-gray-900 dark:text-white">
                            {selectedCDP.funcionarioTipo === "subrogante" ? "Director(a) (s) subrogante" : "Director de Administración y Finanzas"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Área de Gestión y Programas */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b pb-2">
                    Área de Gestión y Programas
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Área de Gestión</label>
                      <p className="text-base text-gray-900 dark:text-white">{selectedCDP.areaGestion}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Programa</label>
                      <p className="text-base text-gray-900 dark:text-white">{selectedCDP.programa}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Sub-Programa</label>
                      <p className="text-base text-gray-900 dark:text-white">{selectedCDP.subPrograma}</p>
                    </div>
                  </div>
                </div>

                {/* Estado y Metadata */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b pb-2">
                    Información Adicional
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Estado</label>
                      <div className="mt-1">
                        <Badge
                          className={
                            selectedCDP.estado === "activo"
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                          }
                        >
                          {selectedCDP.estado}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Creado por</label>
                      <p className="text-base text-gray-900 dark:text-white">{selectedCDP.creadoPor}</p>
                    </div>
                  </div>
                </div>

                {/* Botones de acción */}
                <div className="flex gap-3 justify-end border-t pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsDetailsOpen(false)}
                  >
                    Cerrar
                  </Button>
                  <Button
                    onClick={async () => await handleVisualizarPDF(selectedCDP)}
                    className="bg-[#1a2da6] hover:bg-[#1a2da6]/90"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Ver PDF
                  </Button>
                  <Button
                    onClick={async () => await handleDescargarPDF(selectedCDP)}
                    className="bg-[#adca1f] hover:bg-[#adca1f]/90"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Descargar PDF
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Modal de Edición (estado local en EditCDPFormDialog para evitar lag) */}
        <EditCDPFormDialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open)
            if (!open) setCdpToEdit(null)
          }}
          cdp={cdpToEdit}
          cuentas={cuentas}
          onSave={handleGuardarEdicionFromPayload}
          isSaving={isSaving}
          formatMontoFn={formatMonto}
        />


        {/* Diálogo de Confirmación de Eliminación */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Está seguro de eliminar este CDP?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. Se eliminará el CDP <span className="font-semibold">{cdpToDelete?.cdpNumero}</span> y se devolverá el monto de <span className="font-semibold text-green-600">${cdpToDelete ? formatMonto(cdpToDelete.montoDisponibilidad) : 0}</span> a la cuenta presupuestaria correspondiente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleEliminarConfirm}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar CDP
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Diálogo de Confirmación de Oficializar CDP */}
        <AlertDialog open={isOficializarDialogOpen} onOpenChange={(open) => { setIsOficializarDialogOpen(open); if (!open) setCdpToOficializar(null) }}>
          <AlertDialogContent className="max-w-2xl p-8 gap-6">
            <AlertDialogHeader className="space-y-4">
              <AlertDialogTitle className="text-2xl font-bold">
                Oficializar CDP
              </AlertDialogTitle>
              <AlertDialogDescription className="text-base leading-relaxed">
                Al presionar Sí, el CDP <span className="font-semibold">{cdpToOficializar?.cdpNumero}</span> quedará oficializado con los detalles antes confirmados. A partir de ese momento no podrá editarse. ¿Está seguro que desea oficializarlo?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex gap-4 sm:gap-4 pt-4">
              <AlertDialogCancel disabled={isOficializando} className="text-base px-6 py-2.5 h-auto">No</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleOficializarConfirm}
                disabled={isOficializando}
                className="bg-[#1a2da6] hover:bg-[#1a2da6]/90 text-base px-6 py-2.5 h-auto font-semibold"
              >
                {isOficializando ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Oficializando...
                  </>
                ) : (
                  "Sí"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

