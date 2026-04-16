import React, { useState, useEffect, useMemo } from "react";
import {
  Upload, FileText, Brain, Target, TrendingUp, Zap,
  ChevronRight, RotateCcw, CheckCircle2, XCircle, AlertCircle,
  Flame, Clock, BarChart3, Sparkles, ArrowRight,
  Trash2, Lightbulb, Home, Loader2, Key, Settings,
} from "lucide-react";
import { storage } from "./storage";
import { callClaude, parseJsonFromResponse, getApiKey, setApiKey, hasApiKey } from "./api";
import { extractPdfText } from "./pdfExtractor";
import ApiKeyModal from "./components/ApiKeyModal";

export default function App() {
  const [view, setView] = useState("home");
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfText, setPdfText] = useState("");
  const [axes, setAxes] = useState([]);
  const [progress, setProgress] = useState({});
  const [questions, setQuestions] = useState([]);
  const [currentQuiz, setCurrentQuiz] = useState(null);
  const [quizType, setQuizType] = useState("balanced");
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [showApiModal, setShowApiModal] = useState(false);

  // Load saved state
  useEffect(() => {
    (async () => {
      if (!hasApiKey()) {
        setShowApiModal(true);
      }
      try {
        const saved = await storage.get("revision_state");
        if (saved) {
          const state = JSON.parse(saved.value);
          if (state.pdfText) {
            setPdfText(state.pdfText);
            setPdfFile({ name: state.fileName || "document.pdf" });
            setAxes(state.axes || []);
            setProgress(state.progress || {});
            setQuestions(state.questions || []);
            setHistory(state.history || []);
            if ((state.axes || []).length > 0) setView("dashboard");
          }
        }
      } catch (e) { /* no saved state */ }
    })();
  }, []);

  const saveState = async (updates = {}) => {
    try {
      const state = {
        pdfText, fileName: pdfFile?.name, axes, progress, questions, history,
        ...updates,
      };
      await storage.set("revision_state", JSON.stringify(state));
    } catch (e) { console.error("Save error:", e); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Veuillez uploader un fichier PDF.");
      return;
    }
    if (!hasApiKey()) {
      setError("Veuillez d'abord configurer votre clé API Anthropic.");
      setShowApiModal(true);
      return;
    }
    setError(null);
    setPdfFile(file);
    setView("loading");
    setLoadingMsg("Lecture du PDF...");

    try {
      const fullText = await extractPdfText(file, (current, total) => {
        setLoadingMsg(`Extraction page ${current}/${total}...`);
      });

      if (fullText.trim().length < 200) {
        setError("Le PDF semble vide ou contient principalement des images. Essayez un PDF avec du texte sélectionnable.");
        setView("home");
        return;
      }

      setPdfText(fullText);
      await analyzeDocument(fullText, file.name);
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la lecture du PDF : " + err.message);
      setView("home");
    }
  };

  const analyzeDocument = async (text, fileName) => {
    setLoadingMsg("L'IA analyse les axes thématiques...");
    try {
      const truncated = text.slice(0, 40000);
      const data = await callClaude({
        maxTokens: 4000,
        messages: [{
          role: "user",
          content: `Tu es un expert pédagogique. Analyse ce document et identifie les 4 à 7 grands axes/thèmes/chapitres principaux à réviser. Pour chacun, fournis un titre court (2-5 mots), une description d'une phrase, et une icône emoji représentative.

Réponds UNIQUEMENT avec du JSON valide, sans markdown, sans backticks, au format :
{
  "title": "Titre général du document",
  "axes": [
    {"id": "axe1", "title": "Titre court", "description": "Description...", "emoji": "📘"}
  ]
}

DOCUMENT :
${truncated}`,
        }],
      });
      const parsed = parseJsonFromResponse(data);

      const newAxes = parsed.axes.map((a) => ({ ...a, docTitle: parsed.title }));
      setAxes(newAxes);

      const initProgress = {};
      newAxes.forEach((a) => {
        initProgress[a.id] = { correct: 0, total: 0, mastery: 0, lastSeen: null, streak: 0 };
      });
      setProgress(initProgress);

      setLoadingMsg("Génération des questions de révision...");
      const allQuestions = await generateQuestions(truncated, newAxes);
      setQuestions(allQuestions);

      await saveState({
        pdfText: text, fileName, axes: newAxes,
        progress: initProgress, questions: allQuestions, history: [],
      });
      setView("dashboard");
    } catch (err) {
      console.error(err);
      setError("Erreur IA : " + err.message);
      setView("home");
    }
  };

  const generateQuestions = async (text, axesList) => {
    const data = await callClaude({
      maxTokens: 8000,
      messages: [{
        role: "user",
        content: `Tu es un professeur expert. Génère des questions de révision variées et pertinentes à partir de ce document, pour ces axes :

${axesList.map((a) => `- ${a.id}: ${a.title} (${a.description})`).join("\n")}

Pour CHAQUE axe, génère :
- 3 questions QCM (choix multiples, 4 options, une seule bonne réponse)
- 2 questions ouvertes (réponse courte de 1-3 phrases attendue)

Varie la difficulté (facile, moyen, difficile). Questions claires, non-triviales, basées strictement sur le document.

Réponds UNIQUEMENT avec du JSON valide, sans markdown :
{
  "questions": [
    {
      "id": "q1",
      "axisId": "axe1",
      "type": "mcq",
      "difficulty": "easy|medium|hard",
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "Pourquoi cette réponse..."
    },
    {
      "id": "q2",
      "axisId": "axe1",
      "type": "open",
      "difficulty": "medium",
      "question": "...",
      "expectedAnswer": "Réponse attendue détaillée",
      "keyPoints": ["point clé 1", "point clé 2"]
    }
  ]
}

DOCUMENT :
${text}`,
      }],
    });
    const parsed = parseJsonFromResponse(data);
    return parsed.questions.map((q, i) => ({
      ...q,
      id: q.id || `q_${Date.now()}_${i}`,
      timesAsked: 0,
      timesCorrect: 0,
      lastAsked: null,
    }));
  };

  const startQuiz = (type = "balanced", axisId = null) => {
    let pool = [...questions];

    if (axisId) {
      pool = pool.filter((q) => q.axisId === axisId);
    } else if (type === "weak") {
      const axisScores = axes.map((a) => ({
        id: a.id,
        mastery: progress[a.id]?.mastery || 0,
      })).sort((a, b) => a.mastery - b.mastery);
      const weakIds = axisScores.slice(0, Math.max(2, Math.ceil(axes.length / 2))).map((a) => a.id);
      pool = pool.filter((q) => weakIds.includes(q.axisId));
    } else if (type === "review") {
      const now = Date.now();
      pool = pool.filter((q) => {
        if (!q.lastAsked) return true;
        const daysSince = (now - q.lastAsked) / (1000 * 60 * 60 * 24);
        const successRate = q.timesAsked > 0 ? q.timesCorrect / q.timesAsked : 0;
        return successRate < 0.7 || daysSince > 1;
      });
    }

    if (pool.length === 0) pool = [...questions];

    pool = pool.sort((a, b) => {
      const aWeight = (a.timesAsked * 2) - ((a.timesAsked - a.timesCorrect) * 3);
      const bWeight = (b.timesAsked * 2) - ((b.timesAsked - b.timesCorrect) * 3);
      return aWeight - bWeight;
    });

    const selected = pool.slice(0, Math.min(8, pool.length));
    for (let i = selected.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [selected[i], selected[j]] = [selected[j], selected[i]];
    }

    setQuizType(type);
    setCurrentQuiz({
      questions: selected,
      currentIndex: 0,
      answers: [],
      startTime: Date.now(),
    });
    setView("quiz");
  };

  const submitAnswer = async (answer) => {
    const q = currentQuiz.questions[currentQuiz.currentIndex];
    let isCorrect = false;
    let feedback = "";

    if (q.type === "mcq") {
      isCorrect = answer === q.correctIndex;
      feedback = q.explanation;
    } else {
      const grading = await gradeOpenAnswer(q, answer);
      isCorrect = grading.correct;
      feedback = grading.feedback;
    }

    const newAnswer = { question: q, userAnswer: answer, isCorrect, feedback };
    const newAnswers = [...currentQuiz.answers, newAnswer];
    setCurrentQuiz({ ...currentQuiz, answers: newAnswers });
    return newAnswer;
  };

  const gradeOpenAnswer = async (q, answer) => {
    try {
      const data = await callClaude({
        maxTokens: 500,
        messages: [{
          role: "user",
          content: `Évalue cette réponse d'étudiant.

QUESTION : ${q.question}
RÉPONSE ATTENDUE : ${q.expectedAnswer}
POINTS CLÉS : ${(q.keyPoints || []).join(", ")}
RÉPONSE DE L'ÉTUDIANT : ${answer}

Réponds UNIQUEMENT avec du JSON, sans markdown :
{"correct": true/false, "feedback": "Explication bienveillante et constructive en 2-3 phrases. Si incorrect, donne la bonne réponse."}

Sois généreux : si l'étudiant a compris l'essentiel même sans la formulation exacte, considère comme correct.`,
        }],
      });
      return parseJsonFromResponse(data);
    } catch (e) {
      return { correct: false, feedback: "Impossible d'évaluer. Réponse attendue : " + q.expectedAnswer };
    }
  };

  const nextQuestion = () => {
    if (currentQuiz.currentIndex + 1 >= currentQuiz.questions.length) {
      finishQuiz();
    } else {
      setCurrentQuiz({ ...currentQuiz, currentIndex: currentQuiz.currentIndex + 1 });
    }
  };

  const finishQuiz = async () => {
    const correct = currentQuiz.answers.filter((a) => a.isCorrect).length;
    const total = currentQuiz.answers.length;

    const newProgress = { ...progress };
    const newQuestions = [...questions];
    const now = Date.now();

    currentQuiz.answers.forEach((a) => {
      const axisId = a.question.axisId;
      if (!newProgress[axisId]) newProgress[axisId] = { correct: 0, total: 0, mastery: 0, lastSeen: null, streak: 0 };
      newProgress[axisId].total += 1;
      if (a.isCorrect) {
        newProgress[axisId].correct += 1;
        newProgress[axisId].streak += 1;
      } else {
        newProgress[axisId].streak = 0;
      }
      newProgress[axisId].lastSeen = now;
      newProgress[axisId].mastery = Math.round(
        (newProgress[axisId].correct / newProgress[axisId].total) * 100
      );

      const qIdx = newQuestions.findIndex((q) => q.id === a.question.id);
      if (qIdx >= 0) {
        newQuestions[qIdx].timesAsked += 1;
        if (a.isCorrect) newQuestions[qIdx].timesCorrect += 1;
        newQuestions[qIdx].lastAsked = now;
      }
    });

    const newHistoryEntry = {
      date: now,
      type: quizType,
      score: correct,
      total,
      percentage: Math.round((correct / total) * 100),
      duration: Date.now() - currentQuiz.startTime,
    };
    const newHistory = [...history, newHistoryEntry];

    setProgress(newProgress);
    setQuestions(newQuestions);
    setHistory(newHistory);
    await saveState({ progress: newProgress, questions: newQuestions, history: newHistory });
    setView("results");
  };

  const globalMastery = useMemo(() => {
    const values = Object.values(progress).filter((p) => p.total > 0);
    if (values.length === 0) return 0;
    return Math.round(values.reduce((s, p) => s + p.mastery, 0) / values.length);
  }, [progress]);

  const weakestAxis = useMemo(() => {
    const attempted = axes.filter((a) => progress[a.id]?.total > 0);
    if (attempted.length === 0) return null;
    return attempted.reduce((min, a) =>
      progress[a.id].mastery < progress[min.id].mastery ? a : min
    );
  }, [axes, progress]);

  const resetAll = async () => {
    if (!confirm("Effacer toutes les données et recommencer ?")) return;
    await storage.delete("revision_state");
    setPdfFile(null); setPdfText(""); setAxes([]); setProgress({});
    setQuestions([]); setHistory([]); setCurrentQuiz(null); setView("home");
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-serif">
      <div className="grain" />

      <header className="border-b border-stone-200 bg-stone-50/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => axes.length > 0 && setView("dashboard")}>
            <div className="w-9 h-9 bg-stone-900 text-stone-50 flex items-center justify-center rounded-sm">
              <Brain className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight leading-none">Révise</div>
              <div className="text-[10px] mono text-stone-500 uppercase tracking-widest mt-0.5">Intelligence de révision</div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {axes.length > 0 && (
              <>
                <NavButton active={view === "dashboard"} onClick={() => setView("dashboard")} icon={Home}>Accueil</NavButton>
                <NavButton active={view === "stats"} onClick={() => setView("stats")} icon={BarChart3}>Stats</NavButton>
              </>
            )}
            <button onClick={() => setShowApiModal(true)} className="text-stone-400 hover:text-stone-900 p-2 transition-colors" title="Paramètres API">
              <Settings className="w-4 h-4" />
            </button>
            {axes.length > 0 && (
              <button onClick={resetAll} className="text-stone-400 hover:text-red-600 p-2 transition-colors" title="Tout effacer">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 relative z-[2]">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-800 flex items-start gap-3 animate-in">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800"><XCircle className="w-4 h-4" /></button>
          </div>
        )}

        {view === "home" && <HomeView onUpload={handleFileUpload} onConfigureApi={() => setShowApiModal(true)} />}
        {view === "loading" && <LoadingView message={loadingMsg} />}
        {view === "dashboard" && (
          <DashboardView
            pdfFile={pdfFile} axes={axes} progress={progress}
            globalMastery={globalMastery} weakestAxis={weakestAxis}
            history={history} onStartQuiz={startQuiz}
          />
        )}
        {view === "quiz" && currentQuiz && (
          <QuizView
            quiz={currentQuiz} axes={axes} onSubmit={submitAnswer}
            onNext={nextQuestion} onQuit={() => { setCurrentQuiz(null); setView("dashboard"); }}
          />
        )}
        {view === "results" && currentQuiz && (
          <ResultsView
            quiz={currentQuiz} axes={axes}
            onReturn={() => { setCurrentQuiz(null); setView("dashboard"); }}
            onRetry={() => startQuiz(quizType)}
          />
        )}
        {view === "stats" && <StatsView axes={axes} progress={progress} history={history} />}
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-8 mt-12 border-t border-stone-200 text-center text-xs mono text-stone-400 uppercase tracking-widest relative z-[2]">
        Apprendre · Analyser · Maîtriser
      </footer>

      {showApiModal && (
        <ApiKeyModal
          onClose={() => setShowApiModal(false)}
          currentKey={getApiKey()}
          onSave={(key) => { setApiKey(key); setShowApiModal(false); }}
        />
      )}
    </div>
  );
}

function NavButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm flex items-center gap-2 transition-all ${
        active ? "bg-stone-900 text-stone-50" : "text-stone-600 hover:bg-stone-200"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

function HomeView({ onUpload, onConfigureApi }) {
  const keySet = hasApiKey();
  return (
    <div className="animate-in">
      <div className="text-center mb-12 pt-8">
        <div className="inline-block mb-4">
          <span className="mono text-xs uppercase tracking-[0.3em] text-stone-500 border border-stone-300 px-3 py-1">
            v1.0 · Outil de révision
          </span>
        </div>
        <h1 className="text-6xl md:text-7xl font-bold tracking-tight leading-none mb-4">
          Révisez <em className="text-orange-600" style={{ fontStyle: "italic" }}>intelligemment</em>.
        </h1>
        <p className="text-xl text-stone-600 max-w-2xl mx-auto leading-relaxed">
          Uploadez un PDF. L'IA identifie les axes clés, génère des questions adaptées,
          et priorise vos points faibles dans des quiz ciblés.
        </p>
      </div>

      {!keySet && (
        <div className="max-w-2xl mx-auto mb-6 p-4 bg-amber-50 border-l-4 border-amber-600 flex items-start gap-3">
          <Key className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-amber-900">Clé API requise</div>
            <div className="text-sm text-amber-800">Configurez votre clé API Anthropic pour utiliser l'outil.</div>
          </div>
          <button onClick={onConfigureApi} className="bg-amber-900 text-amber-50 px-4 py-2 text-sm font-semibold hover:bg-amber-950">
            Configurer
          </button>
        </div>
      )}

      <label className={`block max-w-2xl mx-auto cursor-pointer group ${!keySet ? "opacity-50 pointer-events-none" : ""}`}>
        <input type="file" accept="application/pdf" onChange={onUpload} className="hidden" />
        <div className="border-2 border-dashed border-stone-300 group-hover:border-orange-600 group-hover:bg-orange-50/30 transition-all p-16 text-center rounded-sm">
          <div className="w-16 h-16 bg-stone-900 text-stone-50 mx-auto flex items-center justify-center mb-6 group-hover:bg-orange-600 transition-colors">
            <Upload className="w-7 h-7" strokeWidth={2} />
          </div>
          <div className="text-2xl font-semibold mb-2">Déposer votre PDF</div>
          <div className="text-sm text-stone-500 mono uppercase tracking-wider">Cliquer pour sélectionner</div>
        </div>
      </label>

      <div className="grid md:grid-cols-3 gap-6 mt-16 max-w-5xl mx-auto">
        <FeatureCard icon={Target} title="Axes thématiques" desc="L'IA extrait automatiquement les chapitres et thèmes clés de votre document." />
        <FeatureCard icon={Zap} title="Quiz points faibles" desc="Un mode dédié qui cible en priorité vos axes de moindre maîtrise." />
        <FeatureCard icon={TrendingUp} title="Progression mesurée" desc="Suivez votre maîtrise par axe avec des pourcentages et l'historique complet." />
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }) {
  return (
    <div className="p-6 bg-white border border-stone-200 hover:border-stone-900 transition-colors rounded-sm">
      <Icon className="w-6 h-6 text-orange-600 mb-3" strokeWidth={2} />
      <div className="font-semibold text-lg mb-1">{title}</div>
      <div className="text-sm text-stone-600 leading-relaxed">{desc}</div>
    </div>
  );
}

function LoadingView({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 animate-in">
      <div className="relative mb-8">
        <div className="w-20 h-20 border-4 border-stone-200 border-t-orange-600 rounded-full animate-spin" />
        <Brain className="w-8 h-8 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-stone-900" />
      </div>
      <div className="text-2xl font-semibold mb-2">{message || "Chargement..."}</div>
      <div className="text-sm mono text-stone-500 uppercase tracking-wider">Cela peut prendre quelques instants</div>
    </div>
  );
}

function DashboardView({ pdfFile, axes, progress, globalMastery, weakestAxis, history, onStartQuiz }) {
  const totalQuestions = Object.values(progress).reduce((s, p) => s + p.total, 0);
  const lastScore = history.length > 0 ? history[history.length - 1].percentage : null;
  const trend = history.length >= 2
    ? history[history.length - 1].percentage - history[history.length - 2].percentage
    : 0;

  return (
    <div className="animate-in">
      <div className="flex items-start justify-between mb-8 pb-6 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs mono uppercase tracking-widest text-stone-500">
            <FileText className="w-3.5 h-3.5" />
            {pdfFile?.name || "Document"}
          </div>
          <h1 className="text-4xl font-bold tracking-tight">{axes[0]?.docTitle || "Révisions"}</h1>
          <div className="text-stone-600 mt-1">{axes.length} axes · {totalQuestions} questions répondues</div>
        </div>
        <div className="text-right">
          <div className="text-6xl font-bold">
            <span className={globalMastery >= 70 ? "text-green-600" : globalMastery >= 40 ? "text-orange-600" : "text-stone-900"}>
              {globalMastery}
            </span>
            <span className="text-2xl text-stone-400">%</span>
          </div>
          <div className="text-xs mono uppercase tracking-widest text-stone-500">Maîtrise globale</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-10">
        <QuizCard
          icon={Sparkles} title="Quiz équilibré" desc="8 questions variées sur tous les axes"
          color="bg-stone-900 text-stone-50" onClick={() => onStartQuiz("balanced")}
        />
        <QuizCard
          icon={Flame} title="Points faibles" desc={weakestAxis ? `Focus sur "${weakestAxis.title}"` : "Ciblez vos axes les plus faibles"}
          color="bg-orange-600 text-white" onClick={() => onStartQuiz("weak")} highlight={!!weakestAxis}
        />
        <QuizCard
          icon={Clock} title="Révision espacée" desc="Questions à revoir selon le temps"
          color="bg-white text-stone-900 border-2 border-stone-900" onClick={() => onStartQuiz("review")}
        />
      </div>

      {history.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-10">
          <StatBox label="Quiz effectués" value={history.length} mono />
          <StatBox label="Dernier score" value={lastScore !== null ? `${lastScore}%` : "—"}
            trend={trend !== 0 ? trend : null} />
          <StatBox label="Questions totales" value={totalQuestions} mono />
        </div>
      )}

      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Axes de révision</h2>
        <div className="text-xs mono uppercase tracking-widest text-stone-500">Cliquez pour un quiz ciblé</div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {axes.map((axis, i) => (
          <AxisCard key={axis.id} axis={axis} progress={progress[axis.id]}
            onClick={() => onStartQuiz("axis", axis.id)} delay={i * 60} />
        ))}
      </div>
    </div>
  );
}

function QuizCard({ icon: Icon, title, desc, color, onClick, highlight }) {
  return (
    <button onClick={onClick} className={`${color} p-6 text-left group transition-all hover:scale-[1.02] hover:shadow-xl rounded-sm ${highlight ? "pulse-ring" : ""}`}>
      <Icon className="w-7 h-7 mb-4" strokeWidth={2} />
      <div className="text-xl font-bold mb-1">{title}</div>
      <div className="text-sm opacity-80 mb-4">{desc}</div>
      <div className="flex items-center gap-1 text-xs mono uppercase tracking-wider opacity-70 group-hover:opacity-100 group-hover:gap-2 transition-all">
        Commencer <ArrowRight className="w-3 h-3" />
      </div>
    </button>
  );
}

function StatBox({ label, value, trend, mono }) {
  return (
    <div className="bg-white border border-stone-200 p-4 rounded-sm">
      <div className="text-xs mono uppercase tracking-widest text-stone-500 mb-2">{label}</div>
      <div className={`text-3xl font-bold ${mono ? "mono" : ""}`}>
        {value}
        {trend !== null && trend !== undefined && (
          <span className={`ml-2 text-sm ${trend > 0 ? "text-green-600" : "text-red-600"}`}>
            {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  );
}

function AxisCard({ axis, progress, onClick, delay = 0 }) {
  const p = progress || { mastery: 0, total: 0, correct: 0, streak: 0 };
  const masteryColor = p.total === 0 ? "bg-stone-300" :
    p.mastery >= 70 ? "bg-green-600" :
    p.mastery >= 40 ? "bg-orange-500" : "bg-red-500";

  return (
    <button onClick={onClick}
      className="bg-white border border-stone-200 hover:border-stone-900 p-5 text-left group transition-all rounded-sm animate-in"
      style={{ animationDelay: `${delay}ms`, opacity: 0 }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl">{axis.emoji || "📘"}</div>
          <div>
            <div className="font-semibold text-lg leading-tight">{axis.title}</div>
            <div className="text-xs text-stone-500 mt-0.5 line-clamp-1">{axis.description}</div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-900 group-hover:translate-x-1 transition-all" />
      </div>
      <div className="space-y-2">
        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
          <div className={`h-full ${masteryColor} transition-all duration-700`} style={{ width: `${p.mastery}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs mono">
          <span className="text-stone-500 uppercase tracking-wider">
            {p.total === 0 ? "Pas encore testé" : `${p.correct}/${p.total} correct`}
          </span>
          <span className="font-bold">
            {p.mastery}% {p.streak >= 3 && <Flame className="w-3 h-3 inline text-orange-500 ml-1" />}
          </span>
        </div>
      </div>
    </button>
  );
}

function QuizView({ quiz, axes, onSubmit, onNext, onQuit }) {
  const [selected, setSelected] = useState(null);
  const [openAnswer, setOpenAnswer] = useState("");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const q = quiz.questions[quiz.currentIndex];
  const axis = axes.find((a) => a.id === q.axisId);
  const progressPct = (quiz.currentIndex / quiz.questions.length) * 100;

  useEffect(() => {
    setSelected(null); setOpenAnswer(""); setResult(null); setSubmitting(false);
  }, [quiz.currentIndex]);

  const handleSubmit = async () => {
    if (q.type === "mcq" && selected === null) return;
    if (q.type === "open" && !openAnswer.trim()) return;
    setSubmitting(true);
    const answer = q.type === "mcq" ? selected : openAnswer;
    const res = await onSubmit(answer);
    setResult(res);
    setSubmitting(false);
  };

  return (
    <div className="animate-in max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2 text-xs mono uppercase tracking-widest">
          <span className="text-stone-500">Question {quiz.currentIndex + 1} / {quiz.questions.length}</span>
          <button onClick={onQuit} className="text-stone-400 hover:text-red-600 transition-colors">Quitter</button>
        </div>
        <div className="h-1 bg-stone-200 rounded-full overflow-hidden">
          <div className="h-full bg-stone-900 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="bg-white border border-stone-200 p-8 mb-6 rounded-sm">
        <div className="flex items-center gap-2 mb-4 text-xs mono uppercase tracking-widest">
          <span className="bg-stone-100 px-2 py-1">{axis?.emoji} {axis?.title}</span>
          <span className={`px-2 py-1 ${
            q.difficulty === "easy" ? "bg-green-50 text-green-700" :
            q.difficulty === "hard" ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"
          }`}>{q.difficulty}</span>
          <span className="text-stone-400">{q.type === "mcq" ? "QCM" : "Ouverte"}</span>
        </div>
        <h2 className="text-2xl font-semibold mb-6 leading-snug">{q.question}</h2>

        {q.type === "mcq" && (
          <div className="space-y-2">
            {q.options.map((opt, i) => {
              const isSelected = selected === i;
              const isCorrect = result && i === q.correctIndex;
              const isWrong = result && isSelected && i !== q.correctIndex;
              return (
                <button
                  key={i}
                  onClick={() => !result && setSelected(i)}
                  disabled={!!result}
                  className={`w-full text-left p-4 border-2 transition-all flex items-center gap-3 ${
                    isCorrect ? "border-green-600 bg-green-50" :
                    isWrong ? "border-red-600 bg-red-50" :
                    isSelected ? "border-stone-900 bg-stone-50" :
                    "border-stone-200 hover:border-stone-400"
                  }`}
                >
                  <div className={`w-7 h-7 flex-shrink-0 flex items-center justify-center mono text-sm font-semibold ${
                    isCorrect ? "bg-green-600 text-white" :
                    isWrong ? "bg-red-600 text-white" :
                    isSelected ? "bg-stone-900 text-white" :
                    "bg-stone-100 text-stone-600"
                  }`}>
                    {isCorrect ? <CheckCircle2 className="w-4 h-4" /> :
                     isWrong ? <XCircle className="w-4 h-4" /> :
                     String.fromCharCode(65 + i)}
                  </div>
                  <span className="flex-1">{opt}</span>
                </button>
              );
            })}
          </div>
        )}

        {q.type === "open" && (
          <div>
            <textarea
              value={openAnswer}
              onChange={(e) => setOpenAnswer(e.target.value)}
              disabled={!!result}
              placeholder="Rédigez votre réponse ici..."
              className="w-full p-4 border-2 border-stone-200 focus:border-stone-900 focus:outline-none min-h-[120px] resize-none font-serif"
            />
            <div className="text-xs mono text-stone-400 mt-1 uppercase tracking-wider">
              {openAnswer.length} caractères
            </div>
          </div>
        )}

        {result && (
          <div className={`mt-6 p-5 border-l-4 animate-in ${
            result.isCorrect ? "border-green-600 bg-green-50" : "border-red-600 bg-red-50"
          }`}>
            <div className="flex items-start gap-3">
              {result.isCorrect ? <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                : <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">
                <div className={`font-semibold mb-1 ${result.isCorrect ? "text-green-800" : "text-red-800"}`}>
                  {result.isCorrect ? "Bonne réponse !" : "Pas tout à fait..."}
                </div>
                <div className="text-sm text-stone-700 leading-relaxed">{result.feedback}</div>
                {!result.isCorrect && q.type === "open" && q.expectedAnswer && (
                  <div className="mt-3 pt-3 border-t border-red-200">
                    <div className="text-xs mono uppercase tracking-wider text-stone-500 mb-1">Réponse attendue</div>
                    <div className="text-sm text-stone-700 italic">{q.expectedAnswer}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        {!result ? (
          <button
            onClick={handleSubmit}
            disabled={submitting || (q.type === "mcq" ? selected === null : !openAnswer.trim())}
            className="bg-stone-900 text-stone-50 px-8 py-3 font-semibold hover:bg-orange-600 transition-colors disabled:bg-stone-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Évaluation...</> : <>Valider <ArrowRight className="w-4 h-4" /></>}
          </button>
        ) : (
          <button
            onClick={onNext}
            className="bg-stone-900 text-stone-50 px-8 py-3 font-semibold hover:bg-orange-600 transition-colors flex items-center gap-2"
          >
            {quiz.currentIndex + 1 >= quiz.questions.length ? "Voir les résultats" : "Suivante"}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function ResultsView({ quiz, axes, onReturn, onRetry }) {
  const correct = quiz.answers.filter((a) => a.isCorrect).length;
  const total = quiz.answers.length;
  const percentage = Math.round((correct / total) * 100);
  const duration = Math.round((Date.now() - quiz.startTime) / 1000);

  const byAxis = {};
  quiz.answers.forEach((a) => {
    const axisId = a.question.axisId;
    if (!byAxis[axisId]) byAxis[axisId] = { correct: 0, total: 0 };
    byAxis[axisId].total += 1;
    if (a.isCorrect) byAxis[axisId].correct += 1;
  });

  const message = percentage >= 80 ? "Excellent travail !" :
                  percentage >= 60 ? "Bien joué, continuez !" :
                  percentage >= 40 ? "En progression" : "On va y travailler";
  const color = percentage >= 80 ? "text-green-600" :
                percentage >= 60 ? "text-orange-600" : "text-red-600";

  return (
    <div className="animate-in max-w-3xl mx-auto">
      <div className="text-center py-12 mb-8">
        <div className="text-xs mono uppercase tracking-[0.3em] text-stone-500 mb-4">Résultats du quiz</div>
        <div className="text-8xl md:text-9xl font-bold tracking-tighter mb-2">
          <span className={color}>{percentage}</span><span className="text-stone-300">%</span>
        </div>
        <div className="text-2xl font-semibold mb-2">{message}</div>
        <div className="text-stone-600 mono text-sm uppercase tracking-wider">
          {correct} / {total} correct · {duration}s
        </div>
      </div>

      <div className="mb-8">
        <h3 className="font-semibold text-lg mb-4">Détail par axe</h3>
        <div className="space-y-2">
          {Object.entries(byAxis).map(([axisId, stats]) => {
            const axis = axes.find((a) => a.id === axisId);
            const pct = Math.round((stats.correct / stats.total) * 100);
            return (
              <div key={axisId} className="bg-white border border-stone-200 p-4 flex items-center gap-4">
                <div className="text-2xl">{axis?.emoji}</div>
                <div className="flex-1">
                  <div className="font-semibold">{axis?.title}</div>
                  <div className="h-1.5 bg-stone-100 rounded-full mt-2 overflow-hidden">
                    <div className={`h-full ${pct >= 70 ? "bg-green-600" : pct >= 40 ? "bg-orange-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">{pct}%</div>
                  <div className="text-xs mono text-stone-500">{stats.correct}/{stats.total}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="font-semibold text-lg mb-4">Révisions par question</h3>
        <div className="space-y-2">
          {quiz.answers.map((a, i) => (
            <details key={i} className="bg-white border border-stone-200 p-4 group">
              <summary className="cursor-pointer flex items-center gap-3 list-none">
                {a.isCorrect ? <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  : <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
                <span className="flex-1 font-medium text-sm line-clamp-1">{a.question.question}</span>
                <ChevronRight className="w-4 h-4 text-stone-400 group-open:rotate-90 transition-transform" />
              </summary>
              <div className="mt-3 pt-3 border-t border-stone-100 text-sm text-stone-700 leading-relaxed">
                {a.feedback}
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        <button onClick={onRetry} className="bg-white border-2 border-stone-900 text-stone-900 px-6 py-3 font-semibold hover:bg-stone-900 hover:text-stone-50 transition-colors flex items-center gap-2">
          <RotateCcw className="w-4 h-4" /> Nouveau quiz
        </button>
        <button onClick={onReturn} className="bg-stone-900 text-stone-50 px-6 py-3 font-semibold hover:bg-orange-600 transition-colors flex items-center gap-2">
          <Home className="w-4 h-4" /> Retour au tableau de bord
        </button>
      </div>
    </div>
  );
}

function StatsView({ axes, progress, history }) {
  const totalQuestions = Object.values(progress).reduce((s, p) => s + p.total, 0);
  const totalCorrect = Object.values(progress).reduce((s, p) => s + p.correct, 0);
  const overallPct = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  const sortedAxes = [...axes].sort((a, b) =>
    (progress[a.id]?.mastery || 0) - (progress[b.id]?.mastery || 0)
  );

  const maxHistPts = 20;
  const histToShow = history.slice(-maxHistPts);

  return (
    <div className="animate-in">
      <div className="mb-8 pb-6 border-b border-stone-200">
        <div className="text-xs mono uppercase tracking-[0.3em] text-stone-500 mb-2">Analyse</div>
        <h1 className="text-4xl font-bold tracking-tight">Statistiques détaillées</h1>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-10">
        <StatBox label="Maîtrise globale" value={`${overallPct}%`} />
        <StatBox label="Quiz effectués" value={history.length} mono />
        <StatBox label="Questions répondues" value={totalQuestions} mono />
        <StatBox label="Bonnes réponses" value={totalCorrect} mono />
      </div>

      {histToShow.length >= 2 && (
        <div className="bg-white border border-stone-200 p-6 mb-8">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-600" />
            Évolution des scores
          </h3>
          <svg viewBox="0 0 600 200" className="w-full h-48">
            <line x1="40" y1="10" x2="40" y2="180" stroke="#e7e5e4" strokeWidth="1" />
            <line x1="40" y1="180" x2="590" y2="180" stroke="#e7e5e4" strokeWidth="1" />
            {[0, 25, 50, 75, 100].map((val) => (
              <g key={val}>
                <text x="30" y={180 - val * 1.6 + 4} textAnchor="end" fontSize="10" fill="#a8a29e" className="mono">{val}</text>
                <line x1="40" y1={180 - val * 1.6} x2="590" y2={180 - val * 1.6} stroke="#f5f5f4" strokeWidth="1" />
              </g>
            ))}
            {histToShow.length > 1 && (
              <polyline
                fill="none" stroke="#ea580c" strokeWidth="2"
                points={histToShow.map((h, i) => {
                  const x = 40 + (i / (histToShow.length - 1)) * 550;
                  const y = 180 - h.percentage * 1.6;
                  return `${x},${y}`;
                }).join(" ")}
              />
            )}
            {histToShow.map((h, i) => {
              const x = histToShow.length === 1 ? 315 : 40 + (i / (histToShow.length - 1)) * 550;
              const y = 180 - h.percentage * 1.6;
              return <circle key={i} cx={x} cy={y} r="4" fill="#1c1917" />;
            })}
          </svg>
          <div className="text-xs mono text-stone-500 uppercase tracking-wider mt-2 text-center">
            Des {histToShow.length} derniers quiz
          </div>
        </div>
      )}

      <div className="mb-8">
        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-orange-600" />
          Classement des axes (du plus faible au plus fort)
        </h3>
        <div className="space-y-2">
          {sortedAxes.map((axis, i) => {
            const p = progress[axis.id] || { mastery: 0, total: 0, correct: 0 };
            return (
              <div key={axis.id} className="bg-white border border-stone-200 p-4 flex items-center gap-4">
                <div className="mono text-sm text-stone-400 w-6">#{i + 1}</div>
                <div className="text-2xl">{axis.emoji}</div>
                <div className="flex-1">
                  <div className="font-semibold">{axis.title}</div>
                  <div className="text-xs text-stone-500">{p.total} questions · {p.correct} correctes</div>
                </div>
                <div className="w-32">
                  <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div className={`h-full ${p.mastery >= 70 ? "bg-green-600" : p.mastery >= 40 ? "bg-orange-500" : p.total === 0 ? "bg-stone-300" : "bg-red-500"}`}
                      style={{ width: `${p.mastery}%` }} />
                  </div>
                </div>
                <div className="text-right w-16">
                  <div className="font-bold text-lg">{p.total === 0 ? "—" : `${p.mastery}%`}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {sortedAxes.length > 0 && sortedAxes[0] && progress[sortedAxes[0].id]?.total > 0 && (
        <div className="bg-orange-50 border-l-4 border-orange-600 p-6">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-6 h-6 text-orange-600 flex-shrink-0" />
            <div>
              <div className="font-semibold text-lg mb-2">Recommandation</div>
              <div className="text-stone-700 leading-relaxed">
                Concentrez-vous sur <strong>"{sortedAxes[0].title}"</strong> ({progress[sortedAxes[0].id]?.mastery}% de maîtrise).
                Lancez le quiz "Points faibles" pour cibler vos axes les plus fragiles.
              </div>
            </div>
          </div>
        </div>
      )}

      {history.length === 0 && (
        <div className="text-center py-16 text-stone-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <div>Aucune donnée pour l'instant. Lancez votre premier quiz !</div>
        </div>
      )}
    </div>
  );
}
