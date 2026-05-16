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
          Le panel admin sert à gérer les <strong>lignes de seuil</strong>{" "}(les valeurs critiques affichées sur les graphs et utilisées par l&apos;IA).
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
            <span>D&apos;où viennent les mesures ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed space-y-2">
            <p>
              L&apos;opérateur du barrage (Laetis) publie une mesure du niveau d&apos;eau <strong>toutes les 20 minutes environ</strong> sur une API publique (<code>data.niv-eau.fr</code>).
              Soit ~72 mesures par jour.
            </p>
            <p>
              Notre serveur interroge cette API toutes les 20 minutes pour récupérer les nouvelles mesures et les stocker dans la base.
              Si l&apos;API ne renvoie rien pour un jour donné (panne capteur, maintenance), on retente pendant 7 jours,
              puis on marque le jour comme "définitivement blanc" pour ne plus interroger inutilement.
            </p>
          </div>
        </details>

        <details className="group py-2 border-b border-slate-200 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>Comment on calcule « VS Hier », « VS il y a 3 jours », « VS il y a une semaine » ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed space-y-2">
            <p>
              <strong>Principe</strong>{" "}: on prend le niveau de la dernière mesure connue (le « niveau actuel ») et on le soustrait au niveau d&apos;il y a exactement N×24 h.
            </p>
            <p>
              <strong>Exemple concret</strong> — si la dernière mesure date du <code>16 mai 23:40</code> et vaut <code>666.91 m</code> :
            </p>
            <ul className="list-disc ml-5 space-y-0.5">
              <li><strong>VS Hier</strong> compare à la mesure du <code>15 mai 23:40</code> (donc même heure)</li>
              <li><strong>VS il y a 3 jours</strong> compare à la mesure du <code>13 mai 23:40</code></li>
              <li><strong>VS il y a une semaine</strong> compare à la mesure du <code>9 mai 23:40</code></li>
            </ul>
            <p>
              Comme l&apos;API publie une mesure toutes les 20 minutes, on a en général exactement la mesure de <code>23:40</code>{" "}à J-7 (ou à 1 minute près).
              Si pour une raison ou une autre il n&apos;y a pas de mesure pile à cette heure-là (trou de données ponctuel),
              <strong> on prend la mesure la plus récente strictement avant </strong>
              (donc 23:20, ou à défaut 23:00, etc.).
            </p>
            <p>
              <strong>Important</strong>{" "}: on compare <em>à la même heure</em>{" "}que celle de la dernière mesure (23:40 dans l&apos;exemple).
              On ne fait jamais de moyenne sur la journée, et on ne compare jamais à une heure arbitraire (genre « la mesure du début de journée » ou « celle de midi »).
            </p>
          </div>
        </details>

        <details className="group py-2 border-b border-slate-200 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>C&apos;est quoi la « Tendance 7 j » (en m/j) ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed space-y-2">
            <p>
              C&apos;est la <strong>pente moyenne du niveau sur les 7 derniers jours</strong>, en mètres par jour.
            </p>
            <p>
              <strong>Formule</strong> : <code>(niveau actuel − niveau il y a 7 jours) / 7</code>.
            </p>
            <p>
              Exemple : si on est passé de 666.50 m il y a 7 jours à 666.91 m aujourd&apos;hui, la tendance est de <code>+0.41 / 7 = +0.059 m/j</code>.
              Sur un mois ça ferait environ +1.77 m.
            </p>
            <p>
              <strong>Tendance positive</strong>{" "}= le lac monte ; <strong>négative</strong>{" "}= il baisse.
              C&apos;est cette pente locale qui sert aussi à colorer chaque segment du graph d&apos;accueil (vert si ça monte, rouge si ça baisse).
            </p>
          </div>
        </details>

        <details className="group py-2 border-b border-slate-200 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>Comment fonctionne la comparaison annuelle (VS 2024…) ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed space-y-2">
            <p>
              <strong>Principe</strong> : on cherche le niveau qu&apos;avait le lac à <em>la même période de l&apos;année</em> il y a 1, 2 ou 3 ans.
            </p>
            <p>
              <strong>Pourquoi pas exactement la même date ?</strong>{" "}Parce qu&apos;une année plus tôt, il n&apos;y a pas forcément de mesure pile au même jour ni à la même heure (panne API, jour blanc, etc.).
              Donc on ouvre une <strong>fenêtre de 7 jours centrée sur l&apos;anniversaire</strong> (3 jours avant + 3 jours après) :
            </p>
            <p>
              <strong>Exemple concret</strong> — si la dernière mesure est du <code>16 mai 2026 23:40</code> à 666.91 m, pour calculer « VS 2025 » on cherche dans la fenêtre <code>13 mai 2025 23:40</code> à <code>19 mai 2025 23:40</code> (soit 7 jours autour de l&apos;anniversaire <code>16 mai 2025 23:40</code>).
            </p>
            <ul className="list-disc ml-5 space-y-0.5">
              <li>S&apos;il y a <strong>plusieurs mesures</strong> dans cette fenêtre, on prend celle dont la date/heure est <em>la plus proche</em> de l&apos;anniversaire.</li>
              <li>S&apos;il n&apos;y a <strong>aucune mesure</strong> dans la fenêtre (jour blanc, etc.), on affiche « — ».</li>
            </ul>
            <p>
              Idem pour VS 2024 (anniversaire le 16 mai 2024) et VS 2023 (16 mai 2023).
            </p>
          </div>
        </details>

        <details className="group py-2 border-b border-slate-200 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>Que montrent exactement les graphs ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed space-y-2">
            <p>
              <strong>Graph « Tendance actuelle » (page d&apos;accueil 💧)</strong> :<br />
              Toutes les mesures de la fenêtre choisie (1 j, 3 j, 7 j, 14 j, 30 j, 60 j, 90 j, 180 j ou 365 j), agrégées par tranches de temps.
              Plus la fenêtre est petite, plus les tranches sont fines (1 h pour 3 jours, 24 h pour 1 an).
              <strong>Chaque petit segment a sa propre couleur</strong> selon la pente locale (vert vif = ça monte vite, vert foncé = ça monte doucement, rouge foncé = ça baisse doucement, rouge vif = ça baisse vite).
            </p>
            <p>
              <strong>Graph « Comparaison annuelle » (page 📈, haut)</strong> :<br />
              Pour chaque année sélectionnée, on prend <strong>une mesure par jour</strong> (la première mesure du jour, généralement vers 00:00-00:40).
              Toutes les années sont superposées sur un axe X normalisé à une année calendaire (1<sup>er</sup>{" "}janv. → 31 déc.), pour voir d&apos;un coup d&apos;œil si le niveau actuel est "en avance" ou "en retard" par rapport aux années précédentes.
            </p>
            <p>
              <strong>Graph « Historique depuis 2021 » (page 📈, bas)</strong> :<br />
              Une mesure par jour (la première) depuis le 7 juillet 2021 jusqu&apos;à aujourd&apos;hui, sur un axe X continu.
              <strong>La couleur change à chaque nouvelle année</strong> (palette 6 couleurs) pour repérer visuellement les cycles saisonniers (la même couleur revient tous les 6 ans).
            </p>
          </div>
        </details>

        <details className="group py-2 border-b border-slate-200 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>Les phrases IA en haut de page : c&apos;est quoi ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed space-y-2">
            <p>
              <strong>Il y a deux phrases IA distinctes</strong>, générées par GPT-4o selon une cadence configurable (voir plus bas) :
            </p>
            <ol className="list-decimal ml-5 space-y-1">
              <li>
                <strong>Sur la page d&apos;accueil 💧</strong> (« phrase tendance ») — GPT reçoit le niveau actuel, les variations
                récentes (VS hier, 3 j, 7 j), la tendance 7 j et les <strong>seuils définis par l&apos;admin</strong>.
                Il génère une recommandation pour le bateau : ne rien faire, le reculer un peu, ou le déplacer ailleurs.
              </li>
              <li>
                <strong>Sur la page 📈</strong> (« phrase annuelle ») — GPT reçoit uniquement le niveau actuel
                et les comparaisons VS 2024 / 2023 / 2022. Il génère une phrase neutre du genre
                « Le niveau est plus haut/bas que les années précédentes ».
              </li>
            </ol>
            <p>
              Les deux phrases sont <strong>stockées en base de données</strong>{" "}et servies statiquement à chaque visite (pas d&apos;appel à OpenAI à chaque page load).
              Conséquence : la phrase reste identique entre 2 générations.
            </p>
            <p>
              <strong>La cadence est réglable depuis le panel admin</strong>{" "}(section « 🤖 Phrases IA »). On définit :
            </p>
            <ul className="list-disc ml-5 space-y-0.5">
              <li>les <strong>mois de haute saison</strong> (défaut : mai → août) ;</li>
              <li>les <strong>heures de génération en haute saison</strong> (défaut : 06h, 10h, 14h, 18h — soit 4×/jour) ;</li>
              <li>les <strong>heures de génération en basse saison</strong> (défaut : 07h — soit 1×/jour) ;</li>
              <li>un <strong>kill switch global</strong> pour tout désactiver (économie API, ou phrase obsolète qui ne sert à rien en hiver) ;</li>
              <li>un bouton <strong>« Régénérer maintenant »</strong> qui force une génération immédiate sans attendre le prochain créneau.</li>
            </ul>
            <p>
              <strong>Toutes les heures sont en heure de Paris</strong>{" "}(géré automatiquement, été comme hiver).
              Concrètement : le worker tourne <em>toutes les heures à xx:55</em>{" "}et regarde la policy pour décider s&apos;il génère ou s&apos;il skip.
            </p>
            <p>
              <strong>Pas de phrase IA = phrase trop ancienne ou jamais générée.</strong>{" "}Vérifier l&apos;état dans la section "Monitoring" plus haut.
              En cas d&apos;échec de génération (panne OpenAI, etc.), un{" "}<strong>petit point rouge ⚠️</strong>{" "}apparaît sur l&apos;icône ⚙️ du bas d&apos;écran.
            </p>
          </div>
        </details>

        <details className="group py-2">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>À quoi servent les seuils (panel admin) ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed space-y-2">
            <p>
              Un seuil est une <strong>valeur critique en mètres NGF</strong> (ex : 663.00 m pour « la coque touche le fond »).
            </p>
            <p>Chaque seuil est utilisé à deux endroits :</p>
            <ol className="list-decimal ml-5 space-y-1">
              <li>
                <strong>Sur les graphs</strong> : une ligne horizontale pointillée (couleur et style configurables) pour visualiser à quel niveau se trouve le seuil par rapport au niveau actuel.
              </li>
              <li>
                <strong>Dans le prompt GPT</strong>{" "}: nom + description + valeur sont injectés dans le prompt envoyé à GPT-4o chaque matin.
                Plus la description est riche, plus l&apos;IA peut nuancer sa recommandation (« Reculer le bateau, le niveau approche le seuil critique X… »).
              </li>
            </ol>
          </div>
        </details>

      </Section>

      <p className="text-xs text-slate-400 text-center pb-2">v2 · {process.env.NODE_ENV === "production" ? "prod" : "dev"}</p>
    </div>
  );
}
