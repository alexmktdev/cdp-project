"use client"

/**
 * Página "¿Olvidaste tu contraseña?".
 *
 * SEGURIDAD:
 * - Usa resetPassword(email) de Firebase Auth; el enlace lo envía Google, no se expone token en nuestra app.
 * - Mensaje post-envío: "Si existe una cuenta con ... recibirás un enlace" no revela si el email existe o no,
 *   reduciendo enumeración de usuarios. En cambio, en catch se muestran mensajes distintos para
 *   auth/user-not-found y auth/invalid-email (el primero revela que no hay cuenta). Es un trade-off UX/seguridad:
 *   para no revelar existencia de cuentas se podría mostrar siempre el mismo mensaje genérico en cualquier error.
 * - Validación mínima: email trim y no vacío antes de llamar a Firebase.
 */
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Shield, Mail, Loader2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { resetPassword } from "@/lib/firebase"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const emailTrim = email.trim()
    if (!emailTrim) {
      toast.error("Ingresa tu correo electrónico")
      return
    }
    setIsLoading(true)
    try {
      await resetPassword(emailTrim)
      setEnviado(true)
      toast.success("Correo enviado")
    } catch (error: unknown) {
      const code = error && typeof error === "object" && "code" in error ? (error as { code: string }).code : ""
      if (code === "auth/user-not-found") {
        toast.error("No hay ninguna cuenta con ese correo")
      } else if (code === "auth/invalid-email") {
        toast.error("El correo no es válido")
      } else {
        toast.error("No se pudo enviar el enlace. Intenta más tarde.")
      }
      console.error("Error al enviar correo de recuperación:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (enviado) {
    return (
      <div className="w-full max-w-md px-4">
        <div className="mb-8 flex justify-center">
          <Image src="/logo.png" alt="Logo" width={200} height={200} className="object-contain" />
        </div>
        <div className="rounded-lg border border-gray-200 border-t-4 border-t-[#1a2da6] bg-white p-6 shadow-lg">
          <div className="mb-6 space-y-2 text-center">
            <div className="flex justify-center">
              <Shield className="h-12 w-12 text-[#1a2da6]" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Revisa tu correo</h2>
            <p className="text-sm text-gray-600">
              Si existe una cuenta con <strong>{email.trim()}</strong>, recibirás un enlace para restablecer tu contraseña.
            </p>
          </div>
          <Button asChild className="w-full" variant="outline">
            <Link href="/login" className="flex items-center justify-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio de sesión
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md px-4">
      <div className="mb-8 flex justify-center">
        <Image src="/logo.png" alt="Logo" width={200} height={200} className="object-contain" />
      </div>
      <div className="rounded-lg border border-gray-200 border-t-4 border-t-[#1a2da6] bg-white p-6 shadow-lg">
        <div className="mb-6 space-y-2 text-center">
          <div className="flex justify-center">
            <Shield className="h-12 w-12 text-[#1a2da6]" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">¿Olvidaste tu contraseña?</h2>
          <p className="text-sm text-gray-500">
            Ingresa tu correo y te enviaremos un enlace para restablecerla
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="h-11"
              autoComplete="email"
            />
          </div>
          <Button
            type="submit"
            className="w-full h-11 bg-[#1a2da6] hover:bg-[#1a2da6]/90"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Enviar enlace de recuperación
              </>
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm text-[#1a2da6] hover:underline flex items-center justify-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  )
}
