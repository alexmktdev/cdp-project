"use client"

/**
 * Contexto y hook para el estado del sidebar (menú lateral).
 * Permite controlar si está abierto o cerrado y ofrece toggle, open y close.
 * El sidebar puede usarse en modo controlado (open + onOpenChange) o no controlado (defaultOpen).
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

/** Tipo del valor del contexto: estado isOpen y funciones para cambiarlo */
interface SidebarContextType {
  isOpen: boolean
  toggle: () => void
  close: () => void
  open: () => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

/** Hook para usar el estado del sidebar; debe estar dentro de SidebarProvider */
export function useSidebar() {
  const context = useContext(SidebarContext)
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}

/** Props del SidebarProvider: children y opciones de estado inicial o control externo */
interface SidebarProviderProps {
  children: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Proveedor que expone el estado del sidebar a toda la aplicación.
 * Si se pasan open y onOpenChange, el estado es controlado desde fuera.
 * Si solo se pasa defaultOpen, el estado es interno (no controlado).
 */
export function SidebarProvider({
  children,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
}: SidebarProviderProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)

  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen

  const toggle = useCallback(() => {
    if (isControlled) {
      onOpenChange?.(!isOpen)
    } else {
      setUncontrolledOpen(!isOpen)
    }
  }, [isControlled, isOpen, onOpenChange])

  const open = useCallback(() => {
    if (isControlled) {
      onOpenChange?.(true)
    } else {
      setUncontrolledOpen(true)
    }
  }, [isControlled, onOpenChange])

  const close = useCallback(() => {
    if (isControlled) {
      onOpenChange?.(false)
    } else {
      setUncontrolledOpen(false)
    }
  }, [isControlled, onOpenChange])

  return <SidebarContext.Provider value={{ isOpen, toggle, open, close }}>{children}</SidebarContext.Provider>
}
