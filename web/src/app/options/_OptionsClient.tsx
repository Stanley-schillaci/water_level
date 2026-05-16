"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDisplay } from "@/components/DisplayProvider";
import {
  ALL_MODES,
  MODE_LABELS,
  type DisplayMode,
  isModeAvailable,
} from "@/lib/levelDisplay";

type ThemePref = "system" | "light" | "dark";

function relativeAge(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const min = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  return formatMinutesAge(min);
}

/**
 * Formate un nombre de minutes en "il y a X min / X h / X j".
 * À préférer quand l'âge est calculé côté serveur (évite les pièges
 * d'interprétation timezone des timestamps SQLite UTC vs local).
 */
function formatMinutesAge(min: number | null): string {
  if (min === null) return "—";
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(min / 1440);
  return `il y a ${d} j`;
}

function ageStatusFromMinutes(
  min: number | null,
  maxMinOk: number,
): "ok" | "stale" | "missing" {
  if (min === null) return "missing";
  return min <= maxMinOk ? "ok" : "stale";
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
  lastTendanceAgeMinutes,
  hasLastTendance,
  dbSizeMb,
  totalMeasures,
}: {
  lastMeasureAt: string | null;
  lastTendanceAgeMinutes: number | null;
  hasLastTendance: boolean;
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
      {/* AFFICHAGE DU NIVEAU */}
      <DisplayModeSection />

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

      {/* FAQ — placée avant Monitoring/Admin selon préférence utilisateur */}
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
            <span>C&apos;est quoi le « mNGF » ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed space-y-2">
            <p>
              <strong>mNGF</strong>{" "}= « mètre NGF », pour <em>Nivellement Général de la France</em>. C&apos;est le système d&apos;altitude officiel français.
              Le zéro de référence (0 mNGF) correspond au{" "}<strong>niveau moyen de la mer à Marseille</strong>{" "}(mesuré par le marégraphe de Marseille, qui sert de point de repère depuis 1897).
            </p>
            <p>
              <strong>Donc quand on dit « le lac est à 666,97 mNGF »</strong>, ça veut dire que la surface de l&apos;eau au niveau du barrage se trouve à 666,97 m au-dessus du niveau de la mer.
              Ce n&apos;est pas la <em>profondeur</em> du lac (qui est variable selon où on se trouve).
            </p>
            <p>
              Comme la région du Tarn est déjà en altitude, le niveau du lac varie typiquement entre <strong>633 m</strong>{" "}(minimum historique, automne 2022) et environ <strong>670 m</strong>{" "}en eaux hautes. C&apos;est l&apos;information brute publiée par Laetis (l&apos;opérateur du barrage).
            </p>
            <p>
              Pour rendre la donnée plus parlante au quotidien, on peut basculer l&apos;affichage vers d&apos;autres référentiels (voir question suivante).
            </p>
          </div>
        </details>

        <details className="group py-2 border-b border-slate-200 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
            <span>« Sous le ponton », « Depuis le minimum » : c&apos;est quoi ces référentiels ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed space-y-2">
            <p>
              Le niveau brut (en mNGF, voir ci-dessus) est précis mais peu intuitif. L&apos;app propose <strong>3 référentiels d&apos;affichage</strong>{" "}interchangeables dans la section « Affichage du niveau » plus haut. La donnée stockée reste toujours la même (mNGF), on change juste la manière de l&apos;afficher.
            </p>
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <strong>Altitude (mNGF)</strong>{" "}— la valeur brute. Bien pour comparer dans le temps long, pas très parlant au jour le jour.
              </li>
              <li>
                <strong>Sous le ponton</strong>{" "}— combien d&apos;eau il y a sous la coque du bateau. Calculé à partir d&apos;une calibration faite par l&apos;admin (sur le bateau, on note le niveau actuel ET la profondeur indiquée par le sondeur ; l&apos;app déduit le mNGF qui correspond au « 0 m sous la coque »).
                Exemple : si l&apos;app indique <em>2,30 m sous la coque</em>, ça veut dire qu&apos;il reste 2,30 m d&apos;eau sous le bateau au ponton (potentiellement négatif si le lac descend sous le ponton — il faut alors déplacer le bateau).
              </li>
              <li>
                <strong>Depuis le minimum historique</strong>{" "}— combien de mètres au-dessus du plus bas niveau jamais enregistré. Le minimum est calculé automatiquement (la valeur la plus basse de toute la base de données). Garanti positif (sauf nouveau record bas).
              </li>
            </ul>
            <p>
              <strong>Le réglage est personnel</strong>{" "}(stocké dans le navigateur, comme le thème). Tu peux switcher quand tu veux, ça n&apos;affecte pas les autres utilisateurs.
              L&apos;étalonnage du ponton, lui, est partagé entre tous (c&apos;est dans l&apos;admin).
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
            <span>La phrase IA en haut de page : c&apos;est quoi ?</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed space-y-2">
            <p>
              <strong>Une phrase IA</strong>{" "}est générée par GPT-5 selon une cadence configurable (voir plus bas), affichée
              en haut de la page d&apos;accueil 💧. GPT reçoit la profondeur sous la coque, la tendance récente, le tirant d&apos;eau,
              la marge de vigilance et les <strong>seuils définis par l&apos;admin</strong>. Il rédige une phrase courte qui
              décrit la situation (en hausse / en baisse / stable, niveau de risque par rapport au tirant).
            </p>
            <p>
              La phrase est <strong>stockée en base</strong>{" "}et servie statiquement à chaque visite (pas d&apos;appel à OpenAI
              à chaque page load). Conséquence : elle reste identique entre 2 générations. L&apos;âge de la phrase
              est affiché à droite du bandeau (« il y a X min / X h »), à ne pas confondre avec l&apos;âge de la
              dernière mesure du lac qui est dans le bloc juste en dessous.
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
                <strong>Dans le prompt GPT</strong>{" "}: nom + description + valeur sont injectés dans le prompt envoyé à GPT-5 lors des générations.
                Plus la description est riche, plus l&apos;IA peut nuancer sa recommandation (« Reculer le bateau, le niveau approche le seuil critique X… »).
              </li>
            </ol>
          </div>
        </details>

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
            <span className="text-slate-600 dark:text-slate-400">Dernière phrase IA</span>
            <span className="font-medium">
              <StatusDot
                status={
                  !hasLastTendance
                    ? "missing"
                    : ageStatusFromMinutes(lastTendanceAgeMinutes, 36 * 60)
                }
              />
              <span className="text-slate-500 text-xs">{formatMinutesAge(lastTendanceAgeMinutes)}</span>
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

      {/* PANEL ADMIN */}
      <Section title="Panel admin">
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
          Le panel admin sert à gérer l&apos;<strong>étalonnage du ponton</strong>, les{" "}<strong>seuils</strong>{" "}affichés sur les graphs et la{" "}<strong>cadence de génération des phrases IA</strong>.
        </p>
        <Link
          href="/admin"
          className="inline-block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg"
        >
          🔐 Accéder au panel admin
        </Link>
      </Section>

      <p className="text-xs text-slate-400 text-center pb-2">v2 · {process.env.NODE_ENV === "production" ? "prod" : "dev"}</p>
    </div>
  );
}

function DisplayModeSection() {
  const { mode, refs, ready, setMode } = useDisplay();

  const descriptions: Record<DisplayMode, string> = {
    mngf: "L'altitude absolue par rapport au niveau de la mer. La donnée brute publiée par Laetis.",
    ponton: refs.ponton_calibration_mngf !== null
      ? `Profondeur sous la coque du bateau. 0 m = niveau ${refs.ponton_calibration_mngf.toFixed(2)} mNGF (calibré par l'admin).`
      : "Indisponible — pas encore étalonné. Demander à l'admin de calibrer le ponton.",
    min: refs.min_historical !== null
      ? `Hauteur depuis le minimum historique (${refs.min_historical.value.toFixed(2)} m, le ${refs.min_historical.date}).`
      : "Indisponible — pas assez de données.",
  };

  return (
    <Section title="Affichage du niveau">
      <div className="space-y-1">
        {ALL_MODES.map((m) => {
          const available = isModeAvailable(m, refs);
          return (
            <label
              key={m}
              className={`flex items-start gap-3 p-2 rounded ${
                available
                  ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                  : "opacity-50 cursor-not-allowed"
              }`}
            >
              <input
                type="radio"
                name="displayMode"
                checked={mode === m}
                disabled={!available}
                onChange={() => available && setMode(m)}
                className="accent-blue-600 mt-1"
              />
              <div className="flex-1">
                <div className="text-sm font-medium">{MODE_LABELS[m]}</div>
                <div className="text-xs text-slate-500">{descriptions[m]}</div>
              </div>
            </label>
          );
        })}
        {!ready && <p className="text-xs text-slate-500 px-2">Chargement des références…</p>}
      </div>
    </Section>
  );
}
