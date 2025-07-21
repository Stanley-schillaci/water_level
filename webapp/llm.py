from datetime import datetime
from dotenv import load_dotenv
from bdd import log_gpt_call, should_generate_annual_comparison, should_generate_commentary
import os

load_dotenv()

from openai import OpenAI

from bdd import log_gpt_call

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def generate_commentary(kpis: dict, thresholds: list) -> str:

    do_generate, last_comment = should_generate_commentary()
    if not do_generate:
        return last_comment or "⏱️ Dernière génération trop récente ou quota dépassé."

    parts = [
        "Tu es un assistant expert en hydrologie.",
        "Tu dois aider un opérateur nautique à décider s’il faut déplacer un bateau : ne rien faire, le reculer sur le ponton, ou le déplacer ailleurs.",
        "Le bateau a un tirant d’eau de 0,4 m. Il est amarré sur un ponton flottant relié à la berge.",
        "Le lac est fermé par un barrage et son niveau varie naturellement.",
        "La décision dépend du niveau actuel, de son évolution récente, et des seuils prédéfinis.",
        "",
        "<données>",
        f"Date de la dernière mesure : {kpis['kpi_date']}",
        f"Niveau actuel : {kpis['kpi_level']:.2f} m",
        f"Variation par rapport à hier : {kpis['kpi_j1']:.3f} m",
        f"Variation par rapport à il y a 3 jours : {kpis['kpi_j3']:.3f} m",
        f"Variation par rapport à la semaine dernière : {kpis['kpi_s1']:.3f} m",
        f"Tendance sur 7 jours : {kpis['kpi_7j']:.3f} m/j",
        "</données>",
        "",
        "<seuils>",
    ]
    for t in thresholds:
        parts.append(f"- {t['name']} ({t['value']:.2f} m) : {t['description']}")
    parts.append("</seuils>")

    parts.append(
        "<instruction>Rédige UNE PHRASE en français, claire et concise, qui indique ce que doit faire l’opérateur avec le bateau : ne rien faire, le reculer un peu, ou le déplacer ailleurs. Tu peux inclure des valeurs utiles (niveau actuel, tendance, seuil atteint). Sois factuel, et base ta recommandation sur les données ci-dessus. Mentionne un seuil s’il est proche ou franchi.</instruction>"
    )

    prompt = "\n".join(parts)

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Tu es un expert en hydrologie, tu rédiges en français."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=180
        )

        content = response.choices[0].message.content.strip()
        usage = response.usage

        log_gpt_call(
            model="gpt-4o",
            prompt=prompt,
            response=content,
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens
        )

        return content

    except Exception as e:
        return f"Erreur lors de l'appel à l'API : {e}"
    
def generate_annual_comparison(kpis: dict) -> str:
    do_generate, last_comment = should_generate_annual_comparison()
    if not do_generate:
        return last_comment or "⏱️ Commentaire déjà généré aujourd’hui."

    parts = [
        "Tu es un assistant expert en hydrologie.",
        "Génère une phrase courte et factuelle en français.",
        "Tu compares uniquement le niveau actuel avec celui des 3 dernières années à la même date.",
        "<données>",
        f"Niveau actuel : {kpis['kpi_level']:.2f} m",
        f"VS {datetime.now().year - 1} : {kpis['kpi_y1']:+.2f} m",
        f"VS {datetime.now().year - 2} : {kpis['kpi_y2']:+.2f} m",
        f"VS {datetime.now().year - 3} : {kpis['kpi_y3']:+.2f} m",
        "</données>",
        "<instruction>Génère UNE PHRASE neutre et concise résumant si le niveau actuel est plus haut, équivalent ou plus bas que les années précédentes.</instruction>"
    ]
    prompt = "\n".join(parts)

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Tu es un expert en hydrologie, tu rédiges en français."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.5,
            max_tokens=100
        )

        content = response.choices[0].message.content.strip()
        usage = response.usage

        log_gpt_call(
            model="gpt-4o",
            prompt=prompt,
            response=content,
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
            type="comparaison_annuelle"
        )

        return content
    except Exception as e:
        return f"Erreur lors de l’appel à l’API : {e}"