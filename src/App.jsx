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
  Package
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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'flash-control-v5';

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
  // Actions spécifiques Magasin
  if (source === "Magasin" || reason === "Rupture / Annulation Client") {
    return [
      { label: "COMMANDE ANNULEE", color: "red", icon: "XCircle" },
      { label: "CHERCHER SUBST.", color: "slate", icon: "Search" },
      { label: "APPELER CLIENT", color: "slate", icon: "Phone" }
    ];
  }

  // Actions spécifiques aux motifs livreur
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
  const [view, setView] = useState('cs'); 
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);

  const [formData, setFormData] = useState({ orderId: '', source: 'Livreur', reason: '', details: '' });
  const [responseInput, setResponseInput] = useState({ id: null, text: '', action: '' });
  const [expandedTickets, setExpandedTickets] = useState({});

  // 1. Authentification avec Retry
  useEffect(() => {
    const initAuth = async (retries = 5, delay = 1000) => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
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
    if (!user || !responseInput.text.trim() || !responseInput.action) return;
    try {
      const ticketRef = doc(db, 'artifacts', appId, 'public', 'data', 'tickets', docId);
      await updateDoc(ticketRef, {
        status: 'replied',
        csResponse: responseInput.text,
        csAction: responseInput.action,
        respondedAt: serverTimestamp()
      });
      setResponseInput({ id: null, text: '', action: '' });
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
      <nav className="bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-50 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="bg-orange-500 p-1.5 rounded-lg"><ShieldCheck size={20}/></div>
          <span className="font-black tracking-tighter text-xl uppercase italic">Flash-Control</span>
        </div>
        <div className="flex bg-slate-800 p-1 rounded-xl">
          <button onClick={() => setView('requester')} className={`px-5 py-2 rounded-lg text-[11px] font-black transition-all ${view === 'requester' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>TERMINAL TERRAIN</button>
          <button onClick={() => setView('cs')} className={`px-5 py-2 rounded-lg text-[11px] font-black transition-all ${view === 'cs' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>SUPPORT CLIENT (CS)</button>
        </div>
      </nav>

      {connectionError && (
        <div className="bg-amber-500 text-white p-2 text-center text-[10px] font-bold uppercase tracking-widest animate-pulse">
          Mode Hors-Ligne : Tentative de reconnexion...
        </div>
      )}

      <div className="max-w-5xl mx-auto p-4 md:p-8">
        {/* === VUE SUPPORT CLIENT === */}
        {view === 'cs' && (
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
                    
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-3">Actions recommandées</p>
                      <div className="flex flex-wrap gap-2">
                        {getActionsForReason(req.reason, req.source).map(act => (
                          <button 
                            key={act.label}
                            onClick={() => setResponseInput({ 
                              id: req.docId, 
                              text: responseInput.id === req.docId ? responseInput.text : (req.csResponse || ''), 
                              action: act.label 
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
                      disabled={responseInput.id !== req.docId || !responseInput.text.trim() || !responseInput.action}
                      className={`w-full py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all ${responseInput.id === req.docId && responseInput.text.trim() && responseInput.action ? 'bg-orange-500 text-white shadow-xl' : 'bg-slate-100 text-slate-300'}`}
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
        {view === 'requester' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 italic uppercase tracking-tighter mb-8">
              <Truck className="text-orange-500" size={28}/> Terminal Terrain
            </h2>

            {requests.filter(r => r.status === 'pending' || r.status === 'replied').length === 0 ? (
              <div className="bg-white p-12 rounded-[2.5rem] border border-slate-200 text-center">
                <Package className="mx-auto text-slate-300 mb-4" size={48} />
                <p className="text-slate-500 font-black text-sm">Aucun incident en cours</p>
              </div>
            ) : (
              <div className="space-y-4">
                {requests.filter(r => r.status === 'pending' || r.status === 'replied').map(req => (
                  <div key={`terrain-${req.docId}`} className="bg-white rounded-[2.5rem] border-2 shadow-xl overflow-hidden transition-all hover:shadow-2xl">
                    {/* En-tête cliquable */}
                    <button 
                      onClick={() => toggleTicketExpand(req.docId)}
                      className="w-full p-6 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg ${req.source === 'Livreur' ? 'bg-indigo-600' : 'bg-blue-600'}`}>
                          {req.orderId.toString().slice(-2)}
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-1">CMD #{req.orderId}</p>
                          <h3 className="text-lg font-black text-slate-900">{req.reason}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase ${
                            req.csResponse 
                              ? 'bg-emerald-500 text-white animate-pulse' 
                              : 'bg-amber-500 text-white animate-bounce'
                          }`}>
                            {req.csResponse ? '✓ RÉPONSE' : 'EN ATTENTE'}
                          </span>
                          <ChevronRight className={`text-slate-300 transition-transform ${expandedTickets[req.docId] ? 'rotate-90' : ''}`} size={20} />
                        </div>
                      </div>
                    </button>

                    {/* Contenu développé */}
                    {expandedTickets[req.docId] && (
                      <div className="border-t-2 border-slate-100 p-8 bg-gradient-to-br from-slate-50 to-white space-y-6 animate-in fade-in duration-300">
                        {/* Source et timing */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white p-4 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Source</p>
                            <p className="text-lg font-black text-slate-900">{req.source === 'Livreur' ? '🚚 Livreur' : '🏪 Magasin'}</p>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Statut</p>
                            <p className="text-lg font-black text-slate-900">{req.status === 'replied' ? '✓ Analysé' : '⏳ Analyse'}</p>
                          </div>
                        </div>

                        {/* Réponse Support Client si disponible */}
                        {req.csResponse ? (
                          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-[2rem] p-8 space-y-5">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                                <BellRing size={18} className="text-white" />
                              </div>
                              <p className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">Instruction Support Client</p>
                            </div>

                            <div className="bg-white p-6 rounded-2xl border-2 border-emerald-200 shadow-sm">
                              <p className="text-sm font-bold text-slate-700 leading-relaxed italic">"{req.csResponse}"</p>
                            </div>

                            {/* Action à exécuter */}
                            {req.csAction && (
                              <div className={`w-full py-6 px-4 rounded-[1.5rem] text-[12px] font-black border-2 transition-all flex items-center justify-center gap-3 shadow-lg ${
                                ['COMMANDE ANNULEE', 'OK POUR ANNULER'].includes(req.csAction) 
                                  ? 'bg-red-600 border-red-600 text-white' 
                                  : ['PREPARER COMMANDE', 'RELIVRER ASAP', 'REPASSER COMMANDE', 'CHERCHER SUBST.'].includes(req.csAction) 
                                    ? 'bg-emerald-600 border-emerald-600 text-white' 
                                    : 'bg-slate-900 border-slate-900 text-white'
                              }`}>
                                {req.csAction === 'APPELER CLIENT' && <Phone size={20} />}
                                {req.csAction === 'REPASSER COMMANDE' && <RefreshCcw size={20} />}
                                {req.csAction === 'RELIVRER ASAP' && <Truck size={20} />}
                                {req.csAction === 'COMMANDE ANNULEE' && <XCircle size={20} />}
                                {req.csAction === 'OK POUR ANNULER' && <XCircle size={20} />}
                                {req.csAction === 'PREPARER COMMANDE' && <PackageCheck size={20} />}
                                {req.csAction === 'CHERCHER SUBST.' && <Search size={20} />}
                                {req.csAction === 'LAISSER AVIS' && <BellRing size={20} />}
                                {req.csAction === 'RELOCALISER LIVR.' && <MapPin size={20} />}
                                {req.csAction === 'RELANCER PAIEMENT' && <DollarSign size={20} />}
                                {req.csAction === 'RELANCER PREP.' && <Clock size={20} />}
                                {req.csAction === 'VERIFIER MONTANT' && <DollarSign size={20} />}
                                <span className="uppercase tracking-[0.1em] text-lg">{req.csAction}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-amber-50 border-2 border-amber-200 rounded-[2rem] p-8 flex items-center justify-center gap-4">
                            <Loader2 size={20} className="animate-spin text-amber-500" />
                            <p className="text-[12px] font-black text-amber-700 uppercase tracking-widest">Analyse du Support en cours...</p>
                          </div>
                        )}

                        {/* Actions d'exécution */}
                        {req.csResponse && (
                          <div className="pt-4 border-t-2 border-slate-100">
                            <button 
                              onClick={() => markResolved(req.docId)}
                              className="w-full py-5 bg-emerald-500 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                              <CheckCircle2 size={18} />
                              Marquer comme Résolu
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
