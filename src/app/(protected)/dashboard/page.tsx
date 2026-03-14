"use client"

/**
 * Dashboard principal: resumen de compras (OC), suministros, CDPs y accesos rápidos.
 * Carga datos de Firestore (oc, suministros, cdp) y muestra estadísticas y listados recientes.
 */
import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Receipt,
  ArrowRight
} from "lucide-react"
import { db } from "@/lib/firebase"
import { collection, query, getDocs, orderBy } from "firebase/firestore"
import { useAuth } from "@/context/auth-context"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { getSubtituloFromCodigoCuenta, toDateSafe, parseMonto } from "@/lib/utils"

/** Orden de compra desde Firestore */
interface Compra {
  id: string
  numeroOC: string
  nombreProveedor: string
  monto: number
  tipo: string
  tipoOC: string
  estado: string
  creadoPor: string
  creadoEn: any
}

/** Suministro/licitación desde Firestore */
interface Suministro {
  id: string
  idLicitacion: string
  nombre: string
  presupuesto: number
  presupuestoRestante: number
  proveedor: string
  estado: string
  creadoPor: string
  facturas?: any[]
}

/** CDP resumido para el dashboard */
interface CDP {
  id: string
  cdpNumero: string
  montoDisponibilidad: number
  tipoCDP?: "22-24-33" | "31"
  numeroItemPresupuestario?: string
  creadoEn: any
  fecha?: any
  /** Si true, el CDP está oficializado y ya no se puede editar */
  oficializado?: boolean
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [compras, setCompras] = useState<Compra[]>([])
  const [suministros, setSuministros] = useState<Suministro[]>([])
  const [cdps, setCdps] = useState<CDP[]>([])
  const [isLoading, setIsLoading] = useState(true)

  /** Carga en paralelo OC, suministros y CDPs desde Firestore */
  const fetchData = async () => {
    try {
      setIsLoading(true)

      const [comprasSnapshot, suministrosSnapshot, cdpsSnapshot] = await Promise.all([
        getDocs(query(collection(db, "oc"), orderBy("creadoEn", "desc"))),
        getDocs(query(collection(db, "suministros"), orderBy("creadoEn", "desc"))),
        getDocs(query(collection(db, "cdp"), orderBy("creadoEn", "desc"))),
      ])

      const comprasData = comprasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Compra))
      const suministrosData = suministrosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Suministro))
      const cdpsData = cdpsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CDP))

      // Ordenar en memoria por fecha (por si Firestore devuelve desordenado o creadoEn tiene formatos distintos)
      comprasData.sort((a, b) => (toDateSafe(b.creadoEn)?.getTime() ?? 0) - (toDateSafe(a.creadoEn)?.getTime() ?? 0))
      suministrosData.sort((a, b) => (toDateSafe((b as { creadoEn?: unknown }).creadoEn)?.getTime() ?? 0) - (toDateSafe((a as { creadoEn?: unknown }).creadoEn)?.getTime() ?? 0))
      cdpsData.sort((a, b) => (toDateSafe(b.creadoEn)?.getTime() ?? toDateSafe(b.fecha)?.getTime() ?? 0) - (toDateSafe(a.creadoEn)?.getTime() ?? toDateSafe(a.fecha)?.getTime() ?? 0))

      return { comprasData, suministrosData, cdpsData }
    } catch (error) {
      console.error("Error al cargar datos:", error)
      return { comprasData: [], suministrosData: [], cdpsData: [] }
    }
  }

  /* Solo cargar datos cuando el usuario del contexto esté listo; evita "Missing or insufficient permissions" por peticiones sin token. */
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setIsLoading(true)
    fetchData().then((result) => {
      if (cancelled || !result) return
      setCompras(result.comprasData)
      setSuministros(result.suministrosData)
      setCdps(result.cdpsData)
    }).finally(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [user])

  const totalCompras = compras.length
  const montoTotalCompras = compras.reduce((sum, c) => sum + (c.monto || 0), 0)
  const comprasPendientes = compras.filter(c => c.estado === "pendiente").length
  const comprasCompletadas = compras.filter(c => c.estado === "completado").length

  const totalSuministros = suministros.length
  const presupuestoTotalSuministros = suministros.reduce((sum, s) => sum + (s.presupuesto || 0), 0)
  const presupuestoRestanteTotal = suministros.reduce((sum, s) => sum + (s.presupuestoRestante || s.presupuesto || 0), 0)
  const suministrosEnProceso = suministros.filter(s => s.estado === "en_proceso").length
  const suministrosCompletados = suministros.filter(s => s.estado === "completado").length
  const presupuestoUtilizado = presupuestoTotalSuministros - presupuestoRestanteTotal

  const totalCDPs = cdps.length
  const montoCertificadoCDPs = cdps.reduce((sum, c) => sum + parseMonto(c.montoDisponibilidad), 0)
  /** Cantidad de CDPs creados en el mes actual (para la tarjeta de estadísticas) */
  const cdpsEsteMes = cdps.filter(c => {
    const created = toDateSafe(c.creadoEn) ?? toDateSafe(c.fecha) ?? new Date(0)
    const now = new Date()
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear()
  }).length

  const formatMonto = (monto: number) =>
    monto.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  /** Devuelve el nombre legible del tipo de OC (AS → Ayuda Social, etc.) */
  const getTipoOCNombre = (sigla: string) => {
    const tipos: { [key: string]: string } = {
      "AS": "Ayuda Social",
      "CA": "Compra Ágil",
      "TD": "Trato Directo",
      "CM": "Convenio Marco",
      "ES": "Excluida del Sistema",
      "LI": "Licitación"
    }
    return tipos[sigla] || sigla
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1a2da6]"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Título y descripción del panel */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3 text-gray-900 dark:text-white">
          <LayoutDashboard className="h-8 w-8 text-[#1a2da6]" />
          Panel de Control
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Vista general de compras, suministros y CDPs
        </p>
      </div>

      {/* Cards de Estadísticas Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Compras */}
        <Card className="border-t-4 border-t-blue-500 hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Compras</CardTitle>
            <ShoppingCart className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalCompras}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {comprasCompletadas} completadas, {comprasPendientes} pendientes
            </p>
          </CardContent>
        </Card>

        {/* Monto Total Compras */}
        <Card className="border-t-4 border-t-green-500 hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monto Compras</CardTitle>
            <DollarSign className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$ {formatMonto(montoTotalCompras)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Valor total de órdenes de compra
            </p>
          </CardContent>
        </Card>

        {/* Total Suministros */}
        <Card className="border-t-4 border-t-purple-500 hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Suministros</CardTitle>
            <Package className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalSuministros}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {suministrosEnProceso} en proceso, {suministrosCompletados} completados
            </p>
          </CardContent>
        </Card>

        {/* Presupuesto Suministros */}
        <Card className="border-t-4 border-t-orange-500 hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Presupuesto Total</CardTitle>
            <TrendingUp className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$ {formatMonto(presupuestoTotalSuministros)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Restante: $ {formatMonto(presupuestoRestanteTotal)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cards CDPs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-t-4 border-t-[#1a2da6] hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total CDPs</CardTitle>
            <Receipt className="h-5 w-5 text-[#1a2da6]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalCDPs}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {cdpsEsteMes > 0 ? `${cdpsEsteMes} emitidos este mes` : "Certificados de disponibilidad presupuestaria"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-[#adca1f] hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monto certificado (CDP)</CardTitle>
            <DollarSign className="h-5 w-5 text-[#adca1f]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$ {formatMonto(montoCertificadoCDPs)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Suma de montos de todos los CDPs
            </p>
            {totalCDPs > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Promedio por CDP: $ {formatMonto(Math.round(montoCertificadoCDPs / totalCDPs))}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-gray-400 hover:shadow-lg transition-shadow flex flex-col justify-center">
          <CardContent className="pt-6">
            <Link href="/cdp/historial">
              <Button variant="outline" className="w-full border-[#1a2da6] text-[#1a2da6] hover:bg-[#1a2da6]/10">
                <FileText className="h-4 w-4 mr-2" />
                Ver historial de CDPs
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos de Estado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Resumen Compras */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-[#1a2da6]" />
              Resumen de Compras
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">Pendientes</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-48 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-yellow-500 h-2 rounded-full"
                    style={{ width: `${totalCompras ? (comprasPendientes / totalCompras) * 100 : 0}%` }}
                  />
                </div>
                <Badge variant="outline" className="min-w-12 justify-center">
                  {comprasPendientes}
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Completadas</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-48 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${totalCompras ? (comprasCompletadas / totalCompras) * 100 : 0}%` }}
                  />
                </div>
                <Badge variant="outline" className="min-w-12 justify-center">
                  {comprasCompletadas}
                </Badge>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">Monto Total:</span>
                <span className="text-lg font-bold text-green-600">$ {formatMonto(montoTotalCompras)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumen Suministros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-[#1a2da6]" />
              Resumen de Suministros
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">En Proceso</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-48 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${totalSuministros ? (suministrosEnProceso / totalSuministros) * 100 : 0}%` }}
                  />
                </div>
                <Badge variant="outline" className="min-w-12 justify-center">
                  {suministrosEnProceso}
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Completados</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-48 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${totalSuministros ? (suministrosCompletados / totalSuministros) * 100 : 0}%` }}
                  />
                </div>
                <Badge variant="outline" className="min-w-12 justify-center">
                  {suministrosCompletados}
                </Badge>
              </div>
            </div>

            <div className="pt-4 border-t space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Presupuesto Total:</span>
                <span className="text-base font-bold">$ {formatMonto(presupuestoTotalSuministros)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Utilizado:</span>
                <span className="text-base font-bold text-red-600">$ {formatMonto(presupuestoUtilizado)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Restante:</span>
                <span className="text-base font-bold text-green-600">$ {formatMonto(presupuestoRestanteTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Últimos 5 de cada tipo: compras, suministros y CDPs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#1a2da6]" />
              Últimas 5 Compras
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {compras.slice(0, 5).map((compra) => (
                <div 
                  key={compra.id} 
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:shadow transition-shadow"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sm">{compra.numeroOC}</span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${
                          compra.estado === "completado" 
                            ? "bg-green-100 text-green-800" 
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {compra.estado}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate mt-1">
                      {compra.nombreProveedor}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {toDateSafe(compra.creadoEn) ? format(toDateSafe(compra.creadoEn)!, "dd/MM/yyyy", { locale: es }) : ""}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-sm font-bold">$ {formatMonto(compra.monto)}</div>
                    <div className="text-xs text-gray-500">{getTipoOCNombre(compra.tipoOC)}</div>
                  </div>
                </div>
              ))}
              {compras.length === 0 && (
                <p className="text-center text-gray-500 py-4">No hay compras registradas</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Últimos Suministros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-[#1a2da6]" />
              Últimos 5 Suministros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {suministros.slice(0, 5).map((suministro) => {
                const presupuestoRestante = suministro.presupuestoRestante ?? suministro.presupuesto
                const porcentajeUsado = ((suministro.presupuesto - presupuestoRestante) / suministro.presupuesto) * 100
                
                return (
                  <div 
                    key={suministro.id} 
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:shadow transition-shadow"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm">{suministro.idLicitacion}</span>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            suministro.estado === "completado" 
                              ? "bg-green-100 text-green-800" 
                              : suministro.estado === "en_proceso"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {suministro.estado === "en_proceso" ? "En Proceso" : suministro.estado}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate mt-1">
                        {suministro.nombre}
                      </p>
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-500">Presupuesto</span>
                          <span className="font-semibold">{porcentajeUsado.toFixed(0)}% usado</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div
                            className={`h-full rounded-full ${
                              porcentajeUsado >= 100
                                ? "bg-red-600"
                                : porcentajeUsado >= 75
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            }`}
                            style={{ width: `${Math.min(porcentajeUsado, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-xs text-gray-500 mb-1">Restante</div>
                      <div className={`text-sm font-bold ${presupuestoRestante <= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        $ {formatMonto(presupuestoRestante)}
                      </div>
                    </div>
                  </div>
                )
              })}
              {suministros.length === 0 && (
                <p className="text-center text-gray-500 py-4">No hay suministros registrados</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Últimos 5 CDPs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-[#1a2da6]" />
              Últimos 5 CDPs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cdps.slice(0, 5).map((cdp) => (
                <Link key={cdp.id} href="/cdp/historial">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:shadow transition-shadow cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm text-[#1a2da6]">{cdp.cdpNumero}</span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${(getSubtituloFromCodigoCuenta(cdp.numeroItemPresupuestario) === "31" || cdp.tipoCDP === "31") ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"}`}
                        >
                          Subtítulo: {getSubtituloFromCodigoCuenta(cdp.numeroItemPresupuestario) ?? (cdp.tipoCDP === "31" ? "31" : "21-30, 32-33")}
                        </Badge>
                        {cdp.oficializado && (
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200">
                            Oficializado
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {toDateSafe(cdp.creadoEn) ? format(toDateSafe(cdp.creadoEn)!, "dd/MM/yyyy", { locale: es }) : ""}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-sm font-bold text-green-600">$ {formatMonto(parseMonto(cdp.montoDisponibilidad))}</div>
                    </div>
                  </div>
                </Link>
              ))}
              {cdps.length === 0 && (
                <p className="text-center text-gray-500 py-4">No hay CDPs registrados</p>
              )}
              {cdps.length > 0 && cdps.length <= 5 && (
                <p className="text-xs text-muted-foreground pt-2 border-t">
                  Suma de estos {cdps.length}: $ {formatMonto(cdps.reduce((s, c) => s + parseMonto(c.montoDisponibilidad), 0))}
                </p>
              )}
              {cdps.length > 5 && (
                <p className="text-xs text-muted-foreground pt-2 border-t">
                  Suma de estos 5: $ {formatMonto(cdps.slice(0, 5).reduce((s, c) => s + parseMonto(c.montoDisponibilidad), 0))}
                </p>
              )}
            </div>
            <Link href="/cdp/historial" className="block mt-3">
              <Button variant="ghost" size="sm" className="w-full text-[#1a2da6]">
                Ver todo el historial
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Alertas: presupuesto crítico (≥75%), agotado, compras pendientes, o "Todo en orden" */}
      <Card className="border-l-4 border-l-orange-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Alertas y Notificaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Suministros con presupuesto entre 75% y 100% utilizado */}
            {suministros.filter(s => {
              const restante = s.presupuestoRestante ?? s.presupuesto
              const porcentaje = ((s.presupuesto - restante) / s.presupuesto) * 100
              return porcentaje >= 75 && porcentaje < 100
            }).length > 0 && (
              <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Presupuesto en Alerta</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {suministros.filter(s => {
                      const restante = s.presupuestoRestante ?? s.presupuesto
                      const porcentaje = ((s.presupuesto - restante) / s.presupuesto) * 100
                      return porcentaje >= 75 && porcentaje < 100
                    }).length} suministros tienen más del 75% del presupuesto utilizado
                  </p>
                </div>
              </div>
            )}

            {/* Suministros con presupuesto agotado */}
            {suministros.filter(s => (s.presupuestoRestante ?? s.presupuesto) <= 0).length > 0 && (
              <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <TrendingDown className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Presupuesto Agotado</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {suministros.filter(s => (s.presupuestoRestante ?? s.presupuesto) <= 0).length} suministros han agotado su presupuesto
                  </p>
                </div>
              </div>
            )}

            {/* Compras pendientes */}
            {comprasPendientes > 0 && (
              <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Compras Pendientes</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Tienes {comprasPendientes} órdenes de compra pendientes de procesar
                  </p>
                </div>
              </div>
            )}

            {comprasPendientes === 0 && suministros.filter(s => {
              const restante = s.presupuestoRestante ?? s.presupuesto
              const porcentaje = ((s.presupuesto - restante) / s.presupuesto) * 100
              return porcentaje >= 75
            }).length === 0 && (
              <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Todo en Orden</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    No hay alertas pendientes en este momento
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}