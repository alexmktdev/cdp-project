"use client"

/**
 * Página de inicio de sesión.
 * Muestra el logo, el formulario de login (LoginForm cargado dinámicamente sin SSR para evitar hidratación con Firebase)
 * y un enlace a "¿Olvidaste tu contraseña?" que lleva a /forgot-password.
 */
import dynamic from 'next/dynamic'
import { Shield } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

const LoginForm = dynamic(() => import('@/components/login-form').then(mod => ({ default: mod.LoginForm })), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-4">
      <div className="h-12 bg-gray-200 rounded"></div>
      <div className="h-12 bg-gray-200 rounded"></div>
      <div className="h-12 bg-[#1a2da6]/20 rounded"></div>
    </div>
  )
})

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center ">
      <div className="w-full max-w-md px-4">
        <div className="mb-8 flex items-center justify-center gap-3">
            <div className="relative">
                <Image src="/logo.png" alt="Logo" width={200} height={200} className="w-full h-full object-contain" />
            </div>
        </div>

        <div className="rounded-lg border border-gray-200 border-t-4 border-t-[#1a2da6] bg-white p-6 shadow-lg">
          <div className="mb-6 space-y-2 text-center">
            <div className="flex items-center justify-center">
              <Shield className="h-12 w-12 text-[#1a2da6]" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Acceso al Sistema</h2>
            <p className="text-sm text-gray-500">Sistema de Registro de Adquisiciones</p>
          </div>

          <LoginForm />

          <div className="mt-4 text-center text-sm">
            <Link href="/forgot-password" className="text-[#1a2da6] hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <div className="mt-6 text-center text-xs text-gray-500">
            <p>Sistema exclusivo para personal autorizado</p>
            <p className="mt-1">© {new Date().getFullYear()} Dirección de Administración y Finanzas | Municipalidad de Molina.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
