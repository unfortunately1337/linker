import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { getFriendDisplayName } from '../lib/hooks';

// Small portal for rendering modal content into document.body
function ModalPortal({ children }: { children: React.ReactNode }) {
  const elRef = React.useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = React.useState(false);
  useEffect(() => {
    const el = document.createElement('div');
    elRef.current = el;
    document.body.appendChild(el);
    setMounted(true);
    return () => {
      try { if (elRef.current) document.body.removeChild(elRef.current); } catch (e) {}
    };
  }, []);
  if (!mounted || !elRef.current) return null;
  return ReactDOM.createPortal(children, elRef.current);
}
import { useSession } from 'next-auth/react';
// Sidebar is rendered globally from _app.tsx - don't render it again in the page
// import Sidebar from '../components/Sidebar';
import ToastNotification from '../components/ToastNotification';
import getLocalUser from '../lib/session';

export default function PostsPage() {
  const { data: session, status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // full content removed: only description is used
  const [creating, setCreating] = useState(false);
  const [publishAnim, setPublishAnim] = useState<'idle'|'success'|'none'>('idle');
  const [toast, setToast] = useState<{ type: 'success'|'error'; message: string } | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [outgoingRequestIds, setOutgoingRequestIds] = useState<Set<string>>(new Set());
  const [openCreate, setOpenCreate] = useState(false);
    const titleRef = useRef<HTMLInputElement | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const observed = useRef<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);

  
  // No local fallback; likes are stored in DB and UI reflects server state

  // Close modal on Escape key press
  useEffect(() => {
    if (!openCreate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenCreate(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCreate]);

  // clear input fields when modal closes
  useEffect(() => {
    if (!openCreate) {
      setTitle(''); setDescription(''); setFile(null);
    }
  }, [openCreate]);

  useEffect(() => {
    if (openCreate) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [openCreate]);

  // Prevent page scroll while modal open using overflow hidden (no position fixed) to avoid layout shifts
  useEffect(() => {
    const originalOverflow = document.body.style.overflow || '';
    const originalPaddingRight = document.body.style.paddingRight || '';
    const originalHtmlOverflow = document.documentElement.style.overflow || '';
    if (openCreate) {
      const scrollBarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
      if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`;
      document.body.style.overflow = 'hidden';
      try { document.documentElement.style.overflow = 'hidden'; document.documentElement.style.touchAction = 'none'; } catch (e) {}
    }
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      try { document.documentElement.style.overflow = originalHtmlOverflow; document.documentElement.style.touchAction = ''; } catch (e) {}
    };
  }, [openCreate]);

  // Add a body class to handle page-level styles while modal open
  useEffect(() => {
    if (openCreate) document.body.classList.add('modal-open');
    else document.body.classList.remove('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [openCreate]);

  useEffect(() => { fetchPosts(); }, [session?.user?.id, status]);

  // Load current user's friends and outgoing friend requests to reflect friend button state
  useEffect(() => {
    const currentUserId = session?.user?.id || ((typeof window !== 'undefined') ? (getLocalUser() as any)?.id : null);
    if (!currentUserId) {
      setFriendIds(new Set());
      setOutgoingRequestIds(new Set());
      return;
    }

    let active = true;
    (async () => {
      try {
        const profileUrl = `/api/profile?userId=${encodeURIComponent(String(currentUserId))}`;
        const pr = await fetch(profileUrl, { credentials: 'include' });
        if (!active) return;
        if (pr.ok) {
          const j = await pr.json().catch(()=>null);
          const friendsArr = j?.user?.friends || [];
          setFriendIds(new Set((friendsArr || []).map((f:any)=>f.id)));
        }
      } catch (e) { console.warn('Failed to fetch profile for friend state', e); }
      try {
        const out = await fetch('/api/friends/outgoing', { credentials: 'include' });
        if (!active) return;
        if (out.ok) {
          const j = await out.json().catch(()=>null);
          const toIds = j?.toIds || [];
          setOutgoingRequestIds(new Set(Array.isArray(toIds) ? toIds : []));
        }
      } catch (e) { console.warn('Failed to fetch outgoing friend requests', e); }
    })();
    return () => { active = false; };
  }, [status]);

  // Setup IntersectionObserver to track post views; increment once per session for each post
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('IntersectionObserver' in window)) return; // fallback: don't track
    if (observerRef.current) return; // already inited
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(async (entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        const postId = el.dataset.postId;
        if (!postId) return;
        // Avoid duplicate counts: consult local session storage fallback
        if (observed.current.has(postId)) return;
        try {
          const stored = sessionStorage.getItem('viewedPosts');
          if (stored) {
            const arr = JSON.parse(stored) as string[];
            if (Array.isArray(arr) && arr.includes(postId)) {
              observed.current.add(postId);
              return;
            }
          }
        } catch (e) {}
        observed.current.add(postId);
        try {
          const r = await fetch(`/api/posts/${postId}/view`, { method: 'POST', credentials: 'include' });
          if (!r.ok) return; // ignore failures
          const j = await r.json().catch(() => null);
          if (j && j.views !== undefined) {
            setPosts(ps => ps.map(x => x.id === postId ? { ...x, views: String(j.views) } : x));
            try {
              const prev = sessionStorage.getItem('viewedPosts');
              const arr = prev ? JSON.parse(prev) as string[] : [];
              if (!arr.includes(postId)) {
                arr.push(postId);
                sessionStorage.setItem('viewedPosts', JSON.stringify(arr));
              }
            } catch (e) {}
          }
        } catch (e) { console.warn('view report failed', e); }
      });
    }, { threshold: 0.25 });
  }, []);

  // Disconnect observer on unmount
  useEffect(() => {
    return () => {
      try {
        observerRef.current?.disconnect();
        observerRef.current = null;
      } catch (e) {}
    };
  }, []);

  // Observe/unobserve DOM nodes representing posts when the post list updates
  useEffect(() => {
    const obs = observerRef.current;
    if (!obs) return undefined;
    const nodes = Array.from(document.querySelectorAll('.postCard[data-post-id]')) as HTMLElement[];
    nodes.forEach(n => { try { obs.observe(n); } catch (e) {} });
    return () => nodes.forEach(n => { try { obs.unobserve(n); } catch (e) {} });
  }, [posts]);

  // Прослушиваем изменения кастомных имён друзей для обновления UI
  useEffect(() => {
    const updatePostsList = () => {
      // Принуждаем переренdered при изменении имён
      setPosts(prev => [...prev]);
    };
    
    window.addEventListener('friend-name-changed', updatePostsList as EventListener);
    return () => window.removeEventListener('friend-name-changed', updatePostsList as EventListener);
  }, []);

    async function fetchPosts(){
      const r = await fetch('/api/posts', { credentials: 'include' });
      if (r.ok) {
        const j = await r.json().catch(()=>({posts:[]}));
        // console.log('[CLIENT:/posts] fetched posts response=', j);
        // Normalize posts and ensure client-side isOwner based on session (fallback)
        // Explicit: likes come from DB; do not use local storage fallback
        const localUserId = (typeof window !== 'undefined') ? (getLocalUser() as any)?.id : null;
        const currentUserId = session?.user?.id || localUserId || null;
        const normalized = (j.posts || []).map((pp: any) => {
          const authorId = (pp.author && pp.author.id) || pp.authorId || null;
          return {
            ...pp,
            authorId,
            author: pp.author || (authorId ? { id: authorId } : undefined),
            likesCount: String(pp.likesCount ?? '0'),
            pinned: Boolean(pp.pinned),
            isOwner: Boolean(pp.isOwner || (currentUserId && authorId && currentUserId === authorId)),
            likedByCurrentUser: Boolean(pp.likedByCurrentUser),
            views: String(pp.views || '0'),
          };
        });
        setPosts(normalized);
        // DEBUG: log owner and liked state counts
        try { /* console.log('[CLIENT:/posts] owners:', normalized.filter((x:any)=>x.isOwner).map((x:any)=>x.id), 'likes:', normalized.filter((x:any)=>x.likedByCurrentUser).map((x:any)=>x.id)); */ } catch (e) {}
    if ((!j.posts || j.posts.length === 0)) {
        try {
          // fallback to the simple SQL-based endpoint to handle production schema mismatches
          const rf = await fetch('/api/posts/simple');
            if (rf.ok) {
            const jf = await rf.json().catch(()=>({posts:[]}));
            console.log('[CLIENT:/posts] simple posts fallback response=', jf);
            const normalizedFallback = (jf.posts || []).map((pp: any) => {
              const authorId = (pp.author && pp.author.id) || pp.authorId || null;
              return {
                ...pp,
                authorId,
                author: pp.author || (authorId ? { id: authorId } : undefined),
                likedByCurrentUser: Boolean(pp.likedByCurrentUser),
                likesCount: String(pp.likesCount ?? '0'),
                pinned: Boolean(pp.pinned),
                isOwner: Boolean(pp.isOwner || (currentUserId && authorId && currentUserId === authorId)),
                views: String(pp.views || '0'),
              };
            });
            setPosts(normalizedFallback || []);
            try { /* console.log('[CLIENT:/posts] fallback owners:', normalizedFallback.filter((x:any)=>x.isOwner).map((x:any)=>x.id), 'likes:', normalizedFallback.filter((x:any)=>x.likedByCurrentUser).map((x:any)=>x.id)); */ } catch (e) {}
          }
        } catch (e) {}
      }
    }
  }

  async function handleUploadAndCreate(){
    setCreating(true);
    try {
      let mediaId: string | undefined = undefined;
      if (file) {
        console.log('[CLIENT:/posts] Creating post with inline file', { title, description, fileName: file.name, fileSize: file.size });
        // Attach file directly to posts/create (server will accept multipart and store bytes in Post)
        // Upload the file via /api/media/upload first (more robust, avoids inline storage)
        const uploadFd = new FormData();
        uploadFd.append('file', file, file.name);
        uploadFd.append('ownerId', '');
        const uploadRes = await fetch('/api/media/upload', { method: 'POST', body: uploadFd, credentials: 'include' });
        const uploadJson = await uploadRes.json().catch(() => null);
        if (!uploadRes.ok) {
          setToast({ type: 'error', message: (uploadJson && uploadJson.error) || 'Failed to upload media' });
          setCreating(false);
          return;
        }
        const mediaId = uploadJson?.mediaId;
        const createRes = await fetch('/api/posts/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, mediaId }), credentials: 'include' });
        const createJson = await createRes.json().catch(() => null);
        console.log('[CLIENT:/posts] create response', { status: createRes.status, json: createJson });
        if (!createRes.ok) {
          const er = createJson || { error: 'failed' };
          setToast({ type: 'error', message: er.error || 'Failed to create post' });
          setCreating(false);
          return;
        }
        setToast({ type: 'success', message: 'Пост опубликован' });
        setPublishAnim('success');
        // keep modal briefly open to show animation, then close
        setTimeout(async () => {
          setOpenCreate(false);
          setPublishAnim('idle');
          setFile(null);
          setTitle(''); setDescription('');
          await fetchPosts();
        }, 700);
        return;
      }

      const createRes = await fetch('/api/posts/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, mediaId }), credentials: 'include' });
      if (!createRes.ok) {
        const er = await createRes.json().catch(()=>({error:'failed'}));
        setToast({ type: 'error', message: er.error || 'Failed to create post' });
        setCreating(false);
        return;
      }
      setToast({ type: 'success', message: 'Пост опубликован' });
      setPublishAnim('success');
      setTimeout(async () => {
        setOpenCreate(false);
        setPublishAnim('idle');
        setFile(null);
        setTitle(''); setDescription('');
        await fetchPosts();
      }, 700);
    } catch (e: any) {
      console.error('create post error', e);
      setToast({ type: 'error', message: e?.message || 'Ошибка' });
    } finally { setCreating(false); }
  }

  // NOTE: cleanup logic intentionally removed — duplicate timestamp was removed from markup

  return (
    <div style={{ display: 'flex' }}>
      {/* Sidebar is rendered by _app.tsx, so we don't render it here to avoid duplication */}
      <div style={{ padding: 24, width: '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h2 style={{ color: '#fff' }}>Лента постов</h2>

        {/* Floating create button top-right */}
        <button
          onClick={() => setOpenCreate(s => !s)}
          title="Создать пост"
          className="floatingCreate"
        >
          {openCreate ? '✕' : '+'}
        </button>

        {openCreate && (
          <ModalPortal>
            <div className="createPostBackdrop" onClick={() => setOpenCreate(false)}>
              <div className="createPostModal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                <div className="createPostHeader">
                  <div className="createPostTitle">Создать пост</div>
                  <button className="createPostCloseBtn" onClick={() => setOpenCreate(false)} aria-label="Закрыть">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
                
                <form className="createPostForm" onSubmit={(e)=>{ e.preventDefault(); void handleUploadAndCreate(); }}>
                  <div className="formGroup">
                    <label className="formLabel">Заголовок</label>
                    <input 
                      ref={titleRef} 
                      className="createPostInput" 
                      placeholder="Введите заголовок вашего поста" 
                      value={title} 
                      onChange={e=>setTitle(e.target.value)} 
                      maxLength={100}
                    />
                  </div>

                  <div className="formGroup">
                    <label className="formLabel">Описание</label>
                    <textarea 
                      className="createPostTextarea" 
                      placeholder="Расскажите больше о вашем посте..." 
                      value={description} 
                      onChange={e=>setDescription(e.target.value)}
                      maxLength={500}
                      rows={4}
                    />
                    <div className="charCount">{description.length}/500</div>
                  </div>

                  <div className="formGroup">
                    <label className="formLabel">Медиа</label>
                    <label className="fileUploadBox">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={e=>setFile(e.target.files ? e.target.files[0] : null)}
                        className="fileInputHidden"
                      />
                      <div className="fileUploadContent">
                        <div className="uploadText">Нажмите для загрузки фото</div>
                        <div className="uploadHint">PNG, JPG до 10MB</div>
                      </div>
                    </label>
                    {file && <div className="fileStatusText fileSelected">{file.name}</div>}
                  </div>

                  <div className="createPostFooter">
                    <button 
                      type="button" 
                      className="createPostCancelBtn" 
                      onClick={() => setOpenCreate(false)}
                      disabled={creating}
                    >
                      Отмена
                    </button>
                    <button 
                      type="submit" 
                      className={`createPostPublishBtn ${publishAnim === 'success' ? 'success' : ''}`} 
                      disabled={creating}
                    >
                      {creating ? (
                        <svg className="btnSpinner" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                          <path d="M4 12a8 8 0 0 0 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(45 12 12)"/>
                        </svg>
                      ) : publishAnim === 'success' ? (
                        <svg className="successCheck" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden focusable="false">
                          <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <span>Опубликовать</span>
                      )}
                    </button>
                  </div>
                </form>

                {creating && (
                  <div className="createPostOverlay" role="status" aria-live="polite">
                    <div className="publishingRow">
                      <svg className="publishingSpinner" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.2" fill="none" />
                        <path d="M4 12a8 8 0 0 0 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(45 12 12)"/>
                      </svg>
                      <div className="publishingText">Пост публикуется...</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ModalPortal>
        )}

        <div style={{ marginTop: 28, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 920 }}>
            {posts.map(p=> {
              const isOwnerUi = !!(p.isOwner || (session?.user?.id && p.authorId && session.user.id === p.authorId));
              const isFriend = Boolean(p.authorId && friendIds && friendIds.has(p.authorId));
              const requestSent = Boolean(p.authorId && outgoingRequestIds && outgoingRequestIds.has(p.authorId));
              return (
              <div key={p.id} data-post-id={p.id} className="postCard" role="article">

                <div className="postHeader">
                  <div className="authorWrap" onClick={()=> window.location.href = `/profile/${p.authorId || p.author?.id}`}>
                    {p.author?.avatar ? <img src={p.author.avatar} className="postAvatar" /> : <div className="postAvatarFallback">{(p.author && p.author.login) ? p.author.login[0] : (p.authorId ? 'U' : 'U')}</div>}
                  <div className="authorCol">
                    <div className="authorName">{getFriendDisplayName(p.author?.id || p.authorId || '', p.author?.link ? `@${p.author.link}` : (p.author?.login || 'User'))}
                      {isOwnerUi ? (
                        <span style={{ marginLeft: 8, fontSize: 12, color: '#ffd27a', fontWeight: 700 }}>Ваш пост</span>
                      ) : (
                        <div style={{ display: 'inline-block', marginLeft: 8 }}>
                          {/** Friend button: small but slightly wide */}
                          {isFriend ? (
                            <span className="friendLabel" onClick={(e)=>{ e.stopPropagation(); }} aria-label="Ваш друг" title="Ваш друг">Ваш друг</span>
                          ) : requestSent ? (
                            <button type="button" className="friendBtn pending" aria-label="Заявка отправлена" title="Заявка отправлена" onClick={(e)=>{ e.stopPropagation(); }}>
                              <svg className="userPlusIcon" viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden focusable="false">
                                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M21 21c0-2.5-2.1-4.5-5-4.5H8c-2.9 0-5 2-5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M19 8v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M21 10h-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              Заявка отправлена
                            </button>
                          ) : (
                            <button type="button" className="friendBtn" aria-label="Добавить в друзья" title="Добавить в друзья" onClick={async(e)=>{ e.stopPropagation();
                              if (!p.authorId) return;
                              if (status === 'unauthenticated') { setToast({ type: 'error', message: 'Пожалуйста, войдите в систему' }); return; }
                              try {
                                // Optimistic UI: add to outgoing set
                                setOutgoingRequestIds(s => new Set(s).add(p.authorId));
                                const r = await fetch('/api/friends/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friendId: p.authorId }), credentials: 'include' });
                                const json = await r.json().catch(()=>null);
                                if (!r.ok) {
                                  // revert optimistic update
                                  setOutgoingRequestIds(s => { const nxt = new Set(s); nxt.delete(p.authorId); return nxt; });
                                  setToast({ type: 'error', message: (json && (json.error || json.detail)) || `Ошибка: ${r.status}` });
                                  return;
                                }
                                setToast({ type: 'success', message: 'Заявка отправлена' });
                              } catch (e:any) {
                                console.error('send friend request error', e);
                                setToast({ type: 'error', message: e?.message || 'Ошибка' });
                                setOutgoingRequestIds(s => { const nxt = new Set(s); nxt.delete(p.authorId); return nxt; });
                              }
                            }}>+ В друзья</button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="authorMeta">{formatDate(p.createdAt)}</div>
                  </div>
                </div>
                {isOwnerUi && (
                  <div className="ownerMenuWrap">
                    <button type="button" className="dotBtn" onClick={()=> setMenuOpenId(menuOpenId === p.id ? null : p.id)} aria-label="Меню поста">⋯</button>
                    {menuOpenId === p.id && (
                      <div className="dotMenu">
                        <button type="button" className="dotMenuItem" onClick={async()=>{
                          if (!confirm('Удалить пост?')) return;
                          try {
                            const r = await fetch(`/api/posts/${p.id}`, { method: 'DELETE', credentials: 'include' });
                            const bodyText = await r.text().catch(() => null);
                            let j = null; try { j = bodyText ? JSON.parse(bodyText) : null; } catch(e){ j=null; }
                            if (!r.ok) {
                              const errMsg = j?.error || j?.detail || bodyText || 'Ошибка удаления';
                              setMenuOpenId(null);
                              setToast({ type: 'error', message: errMsg });
                              return;
                            }
                            setMenuOpenId(null);
                                // optimistic removal
                                const prev = posts.map(x => ({ ...x }));
                                setPosts(ps => ps.filter(x => x.id !== p.id));
                                try {
                                  const json = j || null;
                                  if (json) {
                                    setPosts(ps => ps.map(x => x.id === p.id ? { ...x, likesCount: json?.likesCount !== undefined ? String(json.likesCount) : x.likesCount, likedByCurrentUser: Boolean(json.likedByCurrentUser) } : x));
                                    try { /* local storage removed */ } catch (e) {}
                                    // re-sync a single post or list to ensure DB state is authoritative
                                    // Sync request processed - server returned updated counts. No page refresh needed.
                                  }
                                } catch (e) {
                                  setPosts(prev);
                                  throw e;
                                }
                          } catch (e: any) {
                            console.error('delete post error', e);
                            setToast({ type: 'error', message: e?.message || 'Ошибка удаления' });
                          }
                        }}>Удалить</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {p.title ? <div className="postTitle">{p.title}</div> : <div className="postTitle" style={{ color:'#9fb0bf', fontWeight:600 }}>Без заголовка</div>}
                {p.description ? <div className="postDescription">{p.description}</div> : <div className="postDescription" style={{ color:'#9fb0bf' }}>Без описания</div>}
              {(p.imageMime || p.imageSize) ? (
                <div className="mediaWrap">
                  <img
                    src={`/api/posts/${p.id}/image`}
                    className="postImage"
                    width={p.imageWidth || undefined}
                    height={p.imageHeight || undefined}
                    style={{ aspectRatio: p.imageWidth && p.imageHeight ? `${p.imageWidth}/${p.imageHeight}` : undefined, maxWidth: (p.imageHeight && p.imageWidth && p.imageHeight > p.imageWidth) ? 520 : undefined }}
                    onError={async (e) => {
                      const el = e.currentTarget as HTMLImageElement;
                      const url = el.src;
                      try {
                        const head = await fetch(url, { method: 'HEAD', credentials: 'include' });
                        console.warn('[CLIENT:/posts] Image HEAD failed or error', { url, status: head.status, headers: Object.fromEntries(head.headers.entries()) });
                      } catch (err) {
                        console.warn('[CLIENT:/posts] Image onError HEAD fetch failed', { url, err });
                      }
                      el.src = '/lost-image.png';
                    }}
                    alt={p.title || 'image'}
                  />
                </div>
              ) : (p.media && p.media.id && (
                <div className="mediaWrap">
                  <img
                    src={`/api/media/${p.media.id}`}
                    className="postImage"
                    width={p.media?.width || undefined}
                    height={p.media?.height || undefined}
                    style={{ aspectRatio: p.media?.width && p.media?.height ? `${p.media.width}/${p.media.height}` : undefined, maxWidth: (p.media?.height && p.media?.width && p.media.height > p.media.width) ? 520 : undefined }}
                    onError={async (e) => {
                      const el = e.currentTarget as HTMLImageElement;
                      const url = el.src;
                      try {
                        const head = await fetch(url, { method: 'HEAD', credentials: 'include' });
                        console.warn('[CLIENT:/posts] Media image HEAD failed or error', { url, status: head.status, headers: Object.fromEntries(head.headers.entries()) });
                      } catch (err) {
                        console.warn('[CLIENT:/posts] Media image onError HEAD fetch failed', { url, err });
                      }
                      el.src = '/lost-image.png';
                    }}
                    alt={p.title || 'image'}
                  />
                </div>
              ))}

              {/* Controls row below content: like button and timestamp */}
                <div className="controlsRow">
                <div>
                  <button type="button" aria-pressed={p.likedByCurrentUser} className={`likeBtn ${p.likedByCurrentUser ? 'liked' : ''}`} onClick={async()=>{
                    // If the session isn't authenticated, avoid optimistic update and prompt login
                    if (status === 'unauthenticated') { setToast({ type: 'error', message: 'Пожалуйста, войдите в систему' }); return; }
                    // Get the most up-to-date post state before toggling
                    const prevPosts = posts;
                    const currentPost = prevPosts.find(x => x.id === p.id) || p;
                    const currentlyLiked = !!currentPost.likedByCurrentUser;
                    const previous = prevPosts.map(x => ({ ...x }));
                    // Optimistic update: toggle state immediately based on current value
                    setPosts(ps => ps.map(x => {
                      if (x.id !== p.id) return x;
                      const prevCnt = Number(x.likesCount || '0');
                      const nextCnt = Math.max(0, prevCnt + (currentlyLiked ? -1 : 1));
                      return { ...x, likedByCurrentUser: !currentlyLiked, likesCount: String(nextCnt) };
                    }));
                    // Update localStorage fallback immediately so UI persists on reload even when server
                    // doesn't return likedByCurrentUser. We'll revert on error.
                    try {
                      console.debug('[CLIENT:/posts] like click', { postId: p.id, sessionId: session?.user?.id, status, cookie: (typeof document !== 'undefined') ? document.cookie : null });
                      // localStorage fallback removed; likes handled by DB
                    } catch (e) {}
                    try {
                      if (currentlyLiked) {
                        const r = await fetch(`/api/posts/${p.id}/like`, { method: 'DELETE', credentials: 'include' });
                        if (!r.ok) {
                          const er = await r.json().catch(() => null);
                          const errMsg = er?.error || `Ошибка: ${r.status}`;
                          if (r.status === 401) { setToast({ type: 'error', message: 'Пожалуйста, войдите в систему' }); try { window.location.href = '/auth/login'; } catch(e){} }
                          else setToast({ type: 'error', message: errMsg });
                          // revert optimistic update and stop
                          setPosts(previous);
                          return;
                        }
                        // update post with returned counts if provided
                        const json = await r.json().catch(() => null);
                        if (json) {
                          setPosts(ps => ps.map(x => x.id === p.id ? { ...x, likesCount: json?.likesCount !== undefined ? String(json.likesCount) : x.likesCount, likedByCurrentUser: Boolean(json.likedByCurrentUser) } : x));
                          // persist to local fallback for UI persistence (remove)
                          try { /* local storage removed */ } catch (e) {}
                        }
                      } else {
                        const r = await fetch(`/api/posts/${p.id}/like`, { method: 'POST', credentials: 'include' });
                        if (!r.ok) {
                          const er = await r.json().catch(() => null);
                          const errMsg = er?.error || `Ошибка: ${r.status}`;
                          if (r.status === 401) { setToast({ type: 'error', message: 'Пожалуйста, войдите в систему' }); try { window.location.href = '/auth/login'; } catch(e){} }
                          else setToast({ type: 'error', message: errMsg });
                          // revert optimistic update and stop
                          setPosts(previous);
                          return;
                        }
                        const json = await r.json().catch(() => null);
                        if (json) {
                          setPosts(ps => ps.map(x => x.id === p.id ? { ...x, likesCount: json?.likesCount !== undefined ? String(json.likesCount) : x.likesCount, likedByCurrentUser: Boolean(json.likedByCurrentUser) } : x));
                          try { /* local storage removed */ } catch (e) {}
                          // Do not re-fetch all posts; update UI from server response only.
                        }
                      }
                    } catch (e: any) {
                      console.error('like toggle error', e);
                      setToast({ type: 'error', message: e?.message || 'Ошибка' });
                      // revert optimistic update on error
                      setPosts(previous);
                    }
                  }}>
                    <span className="heart">{p.likedByCurrentUser ? '♥' : '♡'}</span>
                    <span className="likeCount">{p.likesCount || 0}</span>
                  </button>
                </div>

                {/* views: display on the right of the control row - stored as string in DB */}
                <div className="viewsWrap" title={formatViewsLabel(p.views)} aria-hidden="false" role="text">
                  <svg className="viewsIcon" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
                    <path fill="currentColor" d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
                    <path fill="currentColor" d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
                  </svg>
                  <span className="viewsCount">
                    {formatViewsNumeric(p.views)} <span className="viewsSuffix">просмотров</span>
                  </span>
                </div>
              </div>

              </div>
              );
            })}
          </div>
        </div>
      
      <style jsx>{`
        .createWrap{ width:100%; display:flex; justify-content:center; margin-top:8px }
        .createPostBackdrop{ 
          position: fixed; 
          inset: 0; 
          background: rgba(3, 6, 7, 0.7); 
          backdrop-filter: blur(4px);
          display: grid; 
          place-items: center; 
          z-index: 1200;
          animation: backdropFadeIn 200ms ease-out;
        }

        @keyframes backdropFadeIn {
          from { background-color: rgba(3, 6, 7, 0); backdrop-filter: blur(0px); }
          to { background-color: rgba(3, 6, 7, 0.7); backdrop-filter: blur(4px); }
        }

        .createPostModal{ 
          position: relative;
          width: 560px;
          max-width: calc(100% - 32px);
          background: linear-gradient(135deg, rgba(15, 18, 22, 0.95), rgba(11, 13, 14, 0.95));
          border: 1px solid rgba(34, 158, 217, 0.15);
          border-radius: 16px;
          padding: 28px;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 1px rgba(34, 158, 217, 0.3) inset;
          max-height: calc(100vh - 80px);
          z-index: 1250;
          animation: modalSlideIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes modalSlideIn {
          from { 
            opacity: 0;
            transform: scale(0.92) translateY(20px);
          }
          to { 
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .createPostHeader{
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .createPostTitle{
          font-weight: 700;
          font-size: 20px;
          color: #fff;
          background: linear-gradient(90deg, #fff, #e0f4ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .createPostCloseBtn{
          background: transparent;
          border: none;
          color: #9fb0bf;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 200ms ease;
          flex-shrink: 0;
        }

        .createPostCloseBtn:hover{
          background: rgba(34, 158, 217, 0.1);
          color: #229ed9;
        }

        .createPostForm{
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-height: calc(100vh - 260px);
          overflow-y: auto;
          padding-right: 8px;
        }

        .createPostForm::-webkit-scrollbar {
          width: 6px;
        }

        .createPostForm::-webkit-scrollbar-track {
          background: transparent;
        }

        .createPostForm::-webkit-scrollbar-thumb {
          background: rgba(34, 158, 217, 0.3);
          border-radius: 3px;
        }

        .createPostForm::-webkit-scrollbar-thumb:hover {
          background: rgba(34, 158, 217, 0.5);
        }

        .formGroup{
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .formLabel{
          font-size: 14px;
          font-weight: 600;
          color: #e0e8f0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          opacity: 0.9;
        }

        .createPostInput{
          width: 100%;
          padding: 12px 16px;
          background: rgba(11, 13, 14, 0.8);
          border: 1px solid rgba(34, 158, 217, 0.2);
          border-radius: 10px;
          color: #fff;
          font-size: 15px;
          font-family: inherit;
          outline: none;
          transition: all 200ms ease;
          box-sizing: border-box;
        }

        .createPostInput::placeholder{
          color: #6f7f8f;
        }

        .createPostInput:focus{
          background: rgba(11, 13, 14, 1);
          border-color: rgba(34, 158, 217, 0.5);
          box-shadow: 0 0 0 3px rgba(34, 158, 217, 0.1);
        }

        .createPostTextarea{
          width: 100%;
          padding: 12px 16px;
          background: rgba(11, 13, 14, 0.8);
          border: 1px solid rgba(34, 158, 217, 0.2);
          border-radius: 10px;
          color: #fff;
          font-size: 14px;
          font-family: inherit;
          outline: none;
          resize: none;
          transition: all 200ms ease;
          box-sizing: border-box;
          line-height: 1.5;
        }

        .createPostTextarea::placeholder{
          color: #6f7f8f;
        }

        .createPostTextarea:focus{
          background: rgba(11, 13, 14, 1);
          border-color: rgba(34, 158, 217, 0.5);
          box-shadow: 0 0 0 3px rgba(34, 158, 217, 0.1);
        }

        .charCount{
          font-size: 12px;
          color: #8b99a6;
          text-align: right;
          margin-top: 4px;
        }

        .fileUploadBox{
          cursor: pointer;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 28px 16px;
          border: 2px dashed rgba(34, 158, 217, 0.3);
          border-radius: 12px;
          background: rgba(34, 158, 217, 0.03);
          transition: all 200ms ease;
          color: #9fb0bf;
          box-sizing: border-box;
        }

        .fileUploadBox:hover{
          border-color: rgba(34, 158, 217, 0.6);
          background: rgba(34, 158, 217, 0.08);
          color: #229ed9;
        }

        /* Hide default file input button */
        .fileUploadBox input[type="file"]::file-selector-button {
          display: none !important;
        }

        .fileUploadBox input[type="file"] {
          position: absolute;
          opacity: 0;
          width: 0;
          height: 0;
        }

        .fileUploadContent{
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-align: center;
          width: 100%;
        }

        .fileUploadContent svg{
          color: inherit;
        }

        .uploadText{
          font-weight: 600;
          font-size: 16px;
          color: inherit;
        }

        .uploadHint{
          font-size: 13px;
          color: #6f7f8f;
        }

        .fileSelected{
          display: flex;
          align-items: center;
          gap: 12px;
          color: #23a86b;
        }

        .fileSelected svg{
          flex-shrink: 0;
        }

        .fileStatusText{
          font-size: 14px;
          color: #9fb0bf;
          margin-top: 12px;
          padding: 8px 0;
          text-align: center;
        }

        .fileStatusText.fileSelected{
          color: #23a86b;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .createPostFooter{
          display: flex;
          gap: 12px;
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .createPostCancelBtn{
          flex: 1;
          padding: 12px 20px;
          background: transparent;
          border: 1px solid rgba(34, 158, 217, 0.3);
          border-radius: 10px;
          color: #9fb0bf;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 200ms ease;
          outline: none;
        }

        .createPostCancelBtn:hover:not(:disabled){
          background: rgba(34, 158, 217, 0.1);
          border-color: rgba(34, 158, 217, 0.5);
          color: #229ed9;
        }

        .createPostCancelBtn:disabled{
          opacity: 0.5;
          cursor: not-allowed;
        }

        .createPostPublishBtn{
          flex: 1;
          padding: 12px 20px;
          background: linear-gradient(135deg, #229ed9, #1a7fb8);
          border: 1px solid rgba(34, 158, 217, 0.4);
          border-radius: 10px;
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 200ms ease;
          outline: none;
          box-shadow: 0 6px 20px rgba(34, 158, 217, 0.2);
        }

        .createPostPublishBtn:hover:not(:disabled){
          background: linear-gradient(135deg, #2ab0e8, #1f8ec8);
          box-shadow: 0 10px 30px rgba(34, 158, 217, 0.3);
          transform: translateY(-2px);
        }

        .createPostPublishBtn:disabled{
          opacity: 0.7;
          cursor: not-allowed;
        }

        .createPostPublishBtn.success{
          background: linear-gradient(135deg, #23a86b, #1f8f5f);
          box-shadow: 0 10px 30px rgba(34, 220, 120, 0.25);
          animation: publishSuccess 800ms cubic-bezier(0.2, 0.9, 0.2, 1);
        }

        .createPostPublishBtn .successCheck{
          animation: successCheckBounce 680ms cubic-bezier(0.2, 0.9, 0.2, 1);
        }

        .createPostOverlay{
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(3, 6, 7, 0.7);
          border-radius: 16px;
          z-index: 1280;
          backdrop-filter: blur(2px);
        }

        .publishingRow{
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: center;
          background: rgba(34, 158, 217, 0.15);
          padding: 16px 24px;
          border-radius: 12px;
          border: 1px solid rgba(34, 158, 217, 0.3);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }

        .publishingSpinner{
          color: #229ed9;
          width: 24px;
          height: 24px;
          animation: spin 1s linear infinite;
          flex-shrink: 0;
        }

        .publishingText{
          color: #fff;
          font-weight: 600;
          font-size: 15px;
        }

        .btnSpinner{
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes publishSuccess {
          0% { transform: scale(1); }
          40% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }

        @keyframes successCheckBounce {
          0% { transform: scale(0.5) rotate(-10deg); opacity: 0; }
          40% { transform: scale(1.12) rotate(8deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }

        @media (max-width: 640px){
          .createPostModal{
            width: calc(100% - 24px);
            padding: 20px;
          }

          .createPostHeader{
            margin-bottom: 16px;
            padding-bottom: 12px;
          }

          .createPostTitle{
            font-size: 18px;
          }

          .createPostForm{
            gap: 16px;
          }

          .fileUploadBox{
            padding: 24px 16px;
          }

          .createPostFooter{
            margin-top: 20px;
            padding-top: 16px;
          }
        }
        
        /* Post cards - Minimal rounded design */
        .postCard{ background:#0b0f12; padding:16px; border-radius:14px; margin-bottom:14px; position:relative; box-shadow: 0 6px 24px rgba(3,6,7,0.5); border: 1px solid rgba(255,255,255,0.02); transition: transform 140ms ease, box-shadow 140ms ease }
        .postCard:hover{ transform: translateY(-6px); box-shadow: 0 18px 48px rgba(0,0,0,0.6) }
        body.modal-open .postCard:hover{ transform:none; box-shadow: 0 6px 24px rgba(0,0,0,0.1) }
        .postHeader{ color:#fff; display:flex; align-items:center; gap:12px; justify-content:space-between }
        .authorWrap{ display:flex; align-items:center; gap:12px; cursor:pointer; flex: 1; }
        .postAvatar{ width:40px; height:40px; border-radius:10px; object-fit:cover; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02) }
        .postAvatarFallback{ width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:#222; color:#fff; font-weight:700 }
        .authorCol{ display:flex; flex-direction:column }
        .authorName{ font-weight:700; font-size:14px }
        .authorMeta{ color:#8b99a6; font-size:12px }
        .postDescription{ color:#d9e0e6; margin-top:12px; font-size:15px; line-height:1.45 }
        .mediaWrap{ margin-top:12px; border-radius:12px; overflow:hidden; display:flex; align-items:center; justify-content:center; background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.02)); padding:8px; max-width: 920px; margin-left:auto; margin-right:auto }
        .postImage{ width:100%; height:420px; display:block; object-fit:cover; object-position:center; border-radius:12px; transition: transform .28s ease, filter .28s ease; }
        .postImage:hover{ transform: scale(1.02); filter: brightness(0.96); }

        /* Make large images smaller on mobile/tablet for better vertical space use */
        @media (max-width: 980px) { .postImage{ height:360px } }
        @media (max-width: 760px) { .postImage{ height:220px; } }
        .controlsRow{ display:flex; align-items:center; gap:12px; margin-top:10px; justify-content:space-between }
        .likeBtn{ display:inline-flex; align-items:center; gap:10px; border-radius:999px; padding:8px 12px; cursor:pointer; border:1px solid rgba(255,255,255,0.02); background:transparent; color:#9fb0bf; font-weight:700 }
        .likeBtn .heart{ font-size:14px }
        .likeBtn.liked{ background: linear-gradient(90deg,#ff6b6b,#ff8a00); color:#fff; border:none; box-shadow: 0 6px 18px rgba(255,106,106,0.12); transform: translateY(-1px) }
        .likeBtn{ transition: all 160ms ease; }
        .likeBtn:hover{ transform: translateY(-2px); }
        .likeBtn.liked .heart{ animation: pop 220ms cubic-bezier(.2,.9,.3,1) }
        @keyframes pop { 0%{ transform: scale(0.8) } 50%{ transform: scale(1.1) } 100%{ transform: scale(1) } }
        .likeBtn.liked .heart{ color:#fff }
        .likeCount{ font-weight:700 }
        .timestamp{ color:#8b99a6; font-size:12px; margin-left:12px }
        .viewsWrap{ display:flex; align-items:center; gap:8px; color:#8b99a6; font-size:12px; }
          .viewsWrap{ display:flex; align-items:center; gap:8px; color:#6f777b; font-size:12px; opacity:0.86 }
          .viewsWrap .viewsIcon{ width:12px; height:12px; color:#6f777b; opacity:0.9 }
          .viewsWrap .viewsCount{ font-weight:500; color:#8b99a6; font-size:11px }
          .viewsWrap .viewsSuffix{ font-weight:400; color:#8b99a6; font-size:11px; margin-left:4px }
        .ownerMenuWrap{ position:relative; display:flex; align-items:center; margin-left:8px }
        .dotBtn{ z-index:20 }
        .dotMenu{ z-index:999 }
        .dotBtn{ background:transparent; color:#8b99a6; border:0; padding:6px 8px; border-radius:8px; font-weight:700 }
        .dotMenu{ position:absolute; right:0; top:36px; background:#0d1112; border: 1px solid rgba(255,255,255,0.01); border-radius:8px; padding:8px; box-shadow: 0 10px 30px rgba(0,0,0,0.6) }
        .dotMenuItem{ background:transparent; border:none; color:#f66; padding:6px 8px; cursor:pointer; font-weight:700 }
        /* Friend button style: small and slightly wide (reduced height) */
        .friendBtn{ display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:2px 8px; cursor:pointer; border:1px solid rgba(255,255,255,0.04); background:transparent; color:#9fb0bf; font-weight:700; font-size:12px; height:24px; line-height:20px }
        .friendBtn:hover{ transform: translateY(-2px); }
        .friendBtn.friend{ background: linear-gradient(90deg,#4ddc87,#1fb67f); color:#ffffff; border:none }
        .friendBtn.pending{ background: rgba(255,255,255,0.03); color:#cfe9f7; border: 1px solid rgba(255,255,255,0.03); height:24px }
        .userPlusIcon{ width:12px; height:12px; display:inline-block; margin-right:6px; color: #cfe9f7 }
        .friendLabel{ display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:2px 8px; font-size:12px; height:24px; background: rgba(255,255,255,0.03); color:#cfe9f7; border: 1px solid rgba(255,255,255,0.03) }
        /* Floating create button positioned near the header center-right */
        .floatingCreate{ position: fixed; top: 40px; left: calc(50% + 350px); z-index: 1100; width: 44px; height: 44px; border-radius: 22px; background: #777; color: #fff; border: none; font-size: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(0,0,0,0.4); cursor: pointer }
        @media (max-width: 980px){ .floatingCreate{ left: calc(50% + 220px); top: 40px } }
        /* Mobile: move floating create button to top-right (gray) instead of bottom-right */
        @media (max-width: 760px){ .floatingCreate{ left: auto; right: 16px; bottom: auto; top: 80px; width:40px; height:40px; font-size:22px } }
      `}</style>
      </div>

      {toast && (
        <ToastNotification type={toast.type === 'success' ? 'success' : 'error'} message={toast.message} duration={2500} onClose={()=>setToast(null)} />
      )}
    </div>
  );
}

function formatDate(d: any) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${day}.${month}.${year} в ${hours}:${minutes}`;
}

// Convert raw views value (string) into compact label for inline display, e.g. "1.2M" or "1.2K" for thousands
function formatViewsNumeric(v: any) {
  try {
    const s = String(v ?? '0').trim();
    // If it already contains letters or non-digit characters, return as-is
    if (/[^0-9.\-]/.test(s)) return s;
    const n = Number.parseFloat(s || '0');
    if (!Number.isFinite(n)) return s;
    const abs = Math.abs(n);
    if (abs >= 1000000) {
      const vStr = (n / 1000000).toFixed(abs >= 10000000 ? 0 : 1).replace(/\.0$/, '');
      return `${vStr}M`;
    }
    if (abs >= 1000) {
      const vStr = (n / 1000).toFixed(abs >= 100000 ? 0 : 1).replace(/\.0$/, '');
      return `${vStr}K`;
    }
    return String(n);
  } catch (e) {
    return String(v ?? '0');
  }
}

// Full label for title/aria description, e.g. "1 234 просмотров"
function formatViewsLabel(v: any) {
  try {
    const s = String(v ?? '0').trim();
    if (/[^0-9.\-]/.test(s)) return `${s} просмотров`;
    const n = Number.parseInt(s || '0', 10);
    if (!Number.isFinite(n)) return `${s} просмотров`;
    return `${n.toLocaleString('ru-RU')} просмотров`;
  } catch (e) {
    return `${String(v ?? '0')} просмотров`;
  }
}