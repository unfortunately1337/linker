import { getUser } from "../lib/session";
import { forbiddenPasswords } from "../lib/forbidden-passwords";
import { getFriendDisplayName } from "../lib/hooks";
import { FaUserCircle, FaCog, FaShieldAlt, FaPalette, FaLaptop, FaMobileAlt, FaDesktop, FaSignOutAlt, FaQrcode } from "react-icons/fa";
import styles from "../components/SettingsProfile.module.css";
import React, { useState, useEffect, useRef } from "react";
import { motion } from 'framer-motion';
import UserStatus, { UserStatusType, statusLabels } from "../components/UserStatus";
import { useSession, signOut } from "next-auth/react";
// 2FA 6-digit input component
type CodeInputProps = {
  value: string;
  onChange: (val: string) => void;
  length?: number;
  disabled?: boolean;
};
function CodeInput({ value, onChange, length = 6, disabled = false }: CodeInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 1);
  let newValueArr = value.split("");
  newValueArr[idx] = val;
  onChange(newValueArr.join(""));
    // Move focus to next input
    if (val && idx < (length - 1)) {
      const nextInput = inputsRef.current[idx + 1];
      if (nextInput) nextInput.focus();
    }
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === "Backspace" && !value[idx] && idx > 0) {
      const prevInput = inputsRef.current[idx - 1];
      if (prevInput) prevInput.focus();
    }
  };
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "12px 0" }}>
      {Array.from({ length }).map((_, idx) => (
        <input
          key={idx}
          ref={el => { inputsRef.current[idx] = el; }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={value[idx] || ""}
          onChange={e => handleChange(e, idx)}
          onKeyDown={e => handleKeyDown(e, idx)}
          disabled={disabled}
          style={{
            width: 38,
            height: 48,
            fontSize: 28,
            textAlign: "center",
            borderRadius: 10,
            border: "2px solid #444",
            background: "#18191c",
            color: "#fff",
            fontWeight: 700,
            boxShadow: "0 2px 8px #0002",
            outline: "none",
            transition: "border 0.2s, box-shadow 0.2s"
          }}
          onFocus={e => e.target.select()}
        />
      ))}
    </div>
  );
}
import ToastNotification from "../components/ToastNotification";
import LottiePlayer from "../lib/LottiePlayer";
// Форма смены логина
type UserType = { id: string; login: string; link?: string | null; verified?: boolean; status?: 'online' | 'offline' | 'dnd'; phoneNumber?: string } | null;
type ChangeLoginFormProps = {
  user: UserType;
  setUser: (u: any) => void;
  setFriends: (f: any[]) => void;
};
function ChangeLoginForm({ user, setUser, setFriends }: ChangeLoginFormProps) {
  const [newLogin, setNewLogin] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState<string>("");

  const handleChangeLogin = async () => {
    if (!newLogin || !user) return;
    setLoading(true);
    setStatus("");
    setShowToast(false);
    setToastMsg("");
    setStatus("");
    setShowToast(false);
    setToastMsg("");
    const res = await fetch('/api/profile/change-login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newLogin })
    });
    const data = await res.json();
    if (res.ok) {
      setToastMsg('Логин успешно изменён!');
      setShowToast(true);
      setUser(data.user);
      // refresh friends
      fetch(`/api/profile?userId=${data.user.id}`).then(r => r.json()).then(profile => setFriends(profile.user.friends || [])).catch(()=>{});
      try { localStorage.setItem('user', JSON.stringify({ id: data.user.id, login: data.user.login, link: data.user.link || null })); } catch {}
    } else {
      if (data.error === 'Login is already taken') {
        setToastMsg('Логин уже занят.');
        setShowToast(true);
      } else {
        setStatus(data.error || 'Ошибка при смене логина');
      }
    }
    setLoading(false);
  };

  return (
    <div style={{ marginBottom: 22, marginLeft: 0, maxWidth: 320, position: 'relative' }}>
      <label style={{ fontSize: 15, fontWeight: 500 }}>Смена логина</label><br />
  <input type="text" value={newLogin} onChange={e => setNewLogin(e.target.value)} style={{ marginTop: 6, width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #444", background: "#18191c", color: "#fff", fontSize: 15 }} />
      <button
        style={{ marginTop: 10, background: "#18191c", color: "#fff", border: "1px solid #444", borderRadius: 8, padding: "8px 18px", fontSize: 15, cursor: "pointer", fontWeight: 500 }}
        onClick={handleChangeLogin}
        disabled={loading}
      >{loading ? "Проверка..." : "Сменить"}</button>
      {status && <span style={{ marginLeft: 12, color: status.includes("успешно") ? "#1ed760" : "#e74c3c", fontWeight: 500 }}>{status}</span>}
      {showToast && (
        <ToastNotification
          type={toastMsg === "Логин успешно изменён!" ? "success" : "error"}
          message={toastMsg}
          duration={3000}
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
}

// Функция для определения типа устройства и возврата иконки и названия
function getDeviceIconAndName(deviceName: string) {
  const ua = (deviceName || "").toLowerCase();
  // Return only an icon component based on detected device type (no text)
  if (ua.includes("android") || ua.includes("iphone") || ua.includes("mobile")) {
    return React.createElement(FaMobileAlt, { style: { fontSize: 18 } });
  }
  if ((ua.includes("windows") && ua.includes("touch")) || ua.includes("notebook") || ua.includes("laptop")) {
    return React.createElement(FaLaptop, { style: { fontSize: 18 } });
  }
  if (ua.includes("macintosh") || ua.includes("macbook")) {
    return React.createElement(FaLaptop, { style: { fontSize: 18 } });
  }
  if (ua.includes("windows") || ua.includes("linux")) {
    return React.createElement(FaDesktop, { style: { fontSize: 18 } });
  }
  // Fallback: generic desktop icon
  return React.createElement(FaDesktop, { style: { fontSize: 18 } });
}

function generate2FAToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&?_+-:';";
  let token = "";
  for (let i = 0; i < 128; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [user, setUser] = useState<UserType>(null);
  const [userRole, setUserRole] = useState<string>("user");
  const [desc, setDesc] = useState<string>("");
  const [avatar, setAvatar] = useState<string>("");
  const [backgroundUrl, setBackgroundUrl] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [has2FA, setHas2FA] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [bgOpacity, setBgOpacity] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('profileBgOpacity');
      if (saved !== null) return Number(saved);
    }
    return 100;
  });
  const [showNewsModal, setShowNewsModal] = useState(false);
  const [removeFriendId, setRemoveFriendId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<'customization'|'security'|'privacy' | null>(null);
  // role icon src mapping for modal display
  const roleIconSrc = userRole === 'admin' ? '/role-icons/admin.svg' : userRole === 'moderator' ? '/role-icons/moderator.svg' : userRole === 'verif' ? '/role-icons/verif.svg' : userRole === 'pepe' ? '/role-icons/pepe.svg' : null;
  // menu indicator animation settings
  const menuButtonHeight = 44; // px
  const menuButtonGap = 8; // px
  const menuIndex = settingsTab === 'customization' ? 0 : settingsTab === 'security' ? 1 : settingsTab === 'privacy' ? 2 : -1;
  // offset indicator by container padding (6px) so it aligns exactly behind buttons
  const menuIndicatorTop = menuIndex >= 0 ? (6 + menuIndex * (menuButtonHeight + menuButtonGap)) : -9999;
  const [token, setToken] = useState<string>("");
  const [setupQr, setSetupQr] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState<boolean>(false);
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [setupLoading, setSetupLoading] = useState<boolean>(false);
  const [verifyLoading, setVerifyLoading] = useState<boolean>(false);
  const [disableLoading, setDisableLoading] = useState<boolean>(false);
  
  const [newPassword, setNewPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [passwordChanged, setPasswordChanged] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string>("");
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState<string>("");
  const [toastType, setToastType] = useState<'success'|'error'>('success');
  const [friends, setFriends] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [newLogin, setNewLogin] = useState<string>("");
  const [newLink, setNewLink] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [phoneLoading, setPhoneLoading] = useState<boolean>(false);
  const [phoneSaved, setPhoneSaved] = useState<boolean>(false);
  const currentSessionId = session && session.user ? (session.user as any).sessionId : null;
  const [prefersReduced, setPrefersReduced] = useState<boolean>(true);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      try {
        setPrefersReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      } catch (e) {
        setPrefersReduced(true);
      }
    } else {
      setPrefersReduced(true);
    }
  }, []);

  // Проверяем размер окна для мобильной версии
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 600);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Загружаем профиль пользователя после успешного входа
  useEffect(() => {
    if (status === "loading") return;
    if (!session || !session.user || !session.user.id) {
      setUser(null);
      return;
    }
    // Загружаем профиль с сервера
    fetch(`/api/profile?userId=${session.user.id}`)
      .then(r => r.json())
      .then(data => {
        console.log('Profile loaded:', data.user);
        setUser(data.user);
        setHas2FA(!!data.user.twoFactorEnabled);
        setUserRole(data.user.role || "user");
        setDesc(data.user.description || "");
        setAvatar(data.user.avatar || "");
  setBackgroundUrl(data.user.backgroundUrl || "");
  setPhoneNumber(data.user.phoneNumber || "0");
  console.log('Avatar:', data.user.avatar, 'BG URL:', data.user.backgroundUrl);
  // Не трогаем bgOpacity из API, используем localStorage
        setFriends(data.user.friends || []);
        setSessions((data.user.sessions || []).filter((s: any) => s.isActive));
        try {
          localStorage.setItem("user", JSON.stringify({ id: data.user.id, login: data.user.login, link: data.user.link || null }));
          // После успешной загрузки профиля вызываем событие для Sidebar only — use profile-updated so we don't trigger login-only UI
          window.dispatchEvent(new Event("profile-updated"));
        } catch {}
      })
      .catch(() => {
        setUser(null);
        setHas2FA(false);
        setUserRole("user");
        setDesc("");
        setAvatar("");
        setBackgroundUrl("");
        setPhoneNumber("0");
        setFriends([]);
        setSessions([]);
      });
  }, [session, status]);

  // Прослушиваем изменения кастомных имён друзей для обновления UI
  useEffect(() => {
    const updateFriendsList = () => {
      // Принуждаем переренdered при изменении имён
      setFriends(prev => [...prev]);
    };
    
    window.addEventListener('friend-name-changed', updateFriendsList as EventListener);
    return () => window.removeEventListener('friend-name-changed', updateFriendsList as EventListener);
  }, []);

  // If user has 3 or more friends, enable compact scroll for the friends list
  const isFriendsScrollable = Array.isArray(friends) && friends.length >= 3;

  // Включить 2FA
  // Включить 2FA через Google Authenticator
  async function handleEnable2FA() {
    if (!user) return;
    try {
      setSetupLoading(true);
  const resp = await fetch('/api/2fa/setup', { credentials: 'same-origin' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        return alert(err.error || 'Не удалось сгенерировать 2FA');
      }
      const data = await resp.json();
      setSetupQr(data.qr || null);
      setSetupSecret(data.secret || null);
      setShowSetup(true);
    } finally {
      setSetupLoading(false);
    }
  }

  // Форма смены линка (username)
  function ChangeLinkForm({ user, setUser, setFriends }: ChangeLoginFormProps) {
    const [newLink, setNewLink] = useState("");
    const [loading, setLoading] = useState(false);
    const [toastMsg, setToastMsg] = useState<string>("");
    const [showToast, setShowToast] = useState(false);

    const handleChangeLink = async () => {
      if (!newLink || !user) return;
      // client-side validation
      const re = /^[A-Za-z0-9_]{3,32}$/;
      if (!re.test(newLink)) {
        setToastMsg('Неверный формат линка'); setShowToast(true); return;
      }
      setLoading(true);
  const res = await fetch('/api/profile/change-link', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newLink }) });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        fetch(`/api/profile?userId=${data.user.id}`).then(r=>r.json()).then(profile=>setFriends(profile.user.friends || [])).catch(()=>{});
        try { localStorage.setItem('user', JSON.stringify({ id: data.user.id, login: data.user.login, link: data.user.link || null })); } catch {}
        setToastMsg('Линк успешно изменён!'); setShowToast(true);
        setNewLink('');
      } else {
        if (data.error === 'Link is already taken') setToastMsg('Линк уже занят');
        else if (data.error === 'Invalid link format') setToastMsg('Неверный формат линка');
        else setToastMsg(data.error || 'Ошибка при смене линка');
        setShowToast(true);
      }
      setLoading(false);
    };

    return (
      <div style={{ marginBottom: 22, marginLeft: 0, maxWidth: 320, position: 'relative' }}>
        <label style={{ fontSize: 15, fontWeight: 500 }}>Смена линка</label><br />
        <input type="text" value={newLink} onChange={e=>setNewLink(e.target.value)} placeholder="" style={{ marginTop: 6, width: '100%', padding: '8px 10px', borderRadius:8, border: '1px solid #444', background:'#18191c', color:'#fff', fontSize:15 }} />
        <button style={{ marginTop:10, background: '#18191c', color:'#fff', border:'1px solid #444', borderRadius:8, padding:'8px 18px', fontSize:15, cursor:'pointer', fontWeight:500 }} onClick={handleChangeLink} disabled={loading}>{loading ? 'Проверка...' : 'Сменить'}</button>
        {showToast && <ToastNotification type={toastMsg.includes('Успешно') ? 'success' : 'error'} message={toastMsg} duration={3000} onClose={()=>setShowToast(false)} />}
      </div>
    );
  }

  // Отключить 2FA
  async function handleDisable2FA() {
    if (!user) return;
    if (!confirm('Отключить 2FA?')) return;
    try {
      setDisableLoading(true);
  const resp = await fetch('/api/2fa/disable', { method: 'POST', credentials: 'same-origin' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        return alert(err.error || 'Не удалось отключить 2FA');
      }
      setHas2FA(false);
      setSetupQr(null);
      setSetupSecret(null);
      setShowSetup(false);
      setToken("");
    } finally {
      setDisableLoading(false);
    }
  }

  async function handleVerifySetup() {
    if (!verificationCode || !user) return alert('Введите код из приложения');
    try {
      setVerifyLoading(true);
      const resp = await fetch('/api/2fa/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verificationCode })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        return alert(err.error || 'Неверный код');
      }
      setHas2FA(true);
      setShowSetup(false);
      setSetupQr(null);
      setSetupSecret(null);
      setVerificationCode("");
      // обновим профиль
      fetch(`/api/profile?userId=${user.id}`).then(r => r.json()).then(d => setUser(d.user)).catch(()=>{});
      alert('2FA успешно включена');
    } finally {
      setVerifyLoading(false);
    }
  }

  const handleRemoveFriend = async () => {
    if (!user || !removeFriendId) return;
    try {
      const resp = await fetch("/api/friends/remove", {
        method: "POST",
        credentials: 'include',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, friendId: removeFriendId })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        alert(err.error || 'Не удалось удалить друга');
        return;
      }
      // Обновить список друзей
      const prof = await fetch(`/api/profile?userId=${user.id}`, { credentials: 'include' });
      if (prof.ok) {
        const data = await prof.json().catch(() => ({}));
        setFriends(data.user.friends || []);
      } else {
        setFriends([]);
      }
    } catch (e) {
      console.error('Failed to remove friend:', e);
      alert('Ошибка сети при удалении друга');
    } finally {
      setRemoveFriendId(null);
    }
  };
  
  const handleSavePhoneNumber = async () => {
    if (!phoneNumber) return;
    try {
      setPhoneLoading(true);
      setPhoneSaved(false);
      const resp = await fetch('/api/profile/update-phone', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        setToastMsg(err.error || 'Ошибка при сохранении номера');
        setToastType('error');
        setShowToast(true);
        return;
      }
      setPhoneSaved(true);
      setToastMsg('Номер телефона сохранен');
      setToastType('success');
      setShowToast(true);
      setTimeout(() => setPhoneSaved(false), 2000);
    } catch (e) {
      console.error('Error saving phone number:', e);
      setToastMsg('Ошибка сети');
      setToastType('error');
      setShowToast(true);
    } finally {
      setPhoneLoading(false);
    }
  };

  // Проверка авторизации через NextAuth (после всех хуков)
  if (status === "loading" || !session || !session.user || !session.user.id || !user) {
    return <div style={{color:'#bbb',textAlign:'center',marginTop:80,fontSize:22}}></div>;
  }
  if (!session || !session.user || !session.user.id || !user) {
    return <div style={{color:'#fff',textAlign:'center',marginTop:80,fontSize:22}}>Вы не авторизованы</div>;
  }

  return (
    <motion.div
      initial={prefersReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
      animate={prefersReduced ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.2, 0.9, 0.2, 1] } }}
      exit={prefersReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: -6, transition: { duration: 0.07, ease: 'linear' } }}
      style={{
      maxWidth: 600,
      margin: "40px auto",
      padding: 32,
      borderRadius: 18,
      boxShadow: "0 2px 24px #0006",
      position: 'relative',
      background: "#23242a",
      // use a simple system/sans-serif font for the profile page
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      overflowX: "auto",
      WebkitOverflowScrolling: "touch"
    }}>
      {backgroundUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            borderRadius: 18,
            background: `url('${backgroundUrl}') center/cover no-repeat`,
            opacity: Math.max(0.01, bgOpacity / 100)
          }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Settings button — top-right of the profile panel, borderless */}
        {session && session.user && user && session.user.id === user.id && (
          <button
            onClick={() => { setSettingsTab('customization'); setShowSettings(true); }}
            title="Настройки"
            aria-label="Open settings"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 60,
              background: 'transparent',
              border: 'none',
              color: '#fff',
              padding: 6,
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              outline: 'none'
            }}
            onMouseOver={e => (e.currentTarget.style.color = '#229ed9')}
            onMouseOut={e => (e.currentTarget.style.color = '#fff')}
          >
            <FaCog />
          </button>
        )}
        {session && session.user && user && session.user.id === user.id && (
          <button
            title="Сканировать QR"
            aria-label="Сканировать QR"
            onClick={() => { setToastMsg('Функция в разработке...'); setToastType('success'); setShowToast(true); }}
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 60,
              background: 'transparent',
              border: 'none',
              color: '#fff',
              padding: 6,
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              outline: 'none'
            }}
            onMouseOver={e => (e.currentTarget.style.color = '#229ed9')}
            onMouseOut={e => (e.currentTarget.style.color = '#fff')}
          >
            <FaQrcode />
          </button>
        )}
  {/* ...остальной JSX... */}
      <div style={{ display: "flex", flexDirection: 'column', alignItems: 'center', gap: 12, paddingBottom: 18, borderBottom: "1px solid #333" }}>
        <div style={{ position: "relative", width: 96, height: 96 }}>
          <img
            src={avatar || "https://www.svgrepo.com/show/452030/avatar-default.svg"}
            alt="avatar"
            style={{ width: '100%', height: '100%', borderRadius: "50%", objectFit: "cover", background: "#444" }}
          />
          {/* Статус dnd/online/offline (overlay bottom-right) */}
          {user?.status === 'dnd' ? (
            <img src="/moon-dnd.svg" alt="dnd" style={{ position: "absolute", right: 8, bottom: 8, width: 20, height: 20, zIndex: 3 }} />
          ) : (
            <span style={{ position: "absolute", right: 8, bottom: 8, width: 14, height: 14, borderRadius: "50%", background: user?.status === 'online' ? "#1ed760" : "#bbb", border: "2px solid #23242a", zIndex: 3 }} />
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {user?.link ? `@${user.link}` : (user?.login || "Профиль")}
              {userRole === "admin" && (
                <span style={{ position: 'relative', display: 'inline-block' }}
                  onMouseEnter={e => {
                    const tip = document.createElement('div');
                    tip.innerText = 'Linker Developer';
                    Object.assign(tip.style, { position: 'absolute', top: '32px', left: '0', background: '#23242a', color: '#fff', padding: '7px 16px', borderRadius: '10px', fontSize: '15px', boxShadow: '0 2px 16px #229ED944', zIndex: 1000, whiteSpace: 'nowrap' });
                    tip.className = 'admin-tooltip';
                    if (e.currentTarget) e.currentTarget.appendChild(tip);
                  }}
                  onMouseLeave={e => {
                    if (e.currentTarget) {
                      const tips = e.currentTarget.querySelectorAll('.admin-tooltip');
                      tips.forEach((tip: any) => tip.remove());
                    }
                  }}
                >
                  <img src="/role-icons/admin.svg" alt="admin" style={{width:20, height:20, marginLeft:2, verticalAlign:'middle', cursor:'pointer'}} />
                </span>
              )}
              {userRole === "moderator" && (
                <span style={{ position: 'relative', display: 'inline-block' }}
                  onMouseEnter={e => {
                    const tip = document.createElement('div');
                    tip.innerText = 'Модератор Linker';
                    Object.assign(tip.style, { position: 'absolute', top: '32px', left: '0', background: '#23242a', color: '#fff', padding: '7px 16px', borderRadius: '10px', fontSize: '15px', boxShadow: '0 2px 16px #229ED944', zIndex: 1000, whiteSpace: 'nowrap' });
                    tip.className = 'moderator-tooltip';
                    if (e.currentTarget) e.currentTarget.appendChild(tip);
                  }}
                  onMouseLeave={e => {
                    if (e.currentTarget) {
                      const tips = e.currentTarget.querySelectorAll('.moderator-tooltip');
                      tips.forEach((tip: any) => tip.remove());
                    }
                  }}
                >
                  <img src="/role-icons/moderator.svg" alt="moderator" style={{width:20, height:20, marginLeft:2, verticalAlign:'middle', cursor:'pointer'}} />
                </span>
              )}
              {userRole === "verif" && (
                <span style={{ position: 'relative', display: 'inline-block' }}
                  onMouseEnter={e => {
                    const tip = document.createElement('div');
                    tip.innerText = 'Оффициальный аккаунт';
                    Object.assign(tip.style, { position: 'absolute', top: '32px', left: '0', background: '#23242a', color: '#fff', padding: '7px 16px', borderRadius: '10px', fontSize: '15px', boxShadow: '0 2px 16px #229ED944', zIndex: 1000, whiteSpace: 'nowrap' });
                    tip.className = 'verif-tooltip';
                    if (e.currentTarget) e.currentTarget.appendChild(tip);
                  }}
                  onMouseLeave={e => {
                    if (e.currentTarget) {
                      const tips = e.currentTarget.querySelectorAll('.verif-tooltip');
                      tips.forEach((tip: any) => tip.remove());
                    }
                  }}
                >
                  <img src="/role-icons/verif.svg" alt="verif" style={{width:20, height:20, marginLeft:2, verticalAlign:'middle', cursor:'pointer'}} />
                </span>
              )}
              {userRole === "pepe" && (
                <span style={{ position: 'relative', display: 'inline-block' }}
                  onMouseEnter={e => {
                    const tip = document.createElement('div');
                    tip.innerText = 'Linker Developer';
                    Object.assign(tip.style, { position: 'absolute', top: '40px', left: '0', background: '#23242a', color: '#fff', padding: '7px 16px', borderRadius: '10px', fontSize: '15px', boxShadow: '0 2px 16px #229ED944', zIndex: 1000, whiteSpace: 'nowrap' });
                    tip.className = 'pepe-tooltip';
                    if (e.currentTarget) e.currentTarget.appendChild(tip);
                  }}
                  onMouseLeave={e => {
                    if (e.currentTarget) {
                      const tips = e.currentTarget.querySelectorAll('.pepe-tooltip');
                      tips.forEach((tip: any) => tip.remove());
                    }
                  }}
                >
                  <div style={{width:20, height:20, marginLeft:0, verticalAlign:'middle', cursor:'pointer'}}>
                    {String(userRole) === "krip" && (
                      <LottiePlayer src="/role-icons/krip.json" width={22} height={22} loop={true} />
                    )}
                    {String(userRole) === "pepe" && (
                      <LottiePlayer src="/role-icons/pepe.json" width={22} height={22} loop={true} />
                    )}
                  </div>
                </span>
              )}
            </span>
          </div>
          <div style={{ fontSize: 14, color: "#bbb", marginTop: 4, textAlign: 'center' }}>{desc || "Нет описания"}</div>
        </div>
        {/* Old inline settings button removed — use top-right icon button */}
      </div>

    {/* Список друзей и новости */}
    {/* Показываем UserID сразу под шапкой профиля (под линией) */}
    {user && user.id && (
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: 10, color: '#ccc', marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#bfbfbf' }}>Ваш UserID — <span style={{ color: '#9aa0a6', fontWeight: 700 }}>{user.id}</span></div>
            <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(user.id);
                setToastMsg('Скопировано в буфер');
                setToastType('success');
                setShowToast(true);
                setTimeout(() => setShowToast(false), 1500);
              } catch (e) {
                setToastMsg('Не удалось скопировать');
                setToastType('error');
                setShowToast(true);
                setTimeout(() => setShowToast(false), 2000);
              }
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#e6e6e6', cursor: 'pointer' }}
            aria-label="Copy UserID"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/><rect x="4" y="4" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/></svg>
          </button>
        </div>
        
        {user.phoneNumber && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: 10, color: '#ccc', marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: '#bfbfbf', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span style={{ color: '#9aa0a6', fontWeight: 700, fontSize: 16 }}>{user.phoneNumber === "0" ? "Скрыт" : user.phoneNumber}</span>
              <span style={{ fontSize: 12, color: '#888' }}>Телефон</span>
            </div>
          </div>
        )}
      </div>
    )}
        <div style={{ display: "flex", gap: 24, marginTop: 24, transition: "gap 0.3s" }}>
      {/* Список друзей */}
  <div style={{ flex: 1, background: "rgba(35,36,42,0.16)", borderRadius: 14, padding: 16, boxShadow: "0 1px 8px #0003" }}>
  <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 10 }}>{`Список друзей (${friends?.length || 0})`}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
            className={isFriendsScrollable ? "custom-scrollbar" : undefined}
            // make the container shorter so 3+ friends will trigger scrolling on most screens
            style={isFriendsScrollable ? { maxHeight: 160, overflowY: 'auto', paddingRight: 4, scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent' } : { paddingRight: 4 }}
          >
            <style>{`
              /* thin, subtle scrollbar for the friends list when it's scrollable */
              .custom-scrollbar::-webkit-scrollbar { width: 6px; background: transparent; }
              .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
              .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 6px; }
              .custom-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.16) transparent; overflow-x: hidden; }
            `}</style>
            <div style={{ overflowX: 'hidden' }}>
              {friends.length === 0 ? (
                <div style={{ color: "#bbb", fontSize: 16 }}>У вас нет друзей</div>
              ) : friends.map(f => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(35,36,42,0.10)", borderRadius: 14, padding: "12px 16px", boxShadow: "none", transition: "background 0.18s, box-shadow 0.18s", position: "relative", border: '1px solid rgba(255,255,255,0.02)' }} onMouseOver={e => {e.currentTarget.style.background="rgba(35,36,42,0.18)"; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)'; }} onMouseOut={e => {e.currentTarget.style.background="rgba(35,36,42,0.10)"; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ position: "relative", width: 44, height: 44, borderRadius: "50%", background: "#444", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: 'none' }} onClick={() => window.location.href = `/profile/${f.id}`}> 
                    <img src={f.avatar || "https://www.svgrepo.com/show/452030/avatar-default.svg"} alt="avatar" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", background: "#444", boxShadow: 'none' }} />
                    <span style={{ position: "absolute", left: 32, top: 32, width: 12, height: 12, borderRadius: "50%", background: f.isOnline ? "#1ed760" : "#888", border: "2px solid #23242a" }} />
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 17, fontWeight: 600, cursor: "pointer", color: "#fff" }} onClick={() => window.location.href = `/profile/${f.id}`}>{getFriendDisplayName(f.id, f.link ? `@${f.link}` : (f.login || f.friendId))}</span>
                    {f.role === "admin" && (
                      <img src="/role-icons/admin.svg" alt="admin" style={{width:24, height:24, marginLeft:4, verticalAlign:'middle'}} />
                    )}
                    {f.role === "moderator" && (
                      <img src="/role-icons/moderator.svg" alt="moderator" style={{width:24, height:24, marginLeft:4, verticalAlign:'middle'}} />
                    )}
                    {f.role === "verif" && (
                      <img src="/role-icons/verif.svg" alt="verif" style={{width:24, height:24, marginLeft:4, verticalAlign:'middle'}} />
                    )}
                    {f.role === "pepe" && (
                      <img src="/role-icons/pepe.svg" alt="pepe" style={{width:32, height:32, marginLeft:4, verticalAlign:'middle'}} title="Linker Developer" />
                    )}
                    {/* 'ban' role removed: no longer displayed */}
                  </span>
                  <button onClick={() => setRemoveFriendId(f.id)} style={{ position: "absolute", right: 8, top: 12, background: "transparent", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, cursor: "pointer", opacity: 0.5, transition: "opacity 0.2s", zIndex: 2, boxShadow: 'none' }} title="Удалить друга" onMouseOver={e => e.currentTarget.style.opacity = "0.8"} onMouseOut={e => e.currentTarget.style.opacity = "0.5"}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
          {removeFriendId && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: 'blur(6px)' }}>
              <style>{`\n                @keyframes modalPop { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }\n              `}</style>
              <div style={{ background: "linear-gradient(180deg, rgba(35,36,42,0.98), rgba(28,29,32,0.98))", borderRadius: 16, padding: 28, minWidth: 420, maxWidth: '90vw', boxShadow: "0 10px 40px rgba(0,0,0,0.6)", color: "#fff", position: "relative", textAlign: "center", animation: 'modalPop 220ms cubic-bezier(.2,.9,.2,1) both' }}>
                {/* Close button removed as it's redundant - use Отменить to close */}
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: '#fff' }}>Вы уверены, что хотите удалить друга?</div>
                <div style={{ color: '#bfc9cf', marginBottom: 20 }}>Это действие удалит чат и историю сообщений с этим пользователем.</div>
                <div style={{ display: "flex", gap: 14, justifyContent: "center", alignItems: 'center' }}>
                  <button onClick={handleRemoveFriend} style={{ background: "linear-gradient(180deg,#1a3a52,#0f2438)", color: "#64b5f6", border: "none", borderRadius: 10, padding: "10px 26px", fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 18px rgba(26,58,82,0.26)" }}>Да, удалить</button>
                  <button onClick={() => setRemoveFriendId(null)} style={{ background: "transparent", color: "#d1d7db", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 22px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Отменить</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
  {/* Сессии */}
  <div style={{ flex: 1, background: "rgba(35,36,42,0.16)", borderRadius: 14, padding: 16, boxShadow: "0 1px 8px #0003" }}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 10 }}>Сессии</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sessions && sessions.length > 0 ? sessions.map((s: any) => {
            const isCurrent = s.id === currentSessionId;
            return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.05)', padding: 10, borderRadius: 10, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
                  {React.cloneElement(getDeviceIconAndName(s.deviceName) as any, { style: { fontSize: 18, color: '#fff' } })}
                </div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600 }}>{(s.deviceName || 'Неизвестное устройство').length > 26 ? (s.deviceName || 'Неизвестное устройство').substring(0, 26) + '...' : (s.deviceName || 'Неизвестное устройство')} {isCurrent ? <span style={{ display:'inline-block', marginLeft:8, padding:'2px 8px', background:'#1ed760', color:'#022', borderRadius:12, fontSize:12, fontWeight:700 }}>Это вы</span> : null}</div>
                  <div style={{ color: '#bbb', fontSize: 13 }}>{s.ip === '::1' ? 'Неизвестный IP' : (s.ip || 'IP неизвестен')}</div>
                  <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>{new Date(s.createdAt).toLocaleString()}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === s.id ? null : s.id); }} aria-label="Меню сессии" style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer' }}>⋯</button>
                  {openMenuId === s.id && (
                    <div style={{ position: 'absolute', right: 8, top: 44, background: '#23242a', border: '1px solid #333', borderRadius: 10, padding: 8, zIndex: 60, boxShadow: '0 4px 16px #0008' }}>
                      <button onClick={async () => {
                        if (!user) return;
                        if (!confirm('Завершить эту сессию?')) return;
                        try {
                          const resp = await fetch('/api/session-end', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, sessionId: s.id }) });
                              if (resp.ok) {
                            setOpenMenuId(null);
                            // Optimistically remove session from local UI
                            setSessions(prev => prev.filter((ss: any) => ss.id !== s.id));
                            setToastMsg('Сессия завершена'); setToastType('success'); setShowToast(true);
                            // If user ended the current session, sign them out (same as logout)
                            if (isCurrent) {
                              // small delay to allow UI update
                              setTimeout(() => signOut({ callbackUrl: `${window.location.origin}/` }), 300);
                              return;
                            }
                          } else {
                            alert('Не удалось завершить сессию');
                          }
                        } catch (e) { alert('Ошибка'); }
                      }} style={{ background: 'transparent', color: '#64b5f6', border: 'none', padding: '6px 10px', cursor: 'pointer', fontWeight: 600 }}>Завершить</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}) : (
            <div style={{ color: '#bbb' }}>Активных сессий не найдено.</div>
          )}
        </div>
      </div>

      

      {/* Модальное окно с новостью */}
      {showNewsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#000a', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.3s' }}>
          <div style={{ background: '#23242a', borderRadius: 18, padding: 0, minWidth: 340, maxWidth: 420, boxShadow: '0 2px 24px #0008', color: '#fff', position: 'relative', textAlign: 'center', overflow: 'hidden' }}>
            <button onClick={() => setShowNewsModal(false)} style={{ position: 'absolute', top: 10, right: 16, zIndex: 100, background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', transition: 'color 0.2s' }} onMouseOver={e => {e.currentTarget.style.color="#4fc3f7"}} onMouseOut={e => {e.currentTarget.style.color="#fff"}}>✕</button>
            <img src="/news-images/update.jpg" alt="Новое обновление" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block', borderTopLeftRadius: 18, borderTopRightRadius: 18 }} />
            <div style={{ padding: '24px 22px 18px 22px' }}>
              <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 10 }}>Новое обновление v8.0</div>
              <div style={{ color: '#bbb', fontSize: 16, marginBottom: 8 }}>
                Обновление v8.0
                Линк - как юзернейм, стало намного безопаснее и удобнее
                Новое шифрование всех сообщений
                Статусы, отображение фона профиля и чата, исправление проблем с UserID
                Отображение UserID в профиле друга/своем. Google 2FA доделан, и работает полноценно. Доработаны видео и голосовые сообщения, все шифруется и отправляется.<br />
                <br />
                
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Модальное окно настроек */}
      {showSettings && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            {/* Close button */}
            <button
              className={styles.close}
              onClick={() => setShowSettings(false)}
              title="Закрыть"
            >
              ✕
            </button>

            {/* Left sidebar with profile info and navigation */}
            <div className={styles.sidebar}>
              {/* Profile header */}
              <div className={styles.profileHeader}>
                <div className={styles.profileHeaderContent}>
                  <div className={styles.avatar}>
                    <img
                      src={avatar || "https://www.svgrepo.com/show/452030/avatar-default.svg"}
                      alt="avatar"
                    />
                  </div>
                  <div className={styles.profileInfo}>
                    <div className={styles.username}>
                      {user?.link ? `@${user.link}` : (user?.login || "Профиль")}
                    </div>
                    {roleIconSrc && (
                      <img
                        src={roleIconSrc}
                        alt="role"
                        style={{ width: 14, height: 14, marginTop: 4 }}
                      />
                    )}
                    <div className={styles.usernameSmall}>Настройки</div>
                    {phoneNumber && phoneNumber !== "0" && (
                      <div style={{ fontSize: 12, color: "#9aa0a6", marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>{phoneNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Menu */}
              <div className={styles.menu}>
                <button
                  className={`${styles.menuItem} ${settingsTab === 'customization' ? styles.active : ''}`}
                  onClick={() => setSettingsTab('customization')}
                >
                  <FaPalette size={16} />
                  <span>Оформление</span>
                </button>
                <button
                  className={`${styles.menuItem} ${settingsTab === 'security' ? styles.active : ''}`}
                  onClick={() => setSettingsTab('security')}
                >
                  <FaShieldAlt size={16} />
                  <span>Безопасность</span>
                </button>
                <button
                  className={`${styles.menuItem} ${settingsTab === 'privacy' ? styles.active : ''}`}
                  onClick={() => setSettingsTab('privacy')}
                >
                  <FaUserCircle size={16} />
                  <span>Статус</span>
                </button>
              </div>
            </div>

            {/* Right content area */}
            <div className={styles.content}>
              {/* Customization */}
              {(settingsTab === 'customization' || isMobile) && (
                <>
                  <div className={styles.contentHeader}>
                    <FaPalette className={styles.contentHeaderIcon} />
                    <span className={styles.contentHeaderTitle}>Оформление профиля</span>
                  </div>
                  <div className={styles.contentBody}>
                    {/* Change login section */}
                    <div className={styles.section}>
                      <span className={styles.sectionTitle}>Смена логина</span>
                      <div className={styles.card}>
                        <label className={styles.cardLabel}>Новый логин</label>
                        <div className={styles.inputGroup}>
                          <input
                            type="text"
                            className={styles.cardInput}
                            placeholder="Введите новый логин"
                            value={newLogin}
                            onChange={(e) => setNewLogin(e.target.value)}
                          />
                          <button
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            onClick={async () => {
                              if (!newLogin || !user) return;
                              setLoading(true);
                              const res = await fetch('/api/profile/change-login', {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ newLogin })
                              });
                              const data = await res.json();
                              if (res.ok) {
                                setToastMsg('Логин успешно изменён!');
                                setShowToast(true);
                                setUser(data.user);
                                setNewLogin('');
                                fetch(`/api/profile?userId=${data.user.id}`).then(r => r.json()).then(profile => setFriends(profile.user.friends || [])).catch(()=>{});
                                try { localStorage.setItem('user', JSON.stringify({ id: data.user.id, login: data.user.login, link: data.user.link || null })); } catch {}
                              } else {
                                if (data.error === 'Login is already taken') {
                                  setToastMsg('Логин уже занят.');
                                } else {
                                  setToastMsg(data.error || 'Ошибка при смене логина');
                                }
                                setShowToast(true);
                              }
                              setLoading(false);
                            }}
                            disabled={loading}
                          >
                            {loading ? '...' : 'Сменить'}
                          </button>
                        </div>
                        {showToast && toastMsg && (
                          <ToastNotification
                            type={toastMsg === "Логин успешно изменён!" ? "success" : "error"}
                            message={toastMsg}
                            duration={3000}
                            onClose={() => setShowToast(false)}
                          />
                        )}
                      </div>
                    </div>

                    {/* Change link section */}
                    <div className={styles.section}>
                      <span className={styles.sectionTitle}>Смена линка</span>
                      <div className={styles.card}>
                        <label className={styles.cardLabel}>Ваш линк (@link)</label>
                        <div className={styles.inputGroup}>
                          <input
                            type="text"
                            className={styles.cardInput}
                            placeholder="link"
                            value={newLink}
                            onChange={(e) => setNewLink(e.target.value)}
                          />
                          <button
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            onClick={async () => {
                              if (!newLink || !user) return;
                              const re = /^[A-Za-z0-9_]{3,32}$/;
                              if (!re.test(newLink)) {
                                setToastMsg('Неверный формат линка');
                                setShowToast(true);
                                return;
                              }
                              setLoading(true);
                              const res = await fetch('/api/profile/change-link', {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ newLink })
                              });
                              const data = await res.json();
                              if (res.ok) {
                                setUser(data.user);
                                setNewLink('');
                                setToastMsg('Юзернейм успешно изменён!');
                                setShowToast(true);
                                try {
                                  localStorage.setItem('user', JSON.stringify({
                                    id: data.user.id,
                                    login: data.user.login,
                                    link: data.user.link || null
                                  }));
                                } catch {}
                              } else {
                                if (data.error === 'Link is already taken') setToastMsg('Юзернейм уже занят');
                                else setToastMsg(data.error || 'Ошибка при смене юзернейма');
                                setShowToast(true);
                              }
                              setLoading(false);
                            }}
                            disabled={loading}
                          >
                            {loading ? '...' : 'Сменить'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Description section */}
                    <div className={styles.section}>
                      <span className={styles.sectionTitle}>О себе</span>
                      <div className={styles.card}>
                        <label className={styles.cardLabel}>Описание профиля</label>
                        <textarea
                          className={styles.cardInput}
                          placeholder="Расскажите о себе..."
                          value={desc}
                          onChange={(e) => setDesc(e.target.value)}
                          style={{ minHeight: 80, resize: 'vertical' }}
                        />
                        <button
                          className={`${styles.btn} ${styles.btnPrimary}`}
                          style={{ marginTop: 8 }}
                          onClick={async () => {
                            if (!user) return;
                            await fetch('/api/profile', {
                              method: 'POST',
                              credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: user.id, description: desc })
                            });
                            setToastMsg('Описание сохранено');
                            setToastType('success');
                            setShowToast(true);
                          }}
                        >
                          Сохранить
                        </button>
                      </div>
                    </div>

                    {/* Avatar section */}
                    <div className={styles.section}>
                      <span className={styles.sectionTitle}>Аватарка</span>
                      <div className={styles.card}>
                        <label className={styles.cardLabel}>URL аватарки</label>
                        <input
                          type="text"
                          className={styles.cardInput}
                          placeholder="https://example.com/avatar.jpg"
                          value={avatar}
                          onChange={(e) => setAvatar(e.target.value)}
                        />
                        <button
                          className={`${styles.btn} ${styles.btnPrimary}`}
                          style={{ marginTop: 8 }}
                          onClick={async () => {
                            if (!user) return;
                            await fetch('/api/profile', {
                              method: 'POST',
                              credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: user.id, avatar })
                            });
                            try {
                              window.dispatchEvent(new Event('profile-updated'));
                            } catch {}
                            setToastMsg('Аватарка сохранена');
                            setToastType('success');
                            setShowToast(true);
                          }}
                        >
                          Сохранить
                        </button>
                      </div>
                    </div>

                    {/* Background section */}
                    <div className={styles.section}>
                      <span className={styles.sectionTitle}>Фон профиля</span>
                      <div className={styles.card}>
                        <label className={styles.cardLabel}>URL фона</label>
                        <input
                          type="text"
                          className={styles.cardInput}
                          placeholder="https://example.com/bg.jpg"
                          value={backgroundUrl}
                          onChange={(e) => setBackgroundUrl(e.target.value)}
                        />
                        <label className={styles.cardLabel} style={{ marginTop: 12 }}>
                          Яркость фона: {bgOpacity}%
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={bgOpacity}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setBgOpacity(val);
                            try {
                              localStorage.setItem('profileBgOpacity', String(val));
                            } catch {}
                          }}
                          className={styles.cardInput}
                          style={{ marginTop: 6 }}
                        />
                        <button
                          className={`${styles.btn} ${styles.btnPrimary}`}
                          style={{ marginTop: 8 }}
                          onClick={async () => {
                            if (!user) return;
                            await fetch('/api/profile', {
                              method: 'POST',
                              credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: user.id, backgroundUrl })
                            });
                            setToastMsg('Фон сохранён');
                            setToastType('success');
                            setShowToast(true);
                          }}
                        >
                          Сохранить
                        </button>
                      </div>
                    </div>

                    {/* Phone number section */}
                    <div className={styles.section}>
                      <span className={styles.sectionTitle}>Контакты</span>
                      <div className={styles.card}>
                        <label className={styles.cardLabel}>Номер телефона</label>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', opacity: 0.6 }}>
                          <span style={{ color: '#bfbfbf', fontSize: 14 }}>в разработке</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Security */}
              {(settingsTab === 'security' || isMobile) && (
                <>
                  <div className={styles.contentHeader}>
                    <FaShieldAlt className={styles.contentHeaderIcon} />
                    <span className={styles.contentHeaderTitle}>Безопасность</span>
                  </div>
                  <div className={styles.contentBody}>
                    {/* Password section */}
                    <div className={styles.section}>
                      <span className={styles.sectionTitle}>Пароль</span>
                      <div className={styles.card}>
                        <label className={styles.cardLabel}>Новый пароль</label>
                        <div className={styles.inputGroup}>
                          <input
                            type={showPassword ? "text" : "password"}
                            className={styles.cardInput}
                            placeholder="Введите новый пароль"
                            value={newPassword}
                            onChange={(e) => {
                              setNewPassword(e.target.value);
                              setPasswordError("");
                            }}
                            autoComplete="new-password"
                          />
                          <button
                            className={`${styles.btn} ${styles.btnSecondary}`}
                            onClick={() => setShowPassword(!showPassword)}
                            title={showPassword ? "Скрыть" : "Показать"}
                          >
                            {showPassword ? "🙈" : "👁️"}
                          </button>
                        </div>
                        <div className={styles.btnGroup}>
                          <button
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            onClick={async () => {
                              if (!user || !newPassword) return;
                              if (forbiddenPasswords.includes(newPassword)) {
                                setToastMsg('Слишком простой пароль!');
                                setToastType('error');
                                setShowToast(true);
                                return;
                              }
                              await fetch('/api/profile', {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: user.id, password: newPassword })
                              });
                              setNewPassword("");
                              setToastMsg('Пароль изменён!');
                              setToastType('success');
                              setShowToast(true);
                            }}
                          >
                            Сменить пароль
                          </button>
                          <button
                            className={`${styles.btn} ${styles.btnSecondary}`}
                            onClick={() => {
                              const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*_+-";
                              let pass = "";
                              for (let i = 0; i < 12; i++) pass += charset[Math.floor(Math.random() * charset.length)];
                              setNewPassword(pass);
                            }}
                            title="Сгенерировать надёжный пароль"
                          >
                            Сгенерировать
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 2FA section */}
                    <div className={styles.section}>
                      <span className={styles.sectionTitle}>Двухфакторная аутентификация</span>
                      <div className={`${styles.twoFACard} ${!has2FA ? styles.disabled : ''}`}>
                        <div className={styles.twoFAIcon}>
                          <FaShieldAlt size={20} />
                        </div>
                        <div className={styles.twoFAContent}>
                          <div className={styles.twoFATitle}>2FA Google Authenticator</div>
                          <div className={`${styles.twoFAStatus} ${!has2FA ? styles.disabled : ''}`}>
                            {has2FA ? '✓ Включена' : 'Отключена'}
                          </div>
                          <div className={styles.twoFADescription}>
                            {has2FA
                              ? 'Двухфакторная аутентификация защищает ваш аккаунт.'
                              : 'Добавьте дополнительный уровень защиты с помощью 2FA.'}
                          </div>
                          {has2FA ? (
                            <button
                              className={`${styles.btn} ${styles.btnDanger}`}
                              onClick={handleDisable2FA}
                              disabled={disableLoading}
                            >
                              {disableLoading ? 'Отключаем...' : 'Отключить 2FA'}
                            </button>
                          ) : (
                            <button
                              className={`${styles.btn} ${styles.btnPrimary}`}
                              onClick={handleEnable2FA}
                              disabled={setupLoading}
                            >
                              {setupLoading ? 'Генерация...' : 'Включить 2FA'}
                            </button>
                          )}

                          {/* QR Setup Modal */}
                          {showSetup && setupQr && (
                            <div className={styles.qrSetup}>
                              <div className={styles.qrContainer}>
                                <img src={setupQr} alt="QR Code" />
                              </div>
                              <div className={styles.qrInfo}>
                                <div className={styles.qrTitle}>Отсканируйте QR-код</div>
                                <div className={styles.qrDescription}>
                                  Используйте Google Authenticator или Authy для сканирования кода
                                </div>
                                <div className={styles.secretContainer}>
                                  <code className={styles.secret}>{setupSecret}</code>
                                  <button
                                    className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                                    onClick={() => {
                                      if (setupSecret) {
                                        navigator.clipboard.writeText(setupSecret);
                                        alert('Секрет скопирован');
                                      }
                                    }}
                                  >
                                    Копировать
                                  </button>
                                </div>
                                <div className={styles.codeInputContainer}>
                                  <CodeInput
                                    value={verificationCode}
                                    onChange={setVerificationCode}
                                    length={6}
                                    disabled={verifyLoading}
                                  />
                                </div>
                                <div className={styles.btnGroup} style={{ width: '100%' }}>
                                  <button
                                    className={`${styles.btn} ${styles.btnPrimary}`}
                                    style={{ flex: 1 }}
                                    onClick={handleVerifySetup}
                                    disabled={verifyLoading}
                                  >
                                    {verifyLoading ? 'Проверка...' : 'Подтвердить'}
                                  </button>
                                  <button
                                    className={`${styles.btn} ${styles.btnSecondary}`}
                                    style={{ flex: 1 }}
                                    onClick={() => {
                                      setShowSetup(false);
                                      setSetupQr(null);
                                      setSetupSecret(null);
                                      setVerificationCode('');
                                    }}
                                  >
                                    Отмена
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Privacy/Status */}
              {(settingsTab === 'privacy' || isMobile) && (
                <>
                  <div className={styles.contentHeader}>
                    <FaUserCircle className={styles.contentHeaderIcon} />
                    <span className={styles.contentHeaderTitle}>Статус онлайна</span>
                  </div>
                  <div className={styles.contentBody}>
                    <div className={styles.section}>
                      <span className={styles.sectionTitle}>Выберите статус</span>
                      <div className={styles.card}>
                        <div className={styles.statusButtons}>
                          <button
                            className={`${styles.statusBtn} ${user?.status === 'online' ? styles.active : ''}`}
                            onClick={async () => {
                              if (!user) return;
                              await fetch('/api/profile', {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: user.id, status: 'online' })
                              });
                              setUser({ ...user, status: 'online' });
                            }}
                            title="В сети"
                          >
                            <UserStatus status="online" size={20} />
                          </button>
                          <button
                            className={`${styles.statusBtn} ${user?.status === 'offline' ? styles.active : ''}`}
                            onClick={async () => {
                              if (!user) return;
                              await fetch('/api/profile', {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: user.id, status: 'offline' })
                              });
                              setUser({ ...user, status: 'offline' });
                            }}
                            title="Не в сети"
                          >
                            <UserStatus status="offline" size={20} />
                          </button>
                          <button
                            className={`${styles.statusBtn} ${user?.status === 'dnd' ? styles.active : ''}`}
                            onClick={async () => {
                              if (!user) return;
                              await fetch('/api/profile', {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: user.id, status: 'dnd' })
                              });
                              setUser({ ...user, status: 'dnd' });
                            }}
                            title="Не беспокоить"
                          >
                            <img src="/moon-dnd.svg" alt="DND" style={{ width: 20, height: 20 }} />
                          </button>
                        </div>
                        <div className={styles.statusDescription}>
                          {user?.status === 'online' && (
                            <>
                              <strong style={{ color: '#1ed760' }}>В сети</strong>
                              <br />
                              Все друзья видят, что вы онлайн
                            </>
                          )}
                          {user?.status === 'offline' && (
                            <>
                              <strong style={{ color: '#9e9e9e' }}>Не в сети</strong>
                              <br />
                              Ваш статус скрыт от друзей
                            </>
                          )}
                          {user?.status === 'dnd' && (
                            <>
                              <strong style={{ color: '#b8b814' }}>Не беспокоить</strong>
                              <br />
                              Вы онлайн, но уведомления отключены
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </motion.div>
    );
}