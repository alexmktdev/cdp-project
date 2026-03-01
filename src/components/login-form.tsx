"use client";

/**
 * Formulario de inicio de sesión.
 *
 * SEGURIDAD:
 * - Validación de entrada: Zod — email formato válido, password mínimo 6 caracteres (alineado con Firebase).
 *   Evita enviar datos mal formados al backend y da feedback claro al usuario.
 * - Redirección post-login: el parámetro ?from= se usa solo si es ruta interna (startsWith("/"), no "//",
 *   no /https?:) para evitar open redirect: un atacante no puede redirigir a dominio externo tras el login.
 * - Límite de intentos fallidos: tras MAX_INTENTOS_LOGIN (3) fallos por credenciales inválidas se bloquea
 *   el botón y se muestra enlace a "Olvidaste contraseña". Reduce fuerza bruta y coincide con buena práctica
 *   cuando Firebase puede bloquear por too-many-requests.
 * - Mensajes de error: se muestran errores específicos (usuario inactivo, demasiados intentos, credenciales)
 *   sin revelar si el email existe o no (el backend devuelve mensaje genérico para invalid-credential).
 */
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { login } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Loader2 } from "lucide-react";

/** Esquema de validación: email válido y contraseña mínimo 6 caracteres (requisito de Firebase Auth). */
const loginSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/** SEGURIDAD: Tras este número de intentos fallidos (credenciales inválidas) se bloquea el envío y se pide restablecer contraseña. */
const MAX_INTENTOS_LOGIN = 3;

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginErrorCode, setLoginErrorCode] = useState<string | undefined>(undefined);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [blockedByAttempts, setBlockedByAttempts] = useState(false);
  const [redirectTo, setRedirectTo] = useState("/dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();

  /** SEGURIDAD: Solo aceptar ?from= como ruta interna (empieza por /, no por // ni /https?:) para evitar open redirect. */
  useEffect(() => {
    if (searchParams) {
      const from = searchParams.get("from");
      if (from && from.startsWith("/") && !from.startsWith("//") && !/^\/https?:/i.test(from)) {
        setRedirectTo(from);
      }
    }
  }, [searchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  /** Envío: respetar bloqueo por intentos; llamar login(); en éxito redirigir a redirectTo (ya validado como ruta interna). */
  const onSubmit = async (data: LoginFormValues) => {
    if (blockedByAttempts) {
      toast.error("Ha superado el máximo de intentos. Use la opción «¿Olvidaste tu contraseña?» para restablecer.");
      return;
    }
    setIsLoading(true);
    setLoginError("");
    setLoginErrorCode(undefined);

    try {
      const result = await login(data);

      if (!result.success) {
        const isInvalidCredential = result.code === "invalid-credential";
        if (isInvalidCredential) {
          const nextAttempts = failedAttempts + 1;
          setFailedAttempts(nextAttempts);
          // SEGURIDAD: Tras MAX_INTENTOS_LOGIN fallos, bloquear y obligar a usar "Olvidaste contraseña".
          if (nextAttempts >= MAX_INTENTOS_LOGIN) {
            setBlockedByAttempts(true);
            setLoginError(
              `Ha superado el máximo de intentos (${MAX_INTENTOS_LOGIN}). Restablezca su contraseña usando la opción «¿Olvidaste tu contraseña?». Verifique también el correo cuando lo ingrese.`
            );
            setLoginErrorCode("too-many-requests");
            toast.error("Máximo de intentos alcanzado. Restablezca su contraseña.");
          } else {
            setLoginError(result.error || "Correo o contraseña incorrecta, revise, e intente nuevamente!");
            setLoginErrorCode(result.code);
            toast.error("Error al iniciar sesión", { description: result.error });
          }
        } else {
          setLoginError(result.error || "Error al iniciar sesión.");
          setLoginErrorCode(result.code);
          toast.error("Error al iniciar sesión", { description: result.error });
        }
        return;
      }

      setFailedAttempts(0);
      setBlockedByAttempts(false);
      toast.success("Inicio de sesión exitoso");

      setTimeout(() => {
        router.push(redirectTo);
        router.refresh();
      }, 500);
    } catch (error) {
      console.error("Error al iniciar sesión:", error);
      const msg = error instanceof Error ? error.message : "Correo o contraseña incorrecta, revise, e intente nuevamente.";
      setLoginError(msg);
      setLoginErrorCode(undefined);
      toast.error("Error al iniciar sesión", { description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium text-gray-700">
          Correo electrónico
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="tu@ejemplo.com"
          {...register("email", {
            onChange: () => {
              if (!blockedByAttempts) {
                setLoginError("");
                setLoginErrorCode(undefined);
              }
            },
          })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-[#1a2da6] focus:ring-[#1a2da6]"
        />
        {errors.email && (
          <p className="text-sm text-red-500">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium text-gray-700">
          Contraseña
        </Label>
        <Input
          id="password"
          type="password"
          {...register("password", {
            onChange: () => {
            if (!blockedByAttempts) {
              setLoginError("");
              setLoginErrorCode(undefined);
            }
          },
          })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-[#1a2da6] focus:ring-[#1a2da6]"
        />
        {errors.password && (
          <p className="text-sm text-red-500">{errors.password.message}</p>
        )}
      </div>

      {loginError && (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200"
          role="alert"
        >
          <p>{loginError}</p>
          {(loginErrorCode === "too-many-requests" || blockedByAttempts) && (
            <Link
              href="/forgot-password"
              className="mt-2 inline-block font-medium text-[#1a2da6] underline hover:no-underline"
            >
              ¿Olvidaste tu contraseña? Restablecer aquí
            </Link>
          )}
        </div>
      )}

      <Button
        type="submit"
        className="w-full rounded-md bg-[#1a2da6] py-2 text-white hover:bg-[#151f7a] focus:outline-none focus:ring-2 focus:ring-[#1a2da6] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isLoading || blockedByAttempts}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Verificando...
          </>
        ) : (
          "Iniciar sesión"
        )}
      </Button>
    </form>
  );
}

