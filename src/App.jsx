import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  addDoc, 
  updateDoc,
  serverTimestamp,
  enableIndexedDbPersistence,
  terminate
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  CheckCircle2, 
  Truck,
  ShieldCheck,
  MessageSquare,
  Loader2,
  Store,
  History,
  Clock,
  ChevronRight,
  PackageCheck,
  XCircle,
  Phone,
  RefreshCcw,
  Zap,
  Search,
  AlertCircle,
  BellRing,
  WifiOff,
  MapPin,
  AlertTriangle,
  CheckIcon,
  DollarSign,
  Package,
  User
} from 'lucide-react';

// --- CONFIGURATION FIREBASE ---
const firebaseConfig = {
  "apiKey": "AIzaSyCmGabYVQsicDjhCP4Qx_w41B0ToAZxELM",
  "authDomain": "bringo-flash-control.firebaseapp.com",
  "projectId": "bringo-flash-control",
  "storageBucket": "bringo-flash-control.firebasestorage.app",
  "messagingSenderId": "1007988352826",
  "appId": "1:1007988352826:web:1b1ce84d1554b08756d203",
  "measurementId": "G-1PEVCF443T"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'flash-control-v5';

// --- MOTIFS PAR SOURCE ---
const reasonsBySource = {
  "Livreur": [
    "Client injoignable",
    "Paiement en ligne à effectuer",
    "Adresse incorrecte / Hors zone",
    "Article manquant",
    "Problème facturation / Montant",
    "Retard livraison prévu"
  ],
  "Magasin": [
    "Rupture / Annulation Client"
  ]
};

// --- ACTIONS CONTEXTUELLES PAR MOTIF ---
const getActionsForReason = (reason, source) => {
  if (source === "Magasin" || reason === "Rupture / Annulation Client") {
    return [
      { label: "COMMANDE ANNULEE", color: "red", icon: "XCircle" },
      { label: "CHERCHER SUBST.", color: "slate", icon: "Search" },
      { label: "APPELER CLIENT", color: "slate", icon: "Phone" }
    ];
  }

  const actionMap = {
    "Client injoignable": [
      { label: "APPELER CLIENT", color: "slate", icon: "Phone" },
      { label: "RELIVRER ASAP", color: "emerald", icon: "Truck" },
      { label: "LAISSER AVIS", color: "slate", icon: "BellRing" },
      { label: "OK POUR ANNULER", color: "red", icon: "XCircle" }
    ],
    "Paiement en ligne à effectuer": [
      { label: "APPELER CLIENT", color: "slate", icon: "Phone" },
      { label: "RELANCER PAIEMENT", color: "slate", icon: "DollarSign" },
      { label: "RELIVRER ASAP", color: "emerald", icon: "Truck" },
      { label: "OK POUR ANNULER", color: "red", icon: "XCircle" }
    ],
    "Adresse incorrecte / Hors zone": [
      { label: "APPELER CLIENT", color: "slate", icon: "Phone" },
      { label: "RELOCALISER LIVR.", color: "slate", icon: "MapPin" },
      { label: "RELIVRER ASAP", color: "emerald", icon: "Truck" },
      { label: "OK POUR ANNULER", color: "red", icon: "XCircle" }
    ],
    "Article manquant": [
      { label: "CHERCHER SUBST.", color: "slate", icon: "Search" },
      { label: "APPELER CLIENT", color: "slate", icon: "Phone" },
      { label: "PREPARER COMMANDE", color: "emerald", icon: "PackageCheck" },
      { label: "OK POUR ANNULER", color: "red", icon: "XCircle" }
    ],
    "Problème facturation / Montant": [
      { label: "APPELER CLIENT", color: "slate", icon: "Phone" },
      { label: "VERIFIER MONTANT", color: "slate", icon: "DollarSign" },
      { label: "RELIVRER ASAP", color: "emerald", icon: "Truck" },
      { label: "OK POUR ANNULER", color: "red", icon: "XCircle" }
    ],
    "Retard livraison prévu": [
      { label: "APPELER CLIENT", color: "slate", icon: "Phone" },
      { label: "RELANCER PREP.", color: "slate", icon: "Clock" },
      { label: "RELIVRER ASAP", color: "emerald", icon: "Truck" },
      { label: "OK POUR ANNULER", color: "red", icon: "XCircle" }
    ]
  };

  return actionMap[reason] || [
    { label: "APPELER CLIENT", color: "slate", icon: "Phone" },
    { label: "RELIVRER ASAP", color: "emerald", icon: "Truck" },
    { label: "OK POUR ANNULER", color: "red", icon: "XCircle" }
  ];
};

// --- RÉPONSES CONTEXTUELLES SUPPORT ---
const getDefaultCSResponse = (reason, source) => {
  const responses = {
    "Livreur": {
      "Client injoignable": "Effectuer 2 tentatives d'appel. Si pas de réponse, laisser un avis et reporter la livraison.",
      "Paiement en ligne à effectuer": "Appeler le client pour confirmer son identité et traiter le paiement. Si refus, reporter la livraison.",
      "Adresse incorrecte / Hors zone": "Contacter le client immédiatement pour corriger l'adresse. Si hors zone, proposer point de retrait.",
      "Article manquant": "Vérifier le stock en magasin et proposer un substitut de même valeur au client.",
      "Problème facturation / Montant": "Vérifier la facture et rappeler au client les frais de service. Proposer solution si erreur confirmée.",
      "Retard livraison prévu": "Appeler le client pour adapter le créneau horaire. Proposer crédit magasin si désagrément."
    },
    "Magasin": {
      "Rupture / Annulation Client": "Vérifier disponibilité. Si rupture : proposer substitut ou remboursement. Si client : confirmer annulation et traiter remboursement."
    }
  };

  return responses[source]?.[reason] || "Analyser la situation et proposer une solution adaptée au client.";
};

const App = () => {
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);

  const [formData, setFormData] = useState({ orderId: '', source: 'Livreur', reason: '', name: '' });
  const [responseInput, setResponseInput] = useState({ id: null, text: '', action: '', agentName: '' });
  const [expandedTickets, setExpandedTickets] = useState({});

  // Déterminer la vue depuis l'URL
  const getViewFromPath = () => {
    if (typeof window === 'undefined') return 'support';
    const path = window.location.pathname;
    if (path.includes('/livreur')) return 'livreur';
    if (path.includes('/support')) return 'support';
    return 'support'; // défaut
  };

  const [view] = useState(getViewFromPath());

  // 1. Authentification avec Retry
  useEffect(() => {
    const initAuth = async (retries = 5, delay = 1000) => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        if (retries > 0) {
          setTimeout(() => initAuth(retries - 1, delay * 2), delay);
        } else {
          setConnectionError(true);
          setLoading(false);
        }
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Temps réel Firestore
  useEffect(() => {
    if (!user) return;
    
    const ticketsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'tickets');
    
    const unsubscribe = onSnapshot(ticketsCollection, 
      (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
        const sorted = docs.sort((a, b) => {
          const timeA = a.timestamp?.seconds || 0;
          const timeB = b.timestamp?.seconds || 0;
          return timeB - timeA;
        });
        setRequests(sorted);
        setLoading(false);
        setConnectionError(false);
      }, 
      (error) => {
        console.error("Firestore Error:", error);
        if (error.code === 'unavailable') {
          setConnectionError(true);
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleCSResponse = async (docId, reason, source) => {
    if (!user || !responseInput.text.trim() || !responseInput.action || !responseInput.agentName.trim()) return;
    try {
      const ticketRef = doc(db, 'artifacts', appId, 'public', 'data', 'tickets', docId);
      await updateDoc(ticketRef, {
        status: 'replied',
        csResponse: responseInput.text,
        csAction: responseInput.action,
        agentName: responseInput.agentName,
        respondedAt: serverTimestamp()
      });
      setResponseInput({ id: null, text: '', action: '', agentName: '' });
    } catch (e) { console.error(e); }
  };

  const markResolved = async (docId) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tickets', docId), { 
        status: 'resolved', 
        closedAt: serverTimestamp() 
      });
    } catch (e) { console.error(e); }
  };

  const toggleTicketExpand = (docId) => {
    setExpandedTickets(prev => ({
      ...prev,
      [docId]: !prev[docId]
    }));
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
      <Loader2 className="animate-spin text-orange-500" size={48} />
      <p className="text-slate-400 font-black uppercase text-xs tracking-widest">Initialisation Sécurisée...</p>
    </div>
  );

  if (connectionError && !requests.length) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <WifiOff className="text-slate-300 mb-4" size={64} />
      <h2 className="text-xl font-black text-slate-800 uppercase italic">Problème de connexion</h2>
      <p className="text-slate-500 text-sm max-w-xs mt-2">Impossible de joindre le serveur. Vérifiez votre connexion internet ou réessayez dans quelques instants.</p>
      <button onClick={() => window.location.reload()} className="mt-6 bg-slate-900 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest">Réessayer</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-10">
      {/* NAV */}
      <nav className="bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-50 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="bg-orange-500 p-1.5 rounded-lg"><ShieldCheck size={20}/></div>
          <span className="font-black tracking-tighter text-xl uppercase italic">Flash-Control</span>
        </div>
        <div className="text-[12px] font-black text-orange-400 uppercase tracking-widest">
          {view === 'livreur' ? '🚚 TERMINAL TERRAIN' : '💬 SUPPORT CLIENT'}
        </div>
      </nav>

      {connectionError && (
        <div className="bg-amber-500 text-white p-2 text-center text-[10px] font-bold uppercase tracking-widest animate-pulse">
          Mode Hors-Ligne : Tentative de reconnexion...
        </div>
      )}

      <div className="max-w-6xl mx-auto p-4 md:p-8">
        {/* === VUE SUPPORT CLIENT === */}
        {view === 'support' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 italic uppercase tracking-tighter">
              <MessageSquare className="text-orange-500" size={28}/> File de Décision
            </h2>
            
            {requests.filter(r => r.status === 'pending' || r.status === 'replied').length === 0 ? (
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 text-center">
                <CheckCircle2 className="mx-auto text-emerald-500 mb-4" size={48} />
                <p className="text-slate-500 font-black text-sm">Aucun ticket en attente</p>
              </div>
            ) : (
              requests.filter(r => r.status === 'pending' || r.status === 'replied').map(req => (
                <div key={req.docId} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl relative overflow-hidden mb-6">
                  <div className={`absolute top-0 right-0 px-6 py-2 text-[10px] font-black uppercase text-white ${req.source === 'Livreur' ? 'bg-indigo-600' : 'bg-blue-600'}`}>
                     {req.source}
                  </div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <User size={14} className="text-slate-400"/>
                        <span className="text-xs font-black text-slate-500">{req.name}</span>
                      </div>
                      <span className="text-xs font-black text-orange-500 bg-orange-50 px-2 py-1 rounded">CMD #{req.orderId}</span>
                      <h3 className="text-2xl font-black text-slate-900 mt-2">{req.reason}</h3>
                    </div>
                    <button onClick={() => markResolved(req.docId)} className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"><CheckCircle2/></button>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-[11px]">
                      <p className="text-slate-600 font-bold italic">💡 Suggestion contextuelle :</p>
                      <p className="text-slate-700 font-black mt-2">{getDefaultCSResponse(req.reason, req.source)}</p>
                    </div>

                    <textarea 
                      className="w-full p-4 bg-slate-50 rounded-2xl text-sm font-bold border-2 border-transparent focus:border-orange-500/30 outline-none min-h-[100px]"
                      placeholder="Instructions pour le terrain..."
                      value={responseInput.id === req.docId ? responseInput.text : (req.csResponse || '')}
                      onChange={e => setResponseInput({ ...responseInput, id: req.docId, text: e.target.value })}
                    />

                    <div className="bg-slate-50 p-5 rounded-[1.5rem] border-2 border-slate-100 focus-within:border-orange-500 transition-all">
                      <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">NOM DE L'AGENT</label>
                      <input 
                        value={responseInput.id === req.docId ? responseInput.agentName : ''} 
                        onChange={e => setResponseInput({ ...responseInput, id: req.docId, agentName: e.target.value })} 
                        className="w-full bg-transparent font-black text-lg outline-none" 
                        placeholder="Votre nom"
                      />
                    </div>
                    
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-3">Actions recommandées</p>
                      <div className="flex flex-wrap gap-2">
                        {getActionsForReason(req.reason, req.source).map(act => (
                          <button 
                            key={act.label}
                            onClick={() => setResponseInput({ 
                              id: req.docId, 
                              text: responseInput.id === req.docId ? responseInput.text : (req.csResponse || ''), 
                              action: act.label,
                              agentName: responseInput.id === req.docId ? responseInput.agentName : ''
                            })}
                            className={`px-4 py-3 rounded-xl text-[9px] font-black border-2 transition-all ${
                              (responseInput.id === req.docId ? responseInput.action : req.csAction) === act.label 
                                ? 'bg-slate-900 border-slate-900 text-white shadow-lg' 
                                : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300'
                            }`}
                          >
                            {act.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button 
                      onClick={() => handleCSResponse(req.docId, req.reason, req.source)}
                      disabled={responseInput.id !== req.docId || !responseInput.text.trim() || !responseInput.action || !responseInput.agentName.trim()}
                      className={`w-full py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all ${responseInput.id === req.docId && responseInput.text.trim() && responseInput.action && responseInput.agentName.trim() ? 'bg-orange-500 text-white shadow-xl' : 'bg-slate-100 text-slate-300'}`}
                    >
                      Envoyer au Terrain
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* === VUE TERMINAL TERRAIN === */}
        {view === 'livreur' && (
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 sticky top-24 h-fit">
              <h2 className="text-2xl font-black mb-8 italic uppercase text-slate-900 tracking-tighter">Signalement</h2>
              <div className="space-y-6">
                <div className="bg-slate-50 p-5 rounded-[1.5rem] border-2 border-slate-100 focus-within:border-blue-500 transition-all">
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">VOTRE NOM</label>
                  <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-transparent font-black text-lg outline-none" placeholder="Nom"/>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setFormData({...formData, source: 'Livreur', reason: ''})} className={`py-5 rounded-[1.5rem] text-[11px] font-black border-2 transition-all ${formData.source === 'Livreur' ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-50'}`}>LIVREUR</button>
                  <button onClick={() => setFormData({...formData, source: 'Magasin', reason: ''})} className={`py-5 rounded-[1.5rem] text-[11px] font-black border-2 transition-all ${formData.source === 'Magasin' ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-50'}`}>MAGASIN</button>
                </div>
                <div className="bg-slate-50 p-5 rounded-[1.5rem] border-2 border-slate-100 focus-within:border-blue-500 transition-all">
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">N° COMMANDE</label>
                  <input value={formData.orderId} onChange={e => setFormData({...formData, orderId: e.target.value})} className="w-full bg-transparent font-black text-2xl outline-none" placeholder="00000"/>
                </div>
                <div className="space-y-3">
                  {reasonsBySource[formData.source]?.map(r => (
                    <button key={r} onClick={() => setFormData({...formData, reason: r})} className={`w-full text-left p-6 rounded-[1.5rem] text-sm font-black border-2 transition-all flex items-center justify-between ${formData.reason === r ? 'bg-slate-900 border-slate-900 text-white shadow-xl' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200'}`}>
                      {r} <ChevronRight size={18}/>
                    </button>
                  ))}
                </div>
                <button onClick={async () => {
                  if(!user || !formData.reason || !formData.orderId || !formData.name.trim()) return;
                  try {
                    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'tickets'), { ...formData, status: 'pending', timestamp: serverTimestamp() });
                    setFormData({ orderId: '', source: 'Livreur', reason: '', name: formData.name });
                  } catch (e) { console.error(e); }
                }} className={`w-full py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] transition-all ${formData.reason && formData.orderId && formData.name.trim() ? 'bg-blue-600 text-white shadow-2xl' : 'bg-slate-100 text-slate-200'}`}>Envoyer au Support</button>
              </div>
            </div>
            
            <div className="space-y-6">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-4 italic"><History size={16}/> Réponses en Temps Réel</h3>
              <div className="space-y-4">
                {requests.filter(r => r.name === formData.name).slice(0, 10).map(req => (
                  <div key={`${req.docId}-${req.status}`} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden transition-all duration-500">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                         <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${req.source === 'Livreur' ? 'bg-purple-500' : 'bg-blue-500'}`}>{req.source === 'Livreur' ? <Truck size={14}/> : <Store size={14}/>}</span>
                         <span className="text-[10px] font-black text-slate-400 tracking-tighter">CMD #{req.orderId}</span>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${req.csResponse ? 'bg-emerald-500 text-white animate-bounce' : 'bg-slate-100 text-slate-400'}`}>
                        {req.csResponse ? 'RÉPONSE DISPONIBLE' : 'ANALYSE EN COURS'}
                      </span>
                    </div>

                    <h4 className="text-xl font-black text-slate-800 mb-2">{req.reason}</h4>
                    
                    {req.csResponse ? (
                      <div className="mt-4 pt-4 border-t-2 border-dashed border-slate-100 bg-emerald-50/30 -mx-6 px-6 pb-6 animate-in fade-in zoom-in duration-500">
                        <div className="flex items-center gap-2 mb-3 mt-2">
                          <BellRing size={16} className="text-emerald-600"/>
                          <div>
                            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Réponse de {req.agentName || 'Support'}</p>
                          </div>
                        </div>
                        
                        <div className="bg-white p-5 rounded-2xl mb-4 border-2 border-emerald-100 shadow-sm relative">
                           <p className="text-sm font-bold text-slate-700 leading-relaxed italic">"{req.csResponse}"</p>
                           <div className="absolute -top-2 -right-2 bg-emerald-500 text-white p-1 rounded-full shadow-lg"><CheckCircle2 size={12}/></div>
                        </div>
                        
                        <div className={`w-full py-5 px-4 rounded-2xl text-[11px] font-black border-2 transition-all flex items-center justify-center gap-3 shadow-xl ${
                             ['COMMANDE ANNULEA', 'OK POUR ANNULER'].includes(req.csAction) ? 'bg-red-600 border-red-600 text-white' : 
                             ['PREPARER COMMANDE', 'RELIVRER ASAP', 'REPASSER COMMANDE'].includes(req.csAction) ? 'bg-emerald-600 border-emerald-600 text-white' : 
                             'bg-slate-900 border-slate-900 text-white'
                        }`}>
                             {req.csAction === 'APPELER CLIENT' && <Phone size={18}/>}
                             {req.csAction === 'REPASSER COMMANDE' && <RefreshCcw size={18}/>}
                             {req.csAction === 'COMMANDE ANNULEA' && <XCircle size={18}/>}
                             {req.csAction === 'PREPARER COMMANDE' && <PackageCheck size={18}/>}
                             <span className="uppercase tracking-[0.1em] text-lg font-black">{req.csAction}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center justify-center gap-3 py-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <Loader2 size={16} className="animate-spin text-slate-300"/>
                        <p className="text-[11px] font-bold text-slate-400 italic">Analyse Support en cours...</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
