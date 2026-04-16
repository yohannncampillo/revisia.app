// Anthropic API wrapper - uses API key from localStorage

const API_KEY_STORAGE = "revise_api_key";

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || "";
}

export function setApiKey(key) {
  if (key && key.trim()) {
    localStorage.setItem(API_KEY_STORAGE, key.trim());
  } else {
    localStorage.removeItem(API_KEY_STORAGE);
  }
}

export function hasApiKey() {
  return !!getApiKey();
}

export async function callClaude({ messages, maxTokens = 4000, model = "claude-sonnet-4-20250514" }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Clé API manquante. Veuillez la saisir dans les paramètres.");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    let errorMsg = `Erreur API (${res.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      errorMsg = parsed.error?.message || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  return res.json();
}

export function parseJsonFromResponse(data) {
  const text = data.content[0].text.replace(/```json|```/g, "").trim();
  return JSON.parse(text);
}
