"use client";

import { useEffect, useState } from "react";

type Threshold = {
  id: number;
  name: string;
  description: string;
  value: number;
  color: string;
  dash_style: string;
};

type AiPolicy = {
  enabled: boolean;
  high_season_months: string;
  high_season_hours: string;
  low_season_hours: string;
  last_run_at: string | null;
  last_run_status: "ok" | "failed" | null;
  last_error: string | null;
};

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

function parseCsvInts(csv: string): Set<number> {
  return new Set(
    csv
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n))
  );
}

function toggleInSet(set: Set<number>, v: number): Set<number> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

function setToCsv(s: Set<number>): string {
  return Array.from(s).sort((a, b) => a - b).join(",");
}

function relativeAgeFr(iso: string | null): string {
  if (!iso) return "jamais";
  const t = new Date(iso.replace(" ", "T") + "Z").getTime();
  const min = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-semibold">⚙️ Panel admin</h2>
        <button onClick={logout} className="text-xs text-slate-500 underline">
          Déconnexion
        </button>
      </div>

      <AiPolicySection />

      <h3 className="text-base font-semibold pt-4">📍 Seuils</h3>

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

function AiPolicySection() {
  const [policy, setPolicy] = useState<AiPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Dérivés en sets pour faciliter le toggle des checkboxes
  const monthsSet = policy ? parseCsvInts(policy.high_season_months) : new Set<number>();
  const highHoursSet = policy ? parseCsvInts(policy.high_season_hours) : new Set<number>();
  const lowHoursSet = policy ? parseCsvInts(policy.low_season_hours) : new Set<number>();

  useEffect(() => {
    fetch("/api/admin/ai/policy")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setPolicy(d.policy);
      });
  }, []);

  async function save(patch: Partial<AiPolicy>) {
    if (!policy) return;
    setSaving(true);
    setMsg(null);
    const next = { ...policy, ...patch };
    const r = await fetch("/api/admin/ai/policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: next.enabled,
        high_season_months: next.high_season_months,
        high_season_hours: next.high_season_hours,
        low_season_hours: next.low_season_hours,
      }),
    });
    const d = await r.json();
    setSaving(false);
    if (d.ok) {
      setPolicy(d.policy);
      setMsg("✓ enregistré");
      setTimeout(() => setMsg(null), 1500);
    } else {
      setMsg("Erreur enregistrement");
    }
  }

  async function regenerate() {
    if (!confirm("Lancer la régénération maintenant des 2 phrases IA ?")) return;
    setRegenerating(true);
    setMsg(null);
    const r = await fetch("/api/admin/ai/regenerate", { method: "POST" });
    const d = await r.json();
    setRegenerating(false);
    if (d.ok) {
      setMsg("✓ régénération lancée (résultat dans ~30 sec)");
      // Refresh le status au bout de 35 sec pour montrer le résultat
      setTimeout(() => {
        fetch("/api/admin/ai/policy")
          .then((r) => r.json())
          .then((d) => d.ok && setPolicy(d.policy));
      }, 35_000);
    } else if (d.error === "rate_limited") {
      setMsg(`⏳ Attends encore ${d.retry_after_seconds}s avant de relancer`);
    } else {
      setMsg(`Erreur : ${d.error ?? "inconnu"}`);
    }
  }

  if (!policy) {
    return <div className="text-sm text-slate-500">Chargement de la policy IA…</div>;
  }

  const statusColor =
    policy.last_run_status === "failed"
      ? "text-red-600"
      : policy.last_run_status === "ok"
      ? "text-emerald-600"
      : "text-slate-500";
  const statusLabel =
    policy.last_run_status === "failed"
      ? "⚠️ erreur"
      : policy.last_run_status === "ok"
      ? "✓ ok"
      : "—";

  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">🤖 Phrases IA</h3>

      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-500 px-4 py-3 text-xs leading-relaxed space-y-2">
        <p className="font-medium text-sm">ℹ️ Comment ça marche</p>
        <p>
          Un worker tourne <strong>toutes les heures à xx:55</strong>{" "}(heure de Paris). À chaque tick :
        </p>
        <ol className="list-decimal ml-5 space-y-0.5">
          <li>il regarde si le <em>mois courant</em> est dans la liste « haute saison » ;</li>
          <li>il choisit la liste d&apos;heures correspondante (haute saison{" "}<strong>OU</strong>{" "}basse saison) ;</li>
          <li>si l&apos;<em>heure courante</em> est cochée, il régénère les 2 phrases IA. Sinon il skip.</li>
        </ol>
        <p>
          <strong>Exemple</strong>{" "}: aujourd&apos;hui on est en mai → haute saison. Avec le défaut « 06h, 10h, 14h, 18h »,
          il génère 4×/jour. En décembre on bascule auto en basse saison → 1×/jour à 7h.
        </p>
        <p>
          <strong>Tout est en heure de Paris</strong>{" "}(le passage été/hiver est géré automatiquement, pas besoin de toucher quoi que ce soit).
        </p>
        <p>
          <strong>Décocher tous les mois de haute saison</strong>{" "}= toujours basse saison.
          {" "}<strong>Décocher toutes les heures</strong>{" "}d&apos;une saison = pas de génération du tout pendant cette saison.
          Le toggle « Génération désactivée » désactive tout d&apos;un coup.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-4 space-y-4">
        {/* Toggle global */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={policy.enabled}
            onChange={(e) => save({ enabled: e.target.checked })}
            className="w-5 h-5 accent-blue-600"
          />
          <span className="text-sm font-medium">
            {policy.enabled ? "Génération activée" : "Génération désactivée (off)"}
          </span>
        </label>

        {/* Mois haute saison */}
        <div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
            Mois de haute saison
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {MONTH_LABELS.map((label, i) => {
              const m = i + 1;
              const on = monthsSet.has(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => save({ high_season_months: setToCsv(toggleInSet(monthsSet, m)) })}
                  className={`text-xs py-1.5 rounded border transition-colors ${
                    on
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-transparent border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Heures haute saison */}
        <HourGrid
          label="Heures de génération — haute saison"
          set={highHoursSet}
          onToggle={(h) => save({ high_season_hours: setToCsv(toggleInSet(highHoursSet, h)) })}
        />

        {/* Heures basse saison */}
        <HourGrid
          label="Heures de génération — basse saison (hors mois cochés ci-dessus)"
          set={lowHoursSet}
          onToggle={(h) => save({ low_season_hours: setToCsv(toggleInSet(lowHoursSet, h)) })}
          tone="muted"
        />

        {/* Statut + bouton force */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Dernière génération :{" "}
            <span className={statusColor}>{statusLabel}</span>
            {" — "}
            {relativeAgeFr(policy.last_run_at)}
            {policy.last_error && (
              <span className="block text-red-600 text-xs mt-1">↳ {policy.last_error}</span>
            )}
          </p>
          <button
            type="button"
            onClick={regenerate}
            disabled={regenerating}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded text-sm"
          >
            {regenerating ? "🔄 Régénération…" : "🔄 Régénérer maintenant"}
          </button>
        </div>

        {(saving || msg) && (
          <p className="text-xs text-slate-500 text-center">
            {saving ? "Enregistrement…" : msg}
          </p>
        )}
      </div>
    </section>
  );
}

function HourGrid({
  label,
  set,
  onToggle,
  tone,
}: {
  label: string;
  set: Set<number>;
  onToggle: (h: number) => void;
  tone?: "muted";
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">{label}</p>
      <div className="grid grid-cols-8 gap-1">
        {Array.from({ length: 24 }, (_, h) => h).map((h) => {
          const on = set.has(h);
          const activeBg = tone === "muted" ? "bg-slate-500 border-slate-500" : "bg-blue-600 border-blue-600";
          return (
            <button
              key={h}
              type="button"
              onClick={() => onToggle(h)}
              className={`text-xs py-1 rounded border transition-colors tabular-nums ${
                on
                  ? `${activeBg} text-white`
                  : "bg-transparent border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
              }`}
            >
              {h.toString().padStart(2, "0")}
            </button>
          );
        })}
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
