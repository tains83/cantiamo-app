import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  deleteDoc, 
  doc,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { 
  Music, Heart, ListMusic, Plus, Trash2, ChevronRight, Search, X, 
  Bold, Italic, AlignCenter, ChevronLeft, 
  Loader2, PlusCircle, MinusCircle, Edit3, Settings, Check, Save, AlertCircle,
  ChevronUp, ChevronDown, Move, Youtube, FileText, ExternalLink, RefreshCw
} from 'lucide-react'
import './index.css';

// --- CONFIGURAZIONE FIREBASE ---
/ Controlla se è già un oggetto o se deve essere convertito da stringa
const firebaseConfig = typeof __firebase_config === 'string' 
    ? JSON.parse(__firebase_config) 
    : __firebase_config;

// Ora puoi inizializzare Firebase in sicurezza
initializeApp(firebaseConfig);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'cantiamo-v3-final';

const ADMIN_PASSWORD = "SanRocco";
const CATEGORIES = ["Ingresso", "Gloria", "Salmo", "Alleluia", "Offertorio", "Santo", "Comunione", "Finale", "Mariano", "Spirito Santo", "Altro"];

// Percorso aggiornato dell'icona richiesta
const LOGO_SRC = "/icon.jpeg";

export default function App() {
  const [user, setUser] = useState(null);
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('cs_favs_v4');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [selectedSong, setSelectedSong] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewerFontSize, setViewerFontSize] = useState(20);
  const [authStatus, setAuthStatus] = useState('loading');

  // Stato Editor
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newSongTitle, setNewSongTitle] = useState('');
  const [newSongCategory, setNewSongCategory] = useState('Ingresso');
  const [newYoutubeUrl, setNewYoutubeUrl] = useState('');
  const [newSheetMusicUrl, setNewSheetMusicUrl] = useState('');
  const editorRef = useRef(null);

  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [editingPlaylistId, setEditingPlaylistId] = useState(null);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [selectedSongsInPlaylist, setSelectedSongsInPlaylist] = useState([]);
  const [selectedPlaylistView, setSelectedPlaylistView] = useState(null);

  const signInWithRetry = async (retries = 5, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
        return;
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      setAuthStatus('loading');
      try {
        await signInWithRetry();
      } catch (err) {
        console.error("Errore di autenticazione finale:", err);
        setAuthStatus('error');
      }
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setAuthStatus('success');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const songsQuery = collection(db, 'artifacts', appId, 'public', 'data', 'songs');
    const unsubSongs = onSnapshot(songsQuery, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSongs(data.sort((a, b) => (a.title || "").localeCompare(b.title || "")));
    }, (err) => {
      console.error("Errore permessi canzoni:", err);
    });

    const playlistsQuery = collection(db, 'artifacts', appId, 'public', 'data', 'playlists');
    const unsubPlaylists = onSnapshot(playlistsQuery, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPlaylists(data.sort((a, b) => (a.order || 0) - (b.order || 0)));
    }, (err) => {
      console.error("Errore permessi playlist:", err);
    });

    return () => { unsubSongs(); unsubPlaylists(); };
  }, [user]);

  useEffect(() => {
    localStorage.setItem('cs_favs_v4', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFav = (id) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const execCommand = (cmd) => {
    document.execCommand(cmd, false, null);
    editorRef.current?.focus();
  };

  const openSongEditor = (song = null) => {
    if (song) {
      setEditingId(song.id);
      setNewSongTitle(song.title);
      setNewSongCategory(song.category);
      setNewYoutubeUrl(song.youtubeUrl || '');
      setNewSheetMusicUrl(song.sheetMusicUrl || '');
      setIsEditModalOpen(true);
      setTimeout(() => { if(editorRef.current) editorRef.current.innerHTML = song.text || ""}, 100);
    } else {
      setEditingId(null);
      setNewSongTitle('');
      setNewSongCategory('Ingresso');
      setNewYoutubeUrl('');
      setNewSheetMusicUrl('');
      setIsEditModalOpen(true);
      setTimeout(() => { if(editorRef.current) editorRef.current.innerHTML = ""}, 100);
    }
  };

  const handleSaveSong = async () => {
    if (!isAdmin || !newSongTitle.trim() || !user) return;
    const songData = { 
      title: newSongTitle, 
      category: newSongCategory, 
      text: editorRef.current?.innerHTML || "", 
      youtubeUrl: newYoutubeUrl,
      sheetMusicUrl: newSheetMusicUrl,
      updatedAt: serverTimestamp() 
    };
    try {
      if (editingId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'songs', editingId), songData);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'songs'), { ...songData, createdAt: serverTimestamp() });
      }
      setIsEditModalOpen(false);
    } catch (err) { console.error(err); }
  };

  const handleSavePlaylist = async () => {
    if (!isAdmin || !newPlaylistTitle.trim() || !user) return;
    const plData = { 
      title: newPlaylistTitle, 
      songIds: selectedSongsInPlaylist, 
      updatedAt: serverTimestamp(),
      order: editingPlaylistId ? (playlists.find(p => p.id === editingPlaylistId)?.order || 0) : playlists.length
    };
    try {
      if (editingPlaylistId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'playlists', editingPlaylistId), plData);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'playlists'), { ...plData, createdAt: serverTimestamp() });
      }
      setIsPlaylistModalOpen(false);
    } catch (err) { console.error(err); }
  };

  const movePlaylist = async (index, direction) => {
    if (!user) return;
    const newPlaylists = [...playlists];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newPlaylists.length) return;

    const currentPl = newPlaylists[index];
    const targetPl = newPlaylists[targetIndex];

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'playlists', currentPl.id), { order: targetIndex });
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'playlists', targetPl.id), { order: index });
    } catch (e) { console.error(e); }
  };

  const filteredSongs = songs.filter(s => 
    (s.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.category || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (authStatus === 'loading') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-white text-center">
        <div className="w-32 h-32 rounded-full overflow-hidden mb-6 shadow-2xl border-4 border-indigo-50 animate-pulse bg-slate-50 flex items-center justify-center">
           <img src={LOGO_SRC} alt="Logo" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
        </div>
        <h1 className="text-xl font-black italic text-indigo-700 tracking-tighter uppercase">Cantiamo al Signore</h1>
        <Loader2 className="animate-spin mt-4 text-indigo-300" />
      </div>
    );
  }

  if (authStatus === 'error') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-white p-8 text-center">
        <AlertCircle size={48} className="text-rose-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Errore di Connessione</h2>
        <p className="text-slate-500 mb-6 max-w-xs text-sm">Non è stato possibile connettersi ai servizi. Verifica la tua connessione internet.</p>
        <button 
          onClick={() => window.location.reload()} 
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-full font-bold uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all"
        >
          <RefreshCw size={16} /> Riprova
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-slate-50 overflow-hidden relative shadow-2xl font-sans text-slate-900">
      
      <header className={`p-6 pb-8 text-white transition-all duration-500 shadow-lg ${isAdmin ? 'bg-emerald-600' : 'bg-indigo-700'}`}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/20 shadow-md bg-white/10 flex items-center justify-center">
              <img src={LOGO_SRC} alt="Icon" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
            </div>
            <h1 className="text-xl font-black italic tracking-tighter uppercase">Cantiamo al Signore</h1>
          </div>
          <button onClick={() => isAdmin ? setIsAdmin(false) : setShowLoginModal(true)} className="px-4 py-1.5 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-sm">
            {isAdmin ? 'Esci Admin' : 'Admin'}
          </button>
        </div>
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
          <input 
            type="text" 
            placeholder="Cerca un canto o categoria..." 
            className="w-full bg-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-white/40 outline-none border border-white/10 focus:bg-white/20 transition-all shadow-inner"
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 pb-28">
        {activeTab === 'home' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center px-2 mb-2">
               <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Archivio Canti</h2>
               {isAdmin && (
                 <button onClick={() => openSongEditor()} className="text-emerald-600 text-[10px] font-black uppercase flex items-center gap-1.5">
                   <PlusCircle size={14}/> Nuovo Canto
                 </button>
               )}
            </div>
            {filteredSongs.map(song => (
              <div key={song.id} onClick={() => setSelectedSong(song)} className="bg-white p-4 rounded-2xl flex justify-between items-center border border-slate-100 shadow-sm active:scale-[0.98] transition-all cursor-pointer">
                <div className="flex-1">
                  <h3 className="font-bold text-slate-800 leading-tight">{song.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] font-black uppercase text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md">{song.category}</span>
                    {song.youtubeUrl && <Youtube size={12} className="text-rose-500" />}
                    {song.sheetMusicUrl && <Music size={12} className="text-indigo-400" />}
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  {isAdmin && (
                    <button onClick={() => openSongEditor(song)} className="p-2 text-emerald-600 bg-emerald-50 rounded-full">
                      <Edit3 size={16}/>
                    </button>
                  )}
                  <ChevronRight className="text-slate-300" size={20} />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'playlists' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-2">
               <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Liste Celebrazioni</h2>
               {isAdmin && (
                 <button onClick={() => { setEditingPlaylistId(null); setNewPlaylistTitle(''); setSelectedSongsInPlaylist([]); setIsPlaylistModalOpen(true); }} className="text-indigo-600 text-[10px] font-black uppercase flex items-center gap-1.5">
                   <PlusCircle size={14}/> Nuova Lista
                 </button>
               )}
            </div>
            {playlists.map((pl, idx) => (
              <div key={pl.id} onClick={() => setSelectedPlaylistView(pl)} className="bg-white p-5 rounded-3xl flex justify-between items-center border border-slate-100 shadow-sm active:scale-[0.98] transition-all cursor-pointer group">
                <div className="flex items-center gap-4">
                  {isAdmin && (
                    <div className="flex flex-col items-center gap-1 pr-2 border-r border-slate-100 mr-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => movePlaylist(idx, -1)} className="text-slate-300 hover:text-indigo-500"><ChevronUp size={18}/></button>
                      <button onClick={() => movePlaylist(idx, 1)} className="text-slate-300 hover:text-indigo-500"><ChevronDown size={18}/></button>
                    </div>
                  )}
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0">
                    <ListMusic size={24}/>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 leading-tight">{pl.title}</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-black">{pl.songIds?.length || 0} canti</p>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  {isAdmin && (
                    <>
                      <button onClick={() => { 
                        setEditingPlaylistId(pl.id); 
                        setNewPlaylistTitle(pl.title); 
                        setSelectedSongsInPlaylist(pl.songIds || []); 
                        setIsPlaylistModalOpen(true); 
                      }} className="p-2 text-indigo-400 bg-indigo-50 rounded-full">
                        <Edit3 size={16}/>
                      </button>
                      <button onClick={() => { if(window.confirm("Eliminare la lista?")) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'playlists', pl.id)); }} className="p-2 text-rose-300">
                        <Trash2 size={16}/>
                      </button>
                    </>
                  )}
                  <ChevronRight className="text-slate-300 ml-1" />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'favorites' && (
          <div className="space-y-3">
             <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 mb-4">I Miei Canti Preferiti</h2>
             {songs.filter(s => favorites.includes(s.id)).map(song => (
              <div key={song.id} onClick={() => setSelectedSong(song)} className="bg-white p-4 rounded-2xl flex justify-between items-center border border-rose-100 shadow-sm active:scale-95 transition-all">
                <h3 className="font-bold text-slate-800">{song.title}</h3>
                <Heart size={18} fill="#f43f5e" className="text-rose-500" />
              </div>
            ))}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 w-full max-w-lg bg-white/90 backdrop-blur-xl border-t flex justify-around p-4 pb-8 z-50">
        {[
          { id: 'home', icon: Music, label: 'Canti' },
          { id: 'playlists', icon: ListMusic, label: 'Liste' },
          { id: 'favorites', icon: Heart, label: 'Preferiti' }
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === t.id ? 'text-indigo-600 scale-110' : 'text-slate-400'}`}>
            <t.icon size={22} />
            <span className="text-[9px] font-black uppercase tracking-widest">{t.label}</span>
          </button>
        ))}
      </nav>

      {showLoginModal && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-[40px] w-full max-w-xs text-center shadow-2xl animate-in zoom-in duration-200">
            <Settings size={32} className="mx-auto mb-4 text-indigo-600" />
            <h3 className="font-black uppercase text-xs mb-8 tracking-[0.2em] text-slate-400">Accesso Riservato</h3>
            <input id="adminPass" type="password" placeholder="••••" className="w-full p-5 bg-slate-100 rounded-2xl mb-4 text-center font-black text-2xl tracking-[0.3em] outline-none border-2 border-transparent focus:border-indigo-500 transition-all shadow-inner" autoFocus onKeyDown={e => { if(e.key === 'Enter') { const val = e.target.value; if(val === ADMIN_PASSWORD) { setIsAdmin(true); setShowLoginModal(false); } else window.alert("Codice Errato"); }}} />
            <button onClick={() => { const val = document.getElementById('adminPass').value; if (val === ADMIN_PASSWORD) { setIsAdmin(true); setShowLoginModal(false); } else window.alert("Codice Errato"); }} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">Accedi</button>
            <button onClick={() => setShowLoginModal(false)} className="mt-6 text-[10px] font-black text-slate-300 uppercase hover:text-slate-500">Chiudi</button>
          </div>
        </div>
      )}

      {selectedSong && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-right duration-300">
          <div className="p-4 border-b flex justify-between items-center bg-white sticky top-0 z-10 shadow-sm">
            <button onClick={() => setSelectedSong(null)} className="p-2 text-slate-800"><ChevronLeft size={32}/></button>
            <div className="text-center flex-1 overflow-hidden px-2">
              <h2 className="font-black uppercase text-xs tracking-tighter truncate">{selectedSong.title}</h2>
              <span className="text-[9px] text-indigo-500 font-black uppercase">{selectedSong.category}</span>
            </div>
            <div className="flex items-center gap-1">
               {selectedSong.youtubeUrl && (
                 <a href={selectedSong.youtubeUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-rose-600 bg-rose-50 rounded-full">
                    <Youtube size={20}/>
                 </a>
               )}
               {selectedSong.sheetMusicUrl && (
                 <a href={selectedSong.sheetMusicUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-indigo-600 bg-indigo-50 rounded-full">
                    <FileText size={20}/>
                 </a>
               )}
               {isAdmin && <button onClick={() => { setSelectedSong(null); openSongEditor(selectedSong); }} className="p-2 text-emerald-600 ml-2"><Edit3 size={20}/></button>}
            </div>
          </div>
          
          <div className="flex justify-center gap-4 py-3 bg-slate-50 border-b">
              <button onClick={() => setViewerFontSize(f => Math.max(12, f-2))} className="p-2 text-slate-400 hover:text-indigo-600 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                <MinusCircle size={20}/> Rimpicciolisci
              </button>
              <button onClick={() => setViewerFontSize(f => Math.min(48, f+2))} className="p-2 text-slate-400 hover:text-indigo-600 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                <PlusCircle size={20}/> Ingrandisci
              </button>
          </div>

          <div className="flex-1 p-8 text-center overflow-y-auto bg-white">
            <div className="font-serif leading-relaxed max-w-md mx-auto whitespace-pre-wrap pb-24" style={{ fontSize: `${viewerFontSize}px` }} dangerouslySetInnerHTML={{ __html: selectedSong.text }} />
            <div className="max-w-xs mx-auto pb-10">
              <button onClick={() => toggleFav(selectedSong.id)} className={`w-full p-5 rounded-3xl flex items-center justify-center gap-3 font-black uppercase text-[10px] transition-all shadow-sm ${favorites.includes(selectedSong.id) ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                 <Heart size={18} fill={favorites.includes(selectedSong.id) ? "#f43f5e" : "none"} />
                 {favorites.includes(selectedSong.id) ? "In Preferiti" : "Aggiungi ai Preferiti"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col p-6 animate-in slide-in-from-bottom duration-300">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setIsEditModalOpen(false)} className="p-2"><X/></button>
            <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">Editor Canti</span>
            <button onClick={handleSaveSong} className="bg-emerald-600 text-white px-6 py-2.5 rounded-full font-black text-xs uppercase shadow-lg flex items-center gap-2">
              <Save size={16}/> Salva Canto
            </button>
          </div>
          <div className="space-y-3 overflow-y-auto pb-6">
            <input value={newSongTitle} onChange={e => setNewSongTitle(e.target.value)} placeholder="Titolo del canto..." className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold outline-none" />
            <select value={newSongCategory} onChange={e => setNewSongCategory(e.target.value)} className="w-full p-4 bg-indigo-50 text-indigo-700 rounded-2xl border-none font-black uppercase text-xs outline-none">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input value={newYoutubeUrl} onChange={e => setNewYoutubeUrl(e.target.value)} placeholder="YouTube link..." className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs outline-none" />
              <input value={newSheetMusicUrl} onChange={e => setNewSheetMusicUrl(e.target.value)} placeholder="Spartito link..." className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs outline-none" />
            </div>
            <div className="mt-4 flex gap-2 p-1 bg-slate-100 rounded-xl">
              <button onMouseDown={e => {e.preventDefault(); execCommand('bold')}} className="flex-1 py-3 bg-white rounded-lg shadow-sm font-bold flex justify-center"><Bold size={18}/></button>
              <button onMouseDown={e => {e.preventDefault(); execCommand('italic')}} className="flex-1 py-3 bg-white rounded-lg shadow-sm italic flex justify-center"><Italic size={18}/></button>
              <button onMouseDown={e => {e.preventDefault(); execCommand('justifyCenter')}} className="flex-1 py-3 bg-white rounded-lg shadow-sm flex justify-center"><AlignCenter size={18}/></button>
            </div>
            <div ref={editorRef} contentEditable className="min-h-[300px] bg-white border border-slate-100 p-6 rounded-2xl outline-none font-serif text-center shadow-inner text-xl overflow-y-auto" />
          </div>
        </div>
      )}

      {isPlaylistModalOpen && (
        <div className="fixed inset-0 z-[300] bg-white flex flex-col p-6 overflow-hidden animate-in slide-in-from-bottom">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setIsPlaylistModalOpen(false)}><X/></button>
            <h3 className="font-black uppercase text-xs tracking-widest">Gestione Celebrazione</h3>
            <button onClick={handleSavePlaylist} className="bg-indigo-600 text-white px-6 py-2 rounded-full font-black text-xs uppercase shadow-lg">Salva</button>
          </div>
          <input value={newPlaylistTitle} onChange={e => setNewPlaylistTitle(e.target.value)} placeholder="Nome Lista..." className="w-full p-5 bg-slate-50 rounded-3xl mb-4 border border-slate-100 font-bold outline-none" />
          
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="bg-indigo-50/50 p-4 rounded-3xl border border-indigo-100 mb-4 overflow-y-auto max-h-[30%]">
                {selectedSongsInPlaylist.map((sid, idx) => (
                  <div key={sid} className="flex items-center justify-between bg-white p-2 rounded-xl mb-1 text-xs">
                    <span className="font-bold truncate">{songs.find(s => s.id === sid)?.title}</span>
                    <button onClick={() => setSelectedSongsInPlaylist(p => p.filter(x => x !== sid))} className="text-rose-500"><X size={14}/></button>
                  </div>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {songs.map(s => (
                <div key={s.id} onClick={() => !selectedSongsInPlaylist.includes(s.id) && setSelectedSongsInPlaylist(p => [...p, s.id])} className={`p-4 rounded-2xl border flex justify-between items-center ${selectedSongsInPlaylist.includes(s.id) ? 'opacity-30' : 'bg-white'}`}>
                  <p className="font-bold text-sm truncate">{s.title}</p>
                  {!selectedSongsInPlaylist.includes(s.id) && <PlusCircle size={20} className="text-indigo-400" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedPlaylistView && (
        <div className="fixed inset-0 z-[250] bg-white flex flex-col animate-in slide-in-from-right duration-300">
          <div className="p-6 bg-indigo-700 text-white flex items-center gap-4">
            <button onClick={() => setSelectedPlaylistView(null)}><ChevronLeft size={32}/></button>
            <h2 className="text-xl font-black italic truncate">{selectedPlaylistView.title}</h2>
          </div>
          <div className="flex-1 p-6 space-y-3 overflow-y-auto pb-24">
            {selectedPlaylistView.songIds?.map((sid, idx) => {
              const s = songs.find(x => x.id === sid);
              if (!s) return null;
              return (
                <div key={sid} onClick={() => setSelectedSong(s)} className="p-5 bg-white rounded-3xl border border-slate-100 shadow-sm flex justify-between items-center">
                  <span className="font-black text-slate-800 uppercase text-xs">{idx + 1}. {s.title}</span>
                  <ChevronRight size={16} className="text-slate-300"/>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,700;1,400&display=swap');
        .font-serif { font-family: 'Lora', serif; }
        [contenteditable]:empty:before { content: "Scrivi il testo del canto..."; color: #cbd5e1; }
        .animate-in { animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .zoom-in { animation: zoom 0.2s ease-out forwards; }
        @keyframes zoom { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
