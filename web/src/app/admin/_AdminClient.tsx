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
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={logout} className="text-xs text-slate-500 underline">
          Déconnexion
        </button>
      </div>

      <Collapsible title="📐 Étalonnage du ponton" defaultOpen>
        <CalibrationSection />
      </Collapsible>

      <Collapsible title="⚓ Bateau">
        <BoatSection />
      </Collapsible>

      <Collapsible title="📍 Seuils visuels">
        <ThresholdsSection thresholds={thresholds} onChanged={refresh} />
      </Collapsible>

      <Collapsible title="🤖 Phrases IA">
        <AiPolicySection />
        <SystemPromptSection />
        <AiHistorySection />
      </Collapsible>
    </div>
  );
}

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800"
      open={defaultOpen}
    >
      <summary className="cursor-pointer flex justify-between items-center px-4 py-3 select-none">
        <span className="text-base font-semibold">{title}</span>
        <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
      </summary>
      <div className="px-4 pb-4 pt-1 border-t border-slate-200 dark:border-slate-800">
        {children}
      </div>
    </details>
  );
}

function ThresholdsSection({
  thresholds,
  onChanged,
}: {
  thresholds: Threshold[];
  onChanged: () => void;
}) {
  return (
    <div className="space-y-3 pt-3">
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

      <ThresholdForm onSaved={onChanged} />
      <div className="space-y-2">
        {thresholds.map((t) => (
          <ThresholdItem key={t.id} t={t} onChanged={onChanged} />
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
      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-500 px-4 py-3 text-xs leading-relaxed space-y-2 mt-3">
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

type DisplaySettingsApi = {
  ponton_fixe_calibration_mngf: number | null;
  ponton_amovible_calibration_mngf: number | null;
  boat_draft_m: number;
  vigilance_margin_m: number;
};

type CalibrationEntry = {
  id: number;
  lac_level_mngf: number;
  sonar_depth_m: number;
  calibration_mngf: number;
  ponton: "fixe" | "amovible";
  note: string | null;
  created_at: string;
};

function CalibrationSection() {
  const [settings, setSettings] = useState<DisplaySettingsApi | null>(null);
  const [activePonton, setActivePonton] = useState<"fixe" | "amovible" | null>(null);
  const [history, setHistory] = useState<CalibrationEntry[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number | null>(null);

  const [ponton, setPonton] = useState<"fixe" | "amovible">("fixe");
  const [profondeur, setProfondeur] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function refreshFromApi(d: { settings: DisplaySettingsApi; active_ponton: typeof activePonton; history: CalibrationEntry[] }) {
    setSettings(d.settings);
    setActivePonton(d.active_ponton);
    setHistory(d.history);
    // Si on a déjà des étalonnages, le radio est pré-sélectionné sur le ponton actif.
    if (d.active_ponton) setPonton(d.active_ponton);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/display/calibration").then((r) => r.json()),
      fetch("/api/water/recent?days=1").then((r) => r.json()),
    ]).then(([cal, water]) => {
      if (cal.ok) refreshFromApi(cal);
      const m = water.measures ?? [];
      if (m.length > 0) setCurrentLevel(m[m.length - 1].value);
    });
  }, []);

  async function save() {
    if (currentLevel === null) {
      setMsg("Niveau actuel indisponible");
      return;
    }
    const prof = Number.parseFloat(profondeur.replace(",", "."));
    if (!Number.isFinite(prof) || prof < 0) {
      setMsg("Profondeur invalide");
      return;
    }
    const computed = currentLevel - prof;
    if (computed < 600 || computed > 700) {
      setMsg(`Calibration hors bornes (${computed.toFixed(2)} mNGF)`);
      return;
    }
    setSaving(true);
    setMsg(null);
    const r = await fetch("/api/admin/display/calibration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lac_level_mngf: currentLevel,
        sonar_depth_m: prof,
        ponton,
        note: note.trim() || null,
      }),
    });
    const d = await r.json();
    setSaving(false);
    if (d.ok) {
      refreshFromApi(d);
      setProfondeur("");
      setNote("");
      setMsg(`✓ Étalonnage ${ponton} enregistré : 0 m sous la coque = ${computed.toFixed(2)} mNGF`);
      setTimeout(() => setMsg(null), 4000);
    } else {
      setMsg("Erreur enregistrement");
    }
  }

  const draft = settings?.boat_draft_m ?? 1.5;

  return (
    <section className="space-y-3">
      <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 border-l-4 border-purple-500 px-4 py-3 text-xs leading-relaxed space-y-2 mt-3">
        <p className="font-medium text-sm">ℹ️ À quoi ça sert ?</p>
        <p>
          L&apos;étalonnage permet à l&apos;app de calculer{" "}<strong>combien d&apos;eau il y a sous la coque</strong>{" "}plutôt que l&apos;altitude brute (mNGF).
          On enregistre la profondeur indiquée par le sondeur quand on est sur place ; l&apos;app suit ensuite les variations du niveau du lac.
        </p>
        <p>
          <strong>Ponton FIXE</strong>{" "}— calibration stable, à enregistrer 1× en début de saison (ou si dérive du sondeur).
          <br />
          <strong>Ponton AMOVIBLE</strong>{" "}— calibration à refaire à chaque déplacement du ponton (typiquement en fin de session).
        </p>
        <p>
          L&apos;<strong>app détecte automatiquement</strong>{" "}quel ponton est actif : c&apos;est celui du dernier étalonnage enregistré.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-4 space-y-3">
        {/* Calibrations courantes des 2 pontons */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div
            className={`p-2 rounded border ${
              activePonton === "fixe"
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
                : "border-slate-200 dark:border-slate-800"
            }`}
          >
            <div className="font-semibold flex items-center justify-between">
              <span>Ponton fixe</span>
              {activePonton === "fixe" && <span className="text-blue-600">● actif</span>}
            </div>
            <div className="tabular-nums mt-1">
              {settings?.ponton_fixe_calibration_mngf !== null && settings?.ponton_fixe_calibration_mngf !== undefined
                ? `${settings.ponton_fixe_calibration_mngf.toFixed(2)} mNGF`
                : "— jamais étalonné"}
            </div>
          </div>
          <div
            className={`p-2 rounded border ${
              activePonton === "amovible"
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
                : "border-slate-200 dark:border-slate-800"
            }`}
          >
            <div className="font-semibold flex items-center justify-between">
              <span>Ponton amovible</span>
              {activePonton === "amovible" && <span className="text-blue-600">● actif</span>}
            </div>
            <div className="tabular-nums mt-1">
              {settings?.ponton_amovible_calibration_mngf !== null && settings?.ponton_amovible_calibration_mngf !== undefined
                ? `${settings.ponton_amovible_calibration_mngf.toFixed(2)} mNGF`
                : "— jamais étalonné"}
            </div>
          </div>
        </div>

        {/* Nouveau saisie */}
        <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Nouvel étalonnage
          </p>

          {/* Radio ponton */}
          <div className="flex gap-2">
            {(["fixe", "amovible"] as const).map((p) => (
              <label
                key={p}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded border cursor-pointer text-xs ${
                  ponton === p
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-transparent border-slate-300 dark:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="ponton"
                  checked={ponton === p}
                  onChange={() => setPonton(p)}
                  className="hidden"
                />
                Ponton {p}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="block">
              <span className="text-xs text-slate-500">Niveau actuel (mNGF)</span>
              <div className="w-full mt-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums text-slate-700 dark:text-slate-300">
                {currentLevel !== null ? currentLevel.toFixed(2) : "—"}
              </div>
            </div>
            <label className="block">
              <span className="text-xs text-slate-500">Profondeur sondeur (m)</span>
              <input
                type="text"
                inputMode="decimal"
                value={profondeur}
                onChange={(e) => setProfondeur(e.target.value)}
                placeholder={`min : ${draft.toFixed(2)} m`}
                className="w-full mt-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm tabular-nums"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-slate-500">Note (optionnel)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex : ponton déplacé de 5m vers la rive"
              maxLength={200}
              className="w-full mt-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
            />
          </label>

          <button
            type="button"
            onClick={save}
            disabled={saving || !profondeur || currentLevel === null}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded text-sm"
          >
            {saving ? "…" : "Enregistrer l'étalonnage"}
          </button>
        </div>

        {msg && <p className="text-xs text-slate-600 dark:text-slate-400">{msg}</p>}
      </div>

      {/* Historique */}
      {history.length > 0 && (
        <details className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold flex justify-between items-center">
            <span>5 derniers étalonnages</span>
            <span className="text-slate-400">▶</span>
          </summary>
          <div className="px-3 pb-3 space-y-1 text-xs">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 py-1 last:border-0">
                <div>
                  <span className="font-medium">{h.ponton}</span>
                  <span className="text-slate-500"> · {h.created_at}</span>
                  {h.note && <div className="text-slate-500 italic">{h.note}</div>}
                </div>
                <div className="tabular-nums text-slate-600 dark:text-slate-400">
                  {h.lac_level_mngf.toFixed(2)} − {h.sonar_depth_m.toFixed(2)} = {h.calibration_mngf.toFixed(2)} mNGF
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function BoatSection() {
  const [draft, setDraft] = useState<string>("1.5");
  const [margin, setMargin] = useState<string>("0.5");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/boat")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setDraft(String(d.boat_draft_m));
          setMargin(String(d.vigilance_margin_m));
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    const d = Number.parseFloat(draft.replace(",", "."));
    const m = Number.parseFloat(margin.replace(",", "."));
    if (!Number.isFinite(d) || d < 0 || !Number.isFinite(m) || m < 0) {
      setMsg("Valeurs invalides");
      return;
    }
    setSaving(true);
    setMsg(null);
    const r = await fetch("/api/admin/boat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boat_draft_m: d, vigilance_margin_m: m }),
    });
    const j = await r.json();
    setSaving(false);
    if (j.ok) {
      setMsg("✓ enregistré");
      setTimeout(() => setMsg(null), 1500);
    } else {
      setMsg("Erreur enregistrement");
    }
  }

  const draftNum = Number.parseFloat(draft.replace(",", "."));
  const marginNum = Number.parseFloat(margin.replace(",", "."));
  const critique = Number.isFinite(draftNum) ? draftNum : null;
  const vigilance = Number.isFinite(draftNum) && Number.isFinite(marginNum) ? draftNum + marginNum : null;

  return (
    <section className="space-y-3">
      <div className="rounded-lg bg-cyan-50 dark:bg-cyan-950/30 border-l-4 border-cyan-500 px-4 py-3 text-xs leading-relaxed space-y-2 mt-3">
        <p className="font-medium text-sm">ℹ️ Tirant d&apos;eau et marge de vigilance</p>
        <p>
          Ces deux valeurs pilotent les{" "}<strong>seuils opérationnels</strong>{" "}utilisés par la phrase IA et le calcul du risque :
        </p>
        <ul className="list-disc ml-5 space-y-0.5">
          <li><strong>Tirant d&apos;eau</strong> : profondeur minimale absolue pour amarrer (= seuil critique). En dessous, la coque tape le fond.</li>
          <li><strong>Marge de vigilance</strong> : combien de marge au-dessus du tirant pour déclencher l&apos;alerte "ça approche".</li>
        </ul>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-4 space-y-3">
        {!loaded ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-slate-500">Tirant d&apos;eau (m)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full mt-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm tabular-nums"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Marge de vigilance (m)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  className="w-full mt-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-sm tabular-nums"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs">
                <span className="text-slate-500">Seuil critique</span>
                <div className="text-sm font-semibold tabular-nums mt-1">
                  {critique !== null ? `${critique.toFixed(2)} m` : "—"}
                </div>
              </div>
              <div className="text-xs">
                <span className="text-slate-500">Seuil vigilance</span>
                <div className="text-sm font-semibold tabular-nums mt-1">
                  {vigilance !== null ? `${vigilance.toFixed(2)} m` : "—"}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded text-sm"
            >
              {saving ? "…" : "Enregistrer"}
            </button>

            {msg && <p className="text-xs text-slate-500 text-center">{msg}</p>}
          </>
        )}
      </div>
    </section>
  );
}

type AiHistoryEntry = {
  id: number;
  created_at: string;
  type: string;
  model: string | null;
  system_prompt: string | null;
  prompt: string;
  response: string;
  total_tokens: number | null;
};

function AiHistorySection() {
  const [entries, setEntries] = useState<AiHistoryEntry[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const r = await fetch("/api/admin/ai/history?limit=20");
    const d = await r.json();
    if (d.ok) setEntries(d.history);
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-3 mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">📊 Historique des générations</p>
        <button
          type="button"
          onClick={load}
          className="text-[10px] text-slate-500 underline"
        >
          Rafraîchir
        </button>
      </div>
      <p className="text-[10px] text-slate-500">
        Les 20 dernières générations IA. Clique sur une ligne pour voir le prompt complet (system + user) et la réponse exacte qui a été générée.
      </p>

      {!loaded ? (
        <p className="text-xs text-slate-500">Chargement…</p>
      ) : !entries || entries.length === 0 ? (
        <p className="text-xs text-slate-500">Aucune génération encore enregistrée.</p>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {entries.map((e) => {
            const preview = e.response.length > 80 ? e.response.slice(0, 80) + "…" : e.response;
            return (
              <details
                key={e.id}
                className="text-xs border border-slate-200 dark:border-slate-800 rounded"
              >
                <summary className="cursor-pointer px-2 py-1.5 flex justify-between items-start gap-2">
                  <div className="flex-1">
                    <div className="text-slate-500 text-[10px]">{e.created_at} · {e.type}{e.total_tokens ? ` · ${e.total_tokens} tokens` : ""}</div>
                    <div className="mt-0.5">{preview}</div>
                  </div>
                </summary>
                <div className="px-2 py-2 space-y-2 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">System prompt</div>
                    <pre className="text-[10px] mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-2 rounded">
                      {e.system_prompt ?? "— (avant V2.3, non logué)"}
                    </pre>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">User prompt</div>
                    <pre className="text-[10px] mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-2 rounded">
                      {e.prompt}
                    </pre>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Réponse</div>
                    <pre className="text-[10px] mt-1 whitespace-pre-wrap text-slate-900 dark:text-slate-100 bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded">
                      {e.response}
                    </pre>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SystemPromptSection() {
  const [prompt, setPrompt] = useState<string>("");
  const [defaultPrompt, setDefaultPrompt] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ id: number; prompt: string; created_at: string }>>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetch("/api/admin/ai/system-prompt")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setPrompt(d.prompt);
          setDefaultPrompt(d.default_prompt);
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  async function loadHistory() {
    const r = await fetch("/api/admin/ai/system-prompt/history");
    const d = await r.json();
    if (d.ok) setHistory(d.history);
  }

  async function save() {
    if (!prompt.trim()) {
      setMsg("Le system prompt ne peut pas être vide");
      return;
    }
    setSaving(true);
    setMsg(null);
    const r = await fetch("/api/admin/ai/system-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const d = await r.json();
    setSaving(false);
    if (d.ok) {
      setMsg("✓ enregistré (version précédente archivée dans l'historique)");
      setTimeout(() => setMsg(null), 3000);
    } else {
      setMsg("Erreur enregistrement");
    }
  }

  function restoreDefault() {
    if (!confirm("Restaurer le system prompt par défaut ? La version actuelle sera archivée.")) return;
    setPrompt(defaultPrompt);
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-3 mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">📝 System prompt (ton + contexte)</p>
        <button
          type="button"
          onClick={restoreDefault}
          className="text-[10px] text-slate-500 underline"
        >
          Restaurer le défaut
        </button>
      </div>

      {!loaded ? (
        <p className="text-xs text-slate-500">Chargement…</p>
      ) : (
        <>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={14}
            className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono leading-relaxed"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded text-sm"
          >
            {saving ? "…" : "Enregistrer le system prompt"}
          </button>

          {msg && <p className="text-xs text-slate-500">{msg}</p>}

          <button
            type="button"
            onClick={() => {
              if (!showHistory) loadHistory();
              setShowHistory(!showHistory);
            }}
            className="text-xs text-slate-500 underline"
          >
            {showHistory ? "Masquer" : "Afficher"} l&apos;historique des modifications
          </button>

          {showHistory && history.length > 0 && (
            <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
              {history.map((h) => (
                <details key={h.id} className="text-xs border border-slate-200 dark:border-slate-800 rounded">
                  <summary className="cursor-pointer px-2 py-1 text-slate-500">
                    {h.created_at}
                  </summary>
                  <pre className="px-2 py-1 text-[10px] whitespace-pre-wrap text-slate-700 dark:text-slate-300">{h.prompt}</pre>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Restaurer cette version ?")) setPrompt(h.prompt);
                    }}
                    className="text-[10px] text-blue-600 underline mx-2 mb-2"
                  >
                    Restaurer cette version
                  </button>
                </details>
              ))}
            </div>
          )}
        </>
      )}
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
