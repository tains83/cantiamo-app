import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, serverTimestamp 
} from 'firebase/firestore';
import { 
  Music, Heart, ListMusic, Plus, Trash2, ChevronRight, Search, X, 
  ChevronLeft, Loader2, PlusCircle, MinusCircle, Edit3, Settings, 
  ChevronUp, ChevronDown, Youtube, FileText, RefreshCw, Check, Link
} from 'lucide-react';
import './index.css';

// --- CONFIGURAZIONE FIREBASE ---
const rawConfig = import.meta.env.VITE_FIREBASE_CONFIG;
const firebaseConfig = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'cantiamo-v3-final';

const ADMIN_PASSWORD = "SanRocco";
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

  // Stato Editor Canti
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newSongTitle, setNewSongTitle] = useState('');
  const [newSongCategory, setNewSongCategory] = useState('Ingresso');
  const [newYoutubeUrl, setNewYoutubeUrl] = useState('');
  const [newSheetMusicUrl, setNewSheetMusicUrl] = useState('');
  const editorRef = useRef(null);

  // Stato Playlist
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [editingPlaylistId, setEditingPlaylistId] = useState(null);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [selectedSongsInPlaylist, setSelectedSongsInPlaylist] = useState([]);
  const [selectedPlaylistView, setSelectedPlaylistView] = useState(null);

  // --- LOGICA NAVIGAZIONE ---
  const navigatePlaylist = (direction) => {
    if (!selectedPlaylistView || !selectedSong) return;
    const currentIndex = selectedPlaylistView.songIds.indexOf(selectedSong.id);
    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < selectedPlaylistView.songIds.length) {
      const nextSongId = selectedPlaylistView.songIds[nextIndex];
      const nextSong = songs.find(s => s.id === nextSongId);
      if (nextSong) setSelectedSong(nextSong);
    }
  };

  // Funzioni Spostamento
  const movePlaylist = async (index, direction) => {
    if (!isAdmin) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= playlists.length) return;
    const current = playlists[index];
    const target = playlists[targetIndex];
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'playlists', current.id), { order: target.order || 0 });
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'playlists', target.id), { order: current.order || 0 });
  };

  const moveSongInPlaylist = async (pl, songIndex, direction) => {
    if (!isAdmin) return;
    const newSongIds = [...pl.songIds];
    const targetIndex = songIndex + direction;
    if (targetIndex < 0 || targetIndex >= newSongIds.length) return;
    [newSongIds[songIndex], newSongIds[targetIndex]] = [newSongIds[targetIndex], newSongIds[songIndex]];
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'playlists', pl.id), { songIds: newSongIds });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) { setUser(u); setAuthStatus('success'); }
      else { signInAnonymously(auth).catch(() => setAuthStatus('error')); }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubSongs = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'songs'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSongs(data.sort((a, b) => (a.title || "").localeCompare(b.title || "")));
    });
    const unsubPlaylists = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'playlists'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPlaylists(data.sort((a, b) => (a.order || 0) - (b.order || 0)));
    });
    return () => { unsubSongs(); unsubPlaylists(); };
  }, [user]);

  const toggleFav = (id) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const openSongEditor = (song = null) => {
    if (song) {
      setEditingId(song.id);
      setNewSongTitle(song.title || '');
      setNewSongCategory(song.category || 'Ingresso');
      setNewYoutubeUrl(song.youtubeUrl || '');
      setNewSheetMusicUrl(song.sheetMusicUrl || '');
      setIsEditModalOpen(true);
      setTimeout(() => { if(editorRef.current) editorRef.current.innerHTML = song.text || song.lyrics || ""}, 100);
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
    if (!isAdmin || !newSongTitle.trim()) return;
    const songData = { 
      title: newSongTitle, category: newSongCategory, 
      text: editorRef.current?.innerHTML || "", 
      youtubeUrl: newYoutubeUrl, sheetMusicUrl: newSheetMusicUrl,
      updatedAt: serverTimestamp() 
    };
    try {
      if (editingId) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'songs', editingId), songData);
      else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'songs'), { ...songData, createdAt: serverTimestamp() });
      setIsEditModalOpen(false);
    } catch (err) { console.error(err); }
  };

  const handleSavePlaylist = async () => {
    if (!isAdmin || !newPlaylistTitle.trim()) return;
    const plData = { 
      title: newPlaylistTitle, songIds: selectedSongsInPlaylist, 
      updatedAt: serverTimestamp(),
      order: editingPlaylistId ? (playlists.find(p => p.id === editingPlaylistId)?.order || 0) : playlists.length
    };
    try {
      if (editingPlaylistId) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'playlists', editingPlaylistId), plData);
      else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'playlists'), { ...plData, createdAt: serverTimestamp(), hidden: false });
      setIsPlaylistModalOpen(false);
    } catch (err) { console.error(err); }
  };

  const filteredSongs = songs.filter(s => 
    (s.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.category || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (authStatus === 'loading') return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>;

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-slate-50 overflow-hidden relative shadow-2xl font-sans">
      <header className={`p-6 pb-8 text-white shadow-lg ${isAdmin ? 'bg-emerald-600' : 'bg-indigo-700'}`}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <img src={LOGO_SRC} alt="Logo" className="w-10 h-10 rounded-full border-2 border-white/20" />
            <h1 className="text-xl font-black italic uppercase">Cantiamo</h1>
          </div>
          <button onClick={() => isAdmin ? setIsAdmin(false) : setShowLoginModal(true)} className="px-4 py-1.5 bg-white/20 rounded-full text-[10px] font-black uppercase">
            {isAdmin ? 'Esci Admin' : 'Admin'}
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
          <input type="text" placeholder="Cerca un canto..." className="w-full bg-white/10 rounded-2xl py-3.5 pl-12 text-white outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 pb-28">
        {activeTab === 'home' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center px-2">
              <h2 className="text-[10px] font-black uppercase text-slate-400">Archivio</h2>
              {isAdmin && <button onClick={() => openSongEditor()} className="text-emerald-600 text-[10px] font-black uppercase flex items-center gap-1"><PlusCircle size={14}/> Nuovo</button>}
            </div>
            {filteredSongs.map(song => (
              <div key={song.id} onClick={() => setSelectedSong(song)} className="bg-white p-4 rounded-2xl flex justify-between items-center border border-slate-100 shadow-sm cursor-pointer active:scale-95 transition-transform">
                <div className="flex-1">
                  <h3 className="font-bold text-slate-800">{song.title}</h3>
                  <span className="text-[9px] font-black uppercase text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md">{song.category}</span>
                </div>
                <div className="flex gap-2 text-slate-300">
                  {song.youtubeUrl && <Youtube size={16} />}
                  {song.sheetMusicUrl && <FileText size={16} />}
                  <ChevronRight size={20} />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'playlists' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-2">
              <h2 className="text-[10px] font-black uppercase text-slate-400">Celebrazioni</h2>
              {isAdmin && <button onClick={() => { setEditingPlaylistId(null); setNewPlaylistTitle(''); setSelectedSongsInPlaylist([]); setIsPlaylistModalOpen(true); }} className="text-indigo-600 text-[10px] font-black uppercase flex items-center gap-1"><PlusCircle size={14}/> Nuova</button>}
            </div>
            {playlists.filter(pl => isAdmin || !pl.hidden).map((pl, idx) => (
              <div key={pl.id} className={`bg-white p-4 rounded-3xl border flex items-center gap-3 shadow-sm ${pl.hidden ? 'opacity-50 grayscale border-dashed border-slate-300' : 'border-slate-100'}`}>
                {isAdmin && (
                  <div className="flex flex-col gap-1">
                    <button onClick={() => movePlaylist(idx, -1)} className="text-slate-300"><ChevronUp size={16}/></button>
                    <button onClick={() => movePlaylist(idx, 1)} className="text-slate-300"><ChevronDown size={16}/></button>
                  </div>
                )}
                <div className="flex-1 cursor-pointer" onClick={() => setSelectedPlaylistView(pl)}>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">{pl.title} {pl.hidden && <Settings size={12} />}</h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">{pl.songIds?.length || 0} canti</p>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'playlists', pl.id), { hidden: !pl.hidden })} className="text-slate-400">{pl.hidden ? <RefreshCw size={18}/> : <X size={18}/>}</button>
                    <button onClick={() => { setEditingPlaylistId(pl.id); setNewPlaylistTitle(pl.title); setSelectedSongsInPlaylist(pl.songIds || []); setIsPlaylistModalOpen(true); }} className="text-emerald-600"><Edit3 size={18}/></button>
                  </div>
                )}
                <ChevronRight className="text-slate-300" />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'favorites' && (
          <div className="space-y-3">
             <h2 className="text-[10px] font-black uppercase text-slate-400 px-2">Preferiti</h2>
             {songs.filter(s => favorites.includes(s.id)).map(song => (
              <div key={song.id} onClick={() => setSelectedSong(song)} className="bg-white p-4 rounded-2xl flex justify-between items-center border border-rose-100 shadow-sm">
                <h3 className="font-bold text-slate-800">{song.title}</h3>
                <Heart size={18} fill="#f43f5e" className="text-rose-500" />
              </div>
            ))}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 w-full max-w-lg bg-white/90 backdrop-blur-xl border-t flex justify-around p-4 pb-8 z-50">
        {[ { id: 'home', icon: Music, label: 'Canti' }, { id: 'playlists', icon: ListMusic, label: 'Liste' }, { id: 'favorites', icon: Heart, label: 'Preferiti' } ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex flex-col items-center gap-1.5 ${activeTab === t.id ? 'text-indigo-600' : 'text-slate-400'}`}>
            <t.icon size={22} />
            <span className="text-[9px] font-black uppercase">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* VISUALIZZATORE CANTO */}
      {selectedSong && (
        <div className="fixed inset-0 z-[300] bg-white flex flex-col animate-in">
          <div className="p-4 border-b flex justify-between items-center bg-white sticky top-0">
            <button onClick={() => setSelectedSong(null)} className="p-2 text-slate-800"><ChevronLeft size={32}/></button>
            <div className="text-center flex-1 truncate">
              <h2 className="font-black uppercase text-xs truncate">{selectedSong.title}</h2>
              <span className="text-[9px] text-indigo-500 font-black uppercase">{selectedSong.category}</span>
            </div>
            <div className="flex gap-1">
               {isAdmin && <button onClick={() => {if(window.confirm("Eliminare?")) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'songs', selectedSong.id))}} className="p-2 text-rose-600"><Trash2 size={20}/></button>}
               {isAdmin && <button onClick={() => openSongEditor(selectedSong)} className="p-2 text-emerald-600"><Edit3 size={20}/></button>}
            </div>
          </div>
          
          <div className="flex-1 p-8 text-center overflow-y-auto bg-white">
            <div className="max-w-md mx-auto">
              <div className="flex justify-center gap-6 mb-8">
                {selectedSong.youtubeUrl && <a href={selectedSong.youtubeUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 text-rose-600"><Youtube size={28}/><span className="text-[8px] font-black uppercase">Video</span></a>}
                {selectedSong.sheetMusicUrl && <a href={selectedSong.sheetMusicUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 text-indigo-600"><FileText size={28}/><span className="text-[8px] font-black uppercase">Spartito</span></a>}
              </div>
              <div className="flex justify-center gap-4 py-2 border-b border-slate-50 mb-6">
                <button onClick={() => setViewerFontSize(f => Math.max(12, f-2))} className="p-2 text-slate-400 font-black text-xl">A-</button>
                <button onClick={() => setViewerFontSize(f => Math.min(40, f+2))} className="p-2 text-slate-400 font-black text-xl">A+</button>
              </div>
              <div className="font-serif leading-relaxed whitespace-pre-wrap pb-20" style={{ fontSize: `${viewerFontSize}px` }} dangerouslySetInnerHTML={{ __html: selectedSong.text || selectedSong.lyrics || "" }} />
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t flex gap-3">
             <button onClick={() => toggleFav(selectedSong.id)} className={`flex-1 p-4 rounded-2xl flex items-center justify-center gap-2 font-black uppercase text-[10px] ${favorites.includes(selectedSong.id) ? 'bg-rose-100 text-rose-600' : 'bg-white text-slate-400'}`}>
               <Heart size={18} fill={favorites.includes(selectedSong.id) ? "currentColor" : "none"} /> 
               {favorites.includes(selectedSong.id) ? "Rimuovi" : "Salva"}
             </button>
             {selectedPlaylistView && (
               <div className="flex gap-2">
                  <button onClick={() => navigatePlaylist(-1)} className="p-4 bg-white rounded-2xl text-indigo-600"><ChevronLeft/></button>
                  <button onClick={() => navigatePlaylist(1)} className="p-4 bg-white rounded-2xl text-indigo-600"><ChevronRight/></button>
               </div>
             )}
          </div>
        </div>
      )}

      {/* MODALE EDITOR PLAYLIST */}
      {isPlaylistModalOpen && (
        <div className="fixed inset-0 z-[400] bg-white flex flex-col p-6 animate-in">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setIsPlaylistModalOpen(false)}><X/></button>
            <h3 className="font-black uppercase text-xs">Gestione Celebrazione
