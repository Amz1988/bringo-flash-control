import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithEmailAndPassword,
  signOut,
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
  ChevronRight,
  PackageCheck,
  XCircle,
  Phone,
  Search,
  BellRing,
  MapPin,
  DollarSign,
  User,
  LogOut,
  Clock
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

// --- UTILISATEURS HARDCODÉS ---
const USERS = {
  'ayoub.kodhi@bringo.com': { name: 'Ayoub Kodhi', role: 'support' },
  'fatima.khouja@bringo.com': { name: 'Fatima Khouja', role: 'support' },
  'mouad.bennani@bringo.com': { name: 'Mouad Bennani', role: 'support' },
  'livreur@bringo.com': { name: 'Livreur Test', role: 'magasin' },
};

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
      { label: "COMMANDE ANNULEE" },
      { label: "CHERCHER SUBST." },
      { label: "APPELER CLIENT" }
    ];
  }

  const actionMap = {
    "Client injoignable": [
      { label: "APPELER CLIENT" },
      { label: "RELIVRER ASAP" },
      { label: "LAISSER AVIS" },
      { label: "OK POUR ANNULER" }
    ],
    "Paiement en ligne à effectuer": [
      { label: "APPELER CLIENT" },
      { label: "RELANCER PAIEMENT" },
      { label: "RELIVRER ASAP" },
      { label: "OK POUR ANNULER" }
    ],
    "Adresse incorrecte / Hors zone": [
      { label: "APPELER CLIENT" },
      { label: "RELOCALISER LIVR." },
      { label: "RELIVRER ASAP" },
      { label: "OK POUR ANNULER" }
    ],
    "Article manquant": [
      { label: "CHERCHER SUBST." },
      { label: "APPELER CLIENT" },
      { label: "PREPARER COMMANDE" },
      { label: "OK POUR ANNULER" }
    ],
    "Problème facturation / Montant": [
      { label: "APPELER CLIENT" },
      { label: "VERIFIER MONTANT" },
      { label: "RELIVRER ASAP" },
      { label: "OK POUR ANNULER" }
    ],
    "Retard livraison prévu": [
      { label: "APPELER CLIENT" },
      { label: "RELANCER PREP." },
      { label: "RELIVRER ASAP" },
      { label: "OK POUR ANNULER" }
    ]
  };

  return actionMap[reason] || [
    { label: "APPELER CLIENT" },
    { label: "RELIVRER ASAP" },
    { label: "OK POUR ANNULER" }
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
  const [authUser, setAuthUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);

  const [formData, setFormData] = useState({ orderId: '', source: 'Livreur', reason: '', livreurName: '' });
  const [responseInput, setResponseInput] = useState({ id: null, text: '', action: '' });

  // Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setAuthUser(currentUser);
        // Utiliser l'email pour trouver le profil
        const profile = USERS[currentUser.email];
        if (profile) {
          setUserProfile(profile);
        } else {
          setLoginError('Utilisateur non reconnu. Contactez l\'admin.');
          signOut(auth);
        }
      } else {
        setAuthUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Tickets Listener
  useEffect(() => {
    if (!authUser) return;
    
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
        setConnectionError(false);
      }, 
      (error) => {
        console.error("Firestore Error:", error);
        setConnectionError(true);
      }
    );

    return () => unsubscribe();
  }, [authUser]);

  // Handle Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
    } catch (error) {
      setLoginError('Email ou mot de passe incorrect');
    }
    setLoginLoading(false);
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setLoginEmail('');
      setLoginPassword('');
    } catch (error) {
      console.error(error);
    }
  };

  const handleCSResponse = async (docId, reason, source) => {
    if (!authUser || !responseInput.text.trim() || !responseInput.action) return;
    try {
      const ticketRef = doc(db, 'artifacts', appId, 'public', 'data', 'tickets', docId);
      await updateDoc(ticketRef, {
        status: 'replied',
        csResponse: responseInput.text,
        csAction: responseInput.action,
        agentName: userProfile?.name,
        respondedAt: serverTimestamp()
      });
      setResponseInput({ id: null, text: '', action: '' });
    } catch (e) { console.error(e); }
  };

  const markResolved = async (docId) => {
    if (!authUser) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tickets', docId), { 
        status: 'resolved', 
        closedAt: serverTimestamp() 
      });
    } catch (e) { console.error(e); }
  };

  // === PAGE LOGIN ===
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="animate-spin text-orange-500" size={48} />
        <p className="text-slate-400 font-black uppercase text-xs tracking-widest">Chargement...</p>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-[3rem] shadow-2xl p-8 w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="bg-orange-500 p-3 rounded-lg"><ShieldCheck size={28}/></div>
            <h1 className="text-3xl font-black uppercase italic">Flash-Control</h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">EMAIL</label>
              <input 
                type="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                className="w-full p-4 bg-slate-50 rounded-2xl text-sm font-bold border-2 border-transparent focus:border-orange-500 outline-none"
                placeholder="ayoub.kodhi@bringo.com"
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">MOT DE PASSE</label>
              <input 
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                className="w-full p-4 bg-slate-50 rounded-2xl text-sm font-bold border-2 border-transparent focus:border-orange-500 outline-none"
                placeholder="••••••••"
                required
              />
            </div>

            {loginError && (
              <div className="p-4 bg-red-50 border-2 border-red-200 rounded-2xl text-[12px] font-black text-red-700 uppercase">
                ⚠️ {loginError}
              </div>
            )}

            <button 
              type="submit"
              disabled={loginLoading}
              className={`w-full py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] transition-all ${loginLoading ? 'bg-slate-200 text-slate-400' : 'bg-orange-500 text-white shadow-xl hover:bg-orange-600'}`}
            >
              {loginLoading ? 'CONNEXION...' : 'CONNEXION'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-slate-100 rounded-2xl text-[10px] text-slate-600">
            <p className="font-bold mb-2">Comptes de test:</p>
            <p>📧 ayoub.kodhi@bringo.com</p>
            <p>📧 fatima.khouja@bringo.com</p>
            <p>📧 mouad.bennani@bringo.com</p>
            <p>📧 livreur@bringo.com</p>
          </div>
        </div>
      </div>
    );
  }

  // === PAGE PRINCIPALE (CONNECTÉ) ===
  const isMagasin = userProfile?.role === 'magasin';
  const isSupport = userProfile?.role === 'support';

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-10">
      {/* NAV */}
      <nav className="bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-50 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="bg-orange-500 p-1.5 rounded-lg"><ShieldCheck size={20}/></div>
          <span className="font-black tracking-tighter text-xl uppercase italic hidden sm:inline">Flash-Control</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">
              {isMagasin ? '🏪 MAGASIN' : isSupport ? '💬 SUPPORT' : ''}
            </p>
            <p className="text-[12px] font-black text-white">{userProfile?.name}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="p-3 bg-red-600 hover:bg-red-700 rounded-xl transition-all"
          >
            <LogOut size={18}/>
          </button>
        </div>
      </nav>

      {connectionError && (
        <div className="bg-amber-500 text-white p-2 text-center text-[10px] font-bold uppercase tracking-widest animate-pulse">
          Mode Hors-Ligne : Tentative de reconnexion...
        </div>
      )}

      <div className="max-w-6xl mx-auto p-4 md:p-8">
        {/* === VUE SUPPORT CLIENT === */}
        {isSupport && (
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
                <div key={req.docId} className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-xl relative overflow-hidden mb-6">
                  <div className={`absolute top-0 right-0 px-6 py-2 text-[10px] font-black uppercase text-white ${req.source === 'Livreur' ? 'bg-indigo-600' : 'bg-blue-600'}`}>
                     {req.source}
                  </div>
                  <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Store size={14} className="text-slate-400"/>
                        <span className="text-xs font-black text-slate-500">{req.magasinName || 'Magasin'}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <User size={14} className="text-slate-400"/>
                        <span className="text-xs font-black text-slate-500">{req.livreurName}</span>
                      </div>
                      <span className="text-xs font-black text-orange-500 bg-orange-50 px-2 py-1 rounded">CMD #{req.orderId}</span>
                      <h3 className="text-xl md:text-2xl font-black text-slate-900 mt-2">{req.reason}</h3>
                    </div>
                    <button onClick={() => markResolved(req.docId)} className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"><CheckCircle2/></button>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-[11px]">
                      <p className="text-slate-600 font-bold italic">💡 Suggestion :</p>
                      <p className="text-slate-700 font-black mt-2">{getDefaultCSResponse(req.reason, req.source)}</p>
                    </div>

                    <textarea 
                      className="w-full p-4 bg-slate-50 rounded-2xl text-sm font-bold border-2 border-transparent focus:border-orange-500/30 outline-none min-h-[100px]"
                      placeholder="Instructions pour le terrain..."
                      value={responseInput.id === req.docId ? responseInput.text : (req.csResponse || '')}
                      onChange={e => setResponseInput({ ...responseInput, id: req.docId, text: e.target.value })}
                    />

                    <div className="bg-emerald-50 p-5 rounded-[1.5rem] border-2 border-emerald-200">
                      <label className="text-[10px] font-black text-emerald-600 uppercase block mb-2">✓ AGENT</label>
                      <p className="font-black text-lg text-emerald-900">{userProfile?.name}</p>
                    </div>
                    
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-3">Actions</p>
                      <div className="flex flex-wrap gap-2">
                        {getActionsForReason(req.reason, req.source).map(act => (
                          <button 
                            key={act.label}
                            onClick={() => setResponseInput({ 
                              id: req.docId, 
                              text: responseInput.id === req.docId ? responseInput.text : (req.csResponse || ''), 
                              action: act.label
                            })}
                            className={`px-3 py-2 rounded-xl text-[9px] font-black border-2 transition-all ${
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

        {/* === VUE MAGASIN/LIVREUR === */}
        {isMagasin && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 italic uppercase tracking-tighter">
              <Truck className="text-orange-500" size={28}/> Mes Incidents
            </h2>

            <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-6">
              <h3 className="text-xl font-black italic uppercase text-slate-900">Nouveau Signalement</h3>
              
              <div className="bg-slate-50 p-5 rounded-[1.5rem] border-2 border-slate-100 focus-within:border-blue-500 transition-all">
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">NOM LIVREUR/PRÉPARATEUR</label>
                <input value={formData.livreurName} onChange={e => setFormData({...formData, livreurName: e.target.value})} className="w-full bg-transparent font-black text-lg outline-none" placeholder="Nom Prénom"/>
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
                if(!authUser || !formData.reason || !formData.orderId || !formData.livreurName.trim()) return;
                try {
                  await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'tickets'), { 
                    ...formData, 
                    magasinName: userProfile.name,
                    status: 'pending', 
                    timestamp: serverTimestamp() 
                  });
                  setFormData({ orderId: '', source: 'Livreur', reason: '', livreurName: formData.livreurName });
                } catch (e) { console.error(e); }
              }} className={`w-full py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] transition-all ${formData.reason && formData.orderId && formData.livreurName.trim() ? 'bg-blue-600 text-white shadow-2xl' : 'bg-slate-100 text-slate-200'}`}>Envoyer au Support</button>
            </div>

            {/* Réponses */}
            <div className="space-y-6">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-4 italic"><History size={16}/> Mes Réponses</h3>
              <div className="space-y-4">
                {requests.filter(r => r.magasinName === userProfile?.name && (r.status === 'pending' || r.status === 'replied')).map(req => (
                  <div key={`${req.docId}`} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
                    <div className="flex justify-between items-start mb-4 gap-2">
                      <div>
                        <p className="text-[10px] font-black text-slate-400">
                          {req.livreurName}
                        </p>
                        <span className="text-[10px] font-black text-slate-400">CMD #{req.orderId}</span>
                        <h4 className="text-lg md:text-xl font-black text-slate-800 mt-1">{req.reason}</h4>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase whitespace-nowrap ${req.csResponse ? 'bg-emerald-500 text-white animate-bounce' : 'bg-slate-100 text-slate-400'}`}>
                        {req.csResponse ? '✓ RÉP' : 'EN ATTENTE'}
                      </span>
                    </div>

                    {req.csResponse ? (
                      <div className="mt-4 pt-4 border-t-2 border-dashed border-slate-100 bg-emerald-50/30 -mx-6 px-6 pb-6 space-y-4">
                        <div className="flex items-center gap-2">
                          <BellRing size={16} className="text-emerald-600"/>
                          <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Réponse de {req.agentName || 'Support'}</p>
                        </div>
                        
                        <div className="bg-white p-4 rounded-2xl border-2 border-emerald-100 shadow-sm">
                           <p className="text-sm font-bold text-slate-700 leading-relaxed italic">"{req.csResponse}"</p>
                        </div>
                        
                        <div className={`w-full py-4 px-4 rounded-2xl text-[11px] font-black border-2 transition-all flex items-center justify-center gap-2 shadow-xl ${
                             ['COMMANDE ANNULEA', 'OK POUR ANNULER'].includes(req.csAction) ? 'bg-red-600 border-red-600 text-white' : 
                             ['PREPARER COMMANDE', 'RELIVRER ASAP'].includes(req.csAction) ? 'bg-emerald-600 border-emerald-600 text-white' : 
                             'bg-slate-900 border-slate-900 text-white'
                        }`}>
                             {req.csAction && <span className="uppercase tracking-[0.1em] font-black">{req.csAction}</span>}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center justify-center gap-3 py-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <Loader2 size={16} className="animate-spin text-slate-300"/>
                        <p className="text-[11px] font-bold text-slate-400 italic">Analyse Support...</p>
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
