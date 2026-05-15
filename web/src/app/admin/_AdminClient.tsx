"use client";

import { useState } from "react";

type Threshold = {
  id: number;
  name: string;
  description: string;
  value: number;
  color: string;
  dash_style: string;
};

const DASH_OPTIONS = [
  { value: "solid", label: "Solide" },
  { value: "dash", label: "Tiret" },
  { value: "dot", label: "Points" },
  { value: "dashdot", label: "Tiret-point" },
  { value: "longdash", label: "Tiret long" },
];

export default function AdminClient({
  initialThresholds,
  authed,
}: {
  initialThresholds: Threshold[];
  authed: boolean;
}) {
  const [isAuthed, setIsAuthed] = useState(authed);
  const [thresholds, setThresholds] = useState(initialThresholds);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (r.ok) {
      setIsAuthed(true);
      const data = await fetch("/api/thresholds").then((r) => r.json());
      setThresholds(data.thresholds);
      setPassword("");
    } else {
      setError("Mot de passe incorrect");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setIsAuthed(false);
    setThresholds([]);
  }

  async function refresh() {
    const data = await fetch("/api/thresholds").then((r) => r.json());
    setThresholds(data.thresholds);
  }

  if (!isAuthed) {
    return (
      <form onSubmit={login} className="max-w-sm mt-10 mx-auto space-y-3">
        <h2 className="text-base font-semibold">🔐 Admin</h2>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          autoFocus
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          className="w-full bg-blue-600 text-white px-3 py-2 rounded font-semibold"
        >
          Se connecter
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-semibold">⚙️ Seuils</h2>
        <button onClick={logout} className="text-xs text-slate-500 underline">
          Déconnexion
        </button>
      </div>

      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-500 px-4 py-3 text-xs leading-relaxed space-y-2">
        <p className="font-medium text-sm">ℹ️ À quoi servent les seuils ?</p>
        <p>
          Chaque seuil est une <strong>valeur critique en mètres NGF</strong> (ex: <code>663.00</code>) qui est utilisée
          à deux endroits :
        </p>
        <ol className="list-decimal ml-5 space-y-1">
          <li>
            <strong>Sur les graphs</strong> — une ligne horizontale en pointillés (couleur et style configurables)
            apparaît sur tous les graphs pour visualiser à quel niveau se trouve le seuil par rapport au niveau actuel.
          </li>
          <li>
            <strong>Dans le prompt GPT</strong> — chaque seuil (nom + description + valeur) est injecté dans le prompt
            envoyé à GPT-4o chaque matin pour générer la phrase de tendance. Plus la description est riche,
            plus l&apos;IA peut nuancer sa recommandation.
          </li>
        </ol>
        <p className="pt-1">
          <strong>Exemple de description utile</strong> : pour un seuil "Coque touche le fond" à 663 m, écrire dans la description
          quelque chose comme <em>« À ce niveau, le bateau s&apos;échoue sur le sable. Il faut absolument le déplacer
          vers la zone profonde près de la digue. »</em> — l&apos;IA pourra alors s&apos;en servir pour conseiller
          précisément quoi faire.
        </p>
      </div>

      <ThresholdForm onSaved={refresh} />
      <div className="space-y-2">
        {thresholds.map((t) => (
          <ThresholdItem key={t.id} t={t} onChanged={refresh} />
        ))}
        {thresholds.length === 0 && (
          <p className="text-sm text-slate-500">Aucun seuil défini.</p>
        )}
      </div>
    </div>
  );
}

function ThresholdForm({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState(665);
  const [color, setColor] = useState("#2563eb");
  const [dashStyle, setDashStyle] = useState("dash");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, value, color, dash_style: dashStyle }),
    });
    if (r.ok) {
      setOpen(false);
      setName("");
      setDescription("");
      onSaved();
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-sm bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded p-3"
      >
        + Ajouter un seuil
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-3 space-y-2"
    >
      <input
        className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
        placeholder="Nom"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <textarea
        className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />
      <div className="flex gap-2 items-center text-sm">
        <input
          type="number"
          step="0.01"
          min={630}
          max={680}
          value={value}
          onChange={(e) => setValue(Number.parseFloat(e.target.value))}
          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent w-24"
        />
        <span className="text-xs text-slate-500">m</span>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 w-8 rounded"
        />
        <select
          value={dashStyle}
          onChange={(e) => setDashStyle(e.target.value)}
          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm flex-1"
        >
          {DASH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-semibold"
        >
          Enregistrer
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm">
          Annuler
        </button>
      </div>
    </form>
  );
}

function ThresholdItem({
  t,
  onChanged,
}: {
  t: Threshold;
  onChanged: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(t.name);
  const [description, setDescription] = useState(t.description);
  const [value, setValue] = useState(t.value);
  const [color, setColor] = useState(t.color);
  const [dashStyle, setDashStyle] = useState(t.dash_style);

  async function save() {
    await fetch(`/api/thresholds/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, value, color, dash_style: dashStyle }),
    });
    setEdit(false);
    onChanged();
  }
  async function del() {
    if (!confirm(`Supprimer "${t.name}" ?`)) return;
    await fetch(`/api/thresholds/${t.id}`, { method: "DELETE" });
    onChanged();
  }

  if (!edit) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: t.color }}
            />
            <span className="font-medium text-sm">{t.name}</span>
            <span className="text-xs text-slate-500">{t.value.toFixed(2)} m</span>
          </div>
          {t.description && (
            <p className="text-xs text-slate-500 mt-1">{t.description}</p>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setEdit(true)}
            className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800"
          >
            Modifier
          </button>
          <button
            onClick={del}
            className="text-xs px-2 py-1 rounded bg-red-50 dark:bg-red-950 text-red-600"
          >
            Suppr.
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-3 space-y-2">
      <input
        className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />
      <div className="flex gap-2 items-center text-sm">
        <input
          type="number"
          step="0.01"
          min={630}
          max={680}
          value={value}
          onChange={(e) => setValue(Number.parseFloat(e.target.value))}
          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent w-24"
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 w-8 rounded"
        />
        <select
          value={dashStyle}
          onChange={(e) => setDashStyle(e.target.value)}
          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm flex-1"
        >
          {DASH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={save}
          className="flex-1 bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-semibold"
        >
          Sauver
        </button>
        <button onClick={() => setEdit(false)} className="px-3 py-1.5 text-sm">
          Annuler
        </button>
      </div>
    </div>
  );
}
