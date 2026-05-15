"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ThemePref = "system" | "light" | "dark";

function relativeAge(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const min = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

function formatFr(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ageStatus(iso: string | null, maxMinOk: number): "ok" | "stale" | "missing" {
  if (!iso) return "missing";
  const min = (Date.now() - new Date(iso).getTime()) / 60_000;
  return min <= maxMinOk ? "ok" : "stale";
}

function StatusDot({ status }: { status: "ok" | "stale" | "missing" }) {
  const cls =
    status === "ok"
      ? "bg-emerald-500"
      : status === "stale"
        ? "bg-amber-500"
        : "bg-red-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls} mr-1.5`} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">{title}</h2>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        {children}
      </div>
    </section>
  );
}

function applyTheme(pref: ThemePref) {
  const isDark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

export default function OptionsClient({
  lastMeasureAt,
  lastTendanceAt,
  lastAnnualAt,
  hasLastTendance,
  hasLastAnnual,
  dbSizeMb,
  totalMeasures,
}: {
  lastMeasureAt: string | null;
  lastTendanceAt: string | null;
  lastAnnualAt: string | null;
  hasLastTendance: boolean;
  hasLastAnnual: boolean;
  dbSizeMb: number | null;
  totalMeasures: number;
}) {
  const [theme, setTheme] = useState<ThemePref>("system");

  useEffect(() => {
    const stored = (localStorage.getItem("lac-theme") as ThemePref | null) ?? "system";
    setTheme(stored);
  }, []);

  function changeTheme(p: ThemePref) {
    setTheme(p);
    localStorage.setItem("lac-theme", p);
    applyTheme(p);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">⚙️ Options</h1>

      {/* THÈME */}
      <Section title="Thème">
        <div className="space-y-1">
          {(["system", "light", "dark"] as ThemePref[]).map((p) => {
            const labels = {
              system: { name: "Système", desc: "Suit les réglages iOS de l'appareil" },
              light: { name: "Clair", desc: "Toujours fond clair" },
              dark: { name: "Sombre", desc: "Toujours fond sombre" },
            }[p];
            return (
              <label
                key={p}
                className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <input
                  type="radio"
                  name="theme"
                  checked={theme === p}
                  onChange={() => changeTheme(p)}
                  className="accent-blue-600"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{labels.name}</div>
                  <div className="text-xs text-slate-500">{labels.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      </Section>

      {/* MONITORING */}
      <Section title="Monitoring">
        <ul className="text-sm space-y-2">
          <li className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Dernière mesure</span>
            <span className="font-medium">
              <StatusDot status={ageStatus(lastMeasureAt, 120)} />
              {formatFr(lastMeasureAt)} <span className="text-slate-500 text-xs">({relativeAge(lastMeasureAt)})</span>
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Dernière phrase IA (tendance)</span>
            <span className="font-medium">
              <StatusDot status={!hasLastTendance ? "missing" : ageStatus(lastTendanceAt, 36 * 60)} />
              <span className="text-slate-500 text-xs">{relativeAge(lastTendanceAt)}</span>
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Dernière phrase IA (annuelle)</span>
            <span className="font-medium">
              <StatusDot status={!hasLastAnnual ? "missing" : ageStatus(lastAnnualAt, 36 * 60)} />
              <span className="text-slate-500 text-xs">{relativeAge(lastAnnualAt)}</span>
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Mesures stockées</span>
            <span className="font-medium tabular-nums">{totalMeasures.toLocaleString("fr-FR")}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Taille de la base</span>
            <span className="font-medium">{dbSizeMb !== null ? `${dbSizeMb} MB` : "—"}</span>
          </li>
        </ul>
      </Section>

      {/* ADMIN */}
      <Section title="Administration">
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
          Le panel admin sert à gérer les <strong>lignes de seuil</strong> (les valeurs critiques affichées sur les graphs et utilisées par l&apos;IA).
        </p>
        <Link
          href="/admin"
          className="inline-block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg"
        >
          🔐 Accéder au panel admin
        </Link>
      </Section>

      {/* EXPLICATIONS */}
      <Section title="Comment ça marche ?">
        <details className="group py-2 border-b border-slate-200 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>Comment on récupère les mesures ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
            L&apos;opérateur du barrage (Laetis) publie une mesure du niveau d&apos;eau toutes les 20 minutes sur une API publique (<code>data.niv-eau.fr</code>).
            Notre serveur interroge cette API toutes les 20 minutes pour récupérer les nouvelles mesures et les stocker.
            Si l&apos;API ne renvoie rien pour un jour donné (panne capteur, maintenance), on retente pendant 7 jours,
            puis on marque le jour comme "définitivement blanc" pour ne plus retenter.
          </p>
        </details>

        <details className="group py-2 border-b border-slate-200 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>Comment on calcule "VS hier", "VS 3 jours", "VS semaine dernière" ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed space-y-2">
            <p>
              On prend le niveau de la <strong>dernière mesure connue</strong> (= <em>niveau actuel</em>), puis on le compare au niveau qu&apos;il y avait <strong>il y a exactement N×24 h</strong>.
            </p>
            <p>
              Exemple : si la dernière mesure date du 16 mai à 23:40, "VS hier" compare avec la mesure la plus récente <em>au plus égale</em> au 15 mai 23:40 — donc à la même heure, pas à minuit ni à midi.
              Idem pour "VS 3 jours" (le 13 mai 23:40) et "VS semaine dernière" (le 9 mai 23:40).
            </p>
            <p>
              S&apos;il n&apos;y a pas exactement de mesure à cette heure précise (les mesures sont espacées de 20 min), on prend la plus récente <em>strictement avant ou égale</em>.
            </p>
          </div>
        </details>

        <details className="group py-2 border-b border-slate-200 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>C&apos;est quoi la "Tendance 7 j (m/j)" ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
            La pente moyenne sur les 7 derniers jours, exprimée en mètres par jour.
            Formule : <code>(niveau actuel − niveau il y a 7 jours) / 7</code>.
            Une tendance positive = le niveau monte ; négative = il baisse.
            C&apos;est aussi ce qui détermine la couleur de la courbe sur la page d&apos;accueil
            (vert si ça monte, rouge si ça baisse, gris si c&apos;est stable).
          </p>
        </details>

        <details className="group py-2 border-b border-slate-200 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>Comment fonctionne la comparaison annuelle (VS 2024, VS 2023…) ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
            On regarde le niveau actuel et on cherche dans la base la mesure qui correspond à <strong>la même date dans l&apos;année précédente</strong>, avec une fenêtre de tolérance de ±3 jours.
            S&apos;il y a plusieurs candidats dans cette fenêtre, on prend le plus proche.
            S&apos;il n&apos;y en a aucun (trou de données), on affiche "—". Idem pour 2 et 3 ans en arrière.
          </p>
        </details>

        <details className="group py-2 border-b border-slate-200 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>Que montrent exactement les graphs ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed space-y-2">
            <p>
              <strong>Graph "Niveau actuel" (page d&apos;accueil)</strong> : toutes les mesures brutes de la fenêtre choisie (3 j, 7 j, etc.).
              Une mesure toutes les 20 minutes environ. La couleur de la courbe reflète la pente globale sur la fenêtre.
            </p>
            <p>
              <strong>Graph "Comparaison annuelle"</strong> : une mesure par jour pour chaque année sélectionnée (la première du jour),
              superposée sur un axe X normalisé à une année calendaire.
            </p>
            <p>
              <strong>Graph "Historique depuis 2021"</strong> : une mesure par jour depuis le début de l&apos;API (7 juillet 2021).
              Couleur différente par année pour repérer les cycles saisonniers.
            </p>
          </div>
        </details>

        <details className="group py-2 border-b border-slate-200 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>À quoi sert la phrase IA en haut ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
            Chaque matin à 07:00, on appelle GPT-4o avec : le niveau actuel, les variations récentes,
            la tendance, et les <strong>seuils définis par l&apos;admin</strong> (avec leurs descriptions).
            GPT renvoie une phrase courte qui recommande quoi faire avec le bateau : ne rien faire, le reculer un peu, ou le déplacer ailleurs.
            La phrase est ensuite servie statiquement toute la journée (pas de coût ni de latence à chaque visite).
          </p>
        </details>

        <details className="group py-2">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>À quoi servent les seuils (panel admin) ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
            Les lignes de seuil sont des valeurs critiques (en mètres NGF) qui :
            (1) apparaissent en pointillés sur les graphs pour visualiser la position du niveau actuel,
            (2) sont injectées dans le prompt GPT pour qu&apos;il puisse en parler dans sa recommandation.
            Par exemple, créer un seuil "Coque touche le fond" à 663 m permet à l&apos;IA de dire
            "Reculer le bateau, le niveau approche le seuil critique."
          </p>
        </details>
      </Section>

      <p className="text-xs text-slate-400 text-center pb-2">v2 · {process.env.NODE_ENV === "production" ? "prod" : "dev"}</p>
    </div>
  );
}
