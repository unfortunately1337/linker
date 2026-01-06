import { useState, useCallback } from "react";
import CodeInput from "../../components/CodeInputMobile";
import { useRouter } from "next/router";
import dynamic from 'next/dynamic';
const Lottie = dynamic(() => import('lottie-react'), { ssr: false });
import ToastNotification from "../../components/ToastNotification";
import loginAnimation from "../../public/aui/login.json";
import { signIn } from "next-auth/react";

/**
 * Helper to convert base64url string to Uint8Array
 */
function base64urlToBuffer(str: string | undefined | null): Uint8Array {
  if (!str) {
    throw new Error('Input string is empty or null');
  }

  try {
    const padLength = 4 - (str.length % 4);
    const padded = padLength < 4 ? str + '='.repeat(padLength) : str;
    const base64 = padded.replace(/\-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    console.error('[base64urlToBuffer] Error converting:', err);
    throw err;
  }
}

/**
 * Convert base64url challenge and other binary fields to Uint8Array
 */
function convertOptionsForWebAuthn(options: any): any {
  if (!options) throw new Error('Options is null/undefined');
  
  // Create new object with all properties
  const result: any = {};
  
  for (const key in options) {
    if (!Object.prototype.hasOwnProperty.call(options, key)) continue;
    
    const value = options[key];
    
    if (key === 'challenge') {
      // Challenge must be converted from base64url string to Uint8Array
      if (value === null || value === undefined) {
        throw new Error(`Challenge is ${value}`);
      }
      
      if (typeof value === 'string') {
        result[key] = base64urlToBuffer(value);
      } else if (value instanceof Uint8Array) {
        // Already converted, use as-is
        result[key] = value;
      } else if (typeof value === 'object' && '__type' in value) {
        // Might be a serialized object like {__type: 'Uint8Array', data: [...]}
        if (value.__type === 'Uint8Array' && Array.isArray(value.data)) {
          result[key] = new Uint8Array(value.data);
        } else {
          throw new Error(`Challenge has unexpected structure: ${JSON.stringify(value)}`);
        }
      } else {
        throw new Error(`Challenge must be string or Uint8Array, got ${typeof value}`);
      }
    } else if (key === 'user' && value && typeof value === 'object') {
      // Copy user object and convert user.id if needed
      result[key] = { ...value };
      if (typeof value.id === 'string') {
        result[key].id = base64urlToBuffer(value.id);
      }
    } else if (key === 'excludeCredentials' && Array.isArray(value)) {
      // Convert credential IDs in excludeCredentials
      result[key] = value.map((cred: any) => {
        if (typeof cred.id === 'string') {
          return { ...cred, id: base64urlToBuffer(cred.id) };
        }
        return cred;
      });
    } else if (key === 'allowCredentials' && Array.isArray(value)) {
      // Convert credential IDs in allowCredentials
      result[key] = value.map((cred: any) => {
        if (typeof cred.id === 'string') {
          return { ...cred, id: base64urlToBuffer(cred.id) };
        }
        return cred;
      });
    } else {
      // Copy other properties as-is
      result[key] = value;
    }
  }
  
  return result;
}

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  const [toast, setToast] = useState<{ type: "error" | "success"; message: string } | null>(null);

  const [show2FA, setShow2FA] = useState(false);         // показывать поле для кода 2FA
  const [pending2FA, setPending2FA] = useState(false);   // автофокус при первой проверке
  const [twoFactorCode, setTwoFactorCode] = useState("");

  const router = useRouter();

  // ✅ Стабильная проверка 2FA (не вызывает повторных ререндеров)
  const safeCheck2FA = useCallback(async (userLogin: string) => {
    try {
      const resp = await fetch(`/api/profile?login=${encodeURIComponent(userLogin)}`);
      const data = await resp.json();

      const enabled = Boolean(data?.user?.twoFactorEnabled);

      // Меняем стейт ТОЛЬКО если действительно нужно
      setShow2FA(prev => (prev !== enabled ? enabled : prev));

      return enabled;
    } catch {
      return false;
    }
  }, []);

  // ✅ Обработчик отправки формы
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast(null);

    if (!login || !password) {
      setToast({ type: "error", message: "Заполните все поля" });
      return;
    }

    try {
      // --- Первый этап: логин + пароль ---
      if (!show2FA) {
        const res: any = await signIn("credentials", {
          redirect: false,
          login,
          password
        });

        if (res?.error) {
          const err = String(res.error).toLowerCase();

          // Backend говорит, что нужна 2FA
          if (err.includes("2fa") || err.includes("twofactor") || err.includes("two-factor") || err.includes("two factor")) {
            setPending2FA(true);
            setShow2FA(true);
            setToast({ type: "error", message: "Введите 2FA код" });
            return;
          }

          // Проверяем профиль — включена ли 2FA
          const enabled = await safeCheck2FA(login);
          if (enabled) {
            setPending2FA(true);
            setToast({ type: "error", message: "Введите 2FA код" });
            return;
          }

          setToast({ type: "error", message: "Ошибка входа, проверьте данные" });
          return;
        }

        // ✅ успешный вход без 2FA
        try { window.dispatchEvent(new Event("user-login")); } catch {}
        setTimeout(() => router.push("/profile"), 600);
        return;
      }

      // --- Второй этап: логин + пароль + 2FA ---
      const res2: any = await signIn("credentials", {
        redirect: false,
        login,
        password,
        twoFactorCode: twoFactorCode.trim(),
      });

      if (res2?.error) {
        setToast({
          type: "error",
          message: res2.error === "CredentialsSignin"
            ? "Ошибка входа, проверьте данные"
            : res2.error
        });
        return;
      }

      // ✅ успешный вход с 2FA
      try { window.dispatchEvent(new Event("user-login")); } catch {}
      setTimeout(() => router.push("/profile"), 600);

    } catch (err) {
      console.error(err);
      setToast({ type: "error", message: "Сервер выключен." });
    }
  };

  // ✅ Проверка логина на 2FA (без лишних ререндеров)
  const handleLoginBlur = async () => {
    if (!login.trim()) return;
    await safeCheck2FA(login);
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#111",
      paddingTop: "7vh"
    }}>
      <div style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        transform: 'translateY(-6vh)'
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <div style={{ width: 220, height: 220 }}>
            <Lottie animationData={loginAnimation} loop={true} />
          </div>
        </div>

        <form onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: show2FA ? 8 : 16,
            width: 360,
            maxWidth: "90vw",
            margin: "0 auto"
          }}
        >
          <input
            type="text"
            placeholder="Логин"
            value={login}
            onChange={e => setLogin(e.target.value)}
            onBlur={handleLoginBlur}
            required
            className="auth-input"
          />

          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="auth-input"
          />

          {show2FA && (
            <>
              <div style={{
                textAlign: 'center',
                color: '#ddd',
                fontSize: 13,
                marginTop: 6,
                marginBottom: 6
              }}>
                Введите код из приложения
              </div>

              <CodeInput
                value={twoFactorCode}
                onChange={setTwoFactorCode}
                length={6}
                autoFocus={pending2FA}
                onComplete={() => {}}
                size="small"
              />
            </>
          )}

          <button type="submit" className="auth-btn">Войти</button>

          {toast && (
            <ToastNotification
              type={toast.type}
              message={toast.message}
              onClose={() => setToast(null)}
              duration={4000}
            />
          )}
        </form>

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 15 }}>
          Нет аккаунта?{" "}
          <a href="/auth/register" style={{ color: "#4fc3f7" }}>
            Зарегистрироваться
          </a>
        </div>
      </div>
    </div>
  );
}
