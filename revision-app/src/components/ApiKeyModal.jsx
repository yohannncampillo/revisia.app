import React, { useState } from "react";
import { Key, X, ExternalLink, Eye, EyeOff } from "lucide-react";

export default function ApiKeyModal({ onClose, currentKey, onSave }) {
  const [key, setKey] = useState(currentKey || "");
  const [show, setShow] = useState(false);

  const handleSave = () => {
    onSave(key);
  };

  const masked = currentKey ? currentKey.slice(0, 10) + "..." + currentKey.slice(-4) : "";

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in">
      <div className="bg-stone-50 max-w-lg w-full border border-stone-300 shadow-2xl">
        <div className="p-6 border-b border-stone-200 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-stone-900 text-stone-50 flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-xl tracking-tight">Clé API Anthropic</h2>
              <p className="text-xs mono uppercase tracking-widest text-stone-500 mt-1">
                Configuration requise
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-stone-700 leading-relaxed mb-4">
            Pour utiliser cet outil, vous avez besoin d'une clé API Anthropic. Elle sera stockée
            localement dans votre navigateur (aucun serveur tiers).
          </p>

          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 font-semibold mb-4"
          >
            Obtenir une clé API <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {currentKey && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-sm">
              <span className="font-semibold text-green-800">Clé actuelle : </span>
              <span className="mono text-green-700">{masked}</span>
            </div>
          )}

          <label className="block">
            <span className="text-xs mono uppercase tracking-widest text-stone-500 mb-2 block">
              Votre clé API
            </span>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="w-full p-3 pr-12 border-2 border-stone-200 focus:border-stone-900 focus:outline-none mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-900"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>

          <div className="mt-4 p-3 bg-amber-50 border-l-4 border-amber-500 text-xs text-amber-900 leading-relaxed">
            <strong>Note de sécurité :</strong> votre clé est stockée dans le localStorage de votre
            navigateur et envoyée directement à l'API Anthropic. Ne partagez pas cette clé.
          </div>
        </div>

        <div className="p-6 border-t border-stone-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 text-stone-600 hover:text-stone-900 text-sm font-semibold"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={!key.trim()}
            className="bg-stone-900 text-stone-50 px-6 py-2 font-semibold hover:bg-orange-600 transition-colors disabled:bg-stone-300 disabled:cursor-not-allowed text-sm"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
