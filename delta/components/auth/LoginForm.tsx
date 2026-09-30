"use client";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { loginSchema, type LoginFormValues } from "@/lib/validations/authSchema";
import { useLogin } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { LoginShowcase } from "@/components/auth/LoginShowcase";

// ── Types ──────────────────────────────────────────────────────────────────────
interface FieldProps {
  id: string;
  label: string;
  error?: string;
  /** Something sitting at the right end of the line, e.g. the show-password toggle. */
  trailing?: ReactNode;
  children: ReactNode;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const panelVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.35 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};
const errorVariants: Variants = {
  hidden: { opacity: 0, y: -4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15 } },
};

/** An input drawn as a single line, which fills with the brand colour from the left on focus. */
const INPUT_CLASS =
  "peer h-12 w-full rounded-none border-0 bg-transparent px-0 text-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none";

// ── Component ──────────────────────────────────────────────────────────────────
/**
 * The login page: the purple showcase on one side, the form on the other.
 *
 * Only the layout is new. Validation (`loginSchema`), the call (`useLogin` —
 * it stores the session, greets you and goes to the dashboard) and the
 * show-password toggle are what they were.
 */
export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const { mutate: login, isPending } = useLogin();
  const reduceMotion = useReducedMotion();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (data: LoginFormValues) => {
    login(data);
  };

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.15fr_1fr]">
      <LoginShowcase />

      <main className="relative flex flex-col px-6 py-8 sm:px-12 lg:px-16 lg:py-12">
        <header className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
            Sign in <span className="text-primary">·</span> 01
          </span>
          <ThemeToggle />
        </header>

        <div className="flex flex-1 items-center py-12">
          <motion.div
            variants={panelVariants}
            initial={reduceMotion ? "visible" : "hidden"}
            animate="visible"
            className="mx-auto w-full max-w-sm lg:mx-0"
          >
            <motion.h2 variants={itemVariants} className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
              Welcome back<span className="text-primary">.</span>
            </motion.h2>
            <motion.p variants={itemVariants} className="mt-3 text-muted-foreground">
              Sign in to your Remote CRM workspace.
            </motion.p>

            {/* method="post": if it is ever submitted before the page has loaded its
                script, the browser posts it instead of putting the password in the URL. */}
            <form method="post" onSubmit={handleSubmit(onSubmit)} className="mt-10 space-y-8" noValidate>
              <motion.div variants={itemVariants}>
                <Field id="email" label="Email address" error={errors.email?.message}>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                    {...register("email")}
                    className={INPUT_CLASS}
                  />
                </Field>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Field
                  id="password"
                  label="Password"
                  error={errors.password?.message}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                >
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    aria-invalid={Boolean(errors.password)}
                    {...register("password")}
                    className={INPUT_CLASS}
                  />
                </Field>
              </motion.div>

              <motion.div variants={itemVariants} whileTap={{ scale: 0.97 }}>
                <button
                  type="submit"
                  disabled={isPending}
                  className="group relative flex h-14 w-full items-center justify-between overflow-hidden rounded-full bg-primary pl-7 pr-2 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-[box-shadow,opacity] hover:shadow-xl hover:shadow-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-70"
                >
                  <span>{isPending ? "Signing in…" : "Sign in"}</span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-foreground text-primary transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-rotate-45">
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  </span>
                </button>
              </motion.div>
            </form>

            <motion.p variants={itemVariants} className="mt-8 text-xs text-muted-foreground">
              Trouble signing in? Ask your team lead to reset your password.
            </motion.p>
          </motion.div>
        </div>

        <footer className="flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Remote CRM</span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Secure sign-in
          </span>
        </footer>
      </main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
/** A label above, the line below, and the error under that. */
function Field({ id, label, error, trailing, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </label>
      <div className="group relative mt-1 flex items-center gap-2 border-b border-border">
        {children}
        {trailing}
        {/* The line fills from the left while the field has focus — scaleX, never width. */}
        <span
          aria-hidden
          className={
            "pointer-events-none absolute -bottom-px left-0 h-0.5 w-full origin-left transition-transform duration-500 ease-out group-focus-within:scale-x-100 " +
            (error ? "scale-x-100 bg-destructive" : "scale-x-0 bg-primary")
          }
        />
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            key="error"
            variants={errorVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="alert"
            className="mt-2 text-xs text-destructive"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
