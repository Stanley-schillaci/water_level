import streamlit as st
import pandas as pd
import plotly.express as px
import locale
from datetime import timedelta, datetime
import plotly.graph_objects as go

# locale.setlocale(locale.LC_TIME, 'fr_FR.UTF-8')

from webapp.data_access import (
    get_first_measure_data,
    get_all_data,
    get_threshold_lines,
    create_threshold_line,
    update_threshold_line,
    delete_threshold_line,
)
from webapp.ui_components import inject_kpi_style, render_kpi
from webapp.plotly_chart import create_interactive_chart_plotly
from webapp.colors import build_year_color_map
from webapp.kpi import compute_kpis  # Utilisation du calcul des KPI
from webapp.llm import generate_commentary, generate_annual_comparison
from update_missing_day import update_db
from bdd import init_db

# --- Mise à jour de la base de données avant l'interface ---
update_db()
# Création de la table threshold_line si nécessaire
init_db()

st.set_page_config(
    page_title="Surveillance du niveau d'eau",
    page_icon="💧",
    layout="wide"
)

st.title("Niveau d'eau du barrage du lac des Saints Peyres")

inject_kpi_style()

# --- Chargement et préparation des données ---
df_all = get_all_data()
if not df_all.empty:
    df_all["datetime_event"] = pd.to_datetime(df_all["datetime_event"], errors="coerce")
    df_all = df_all.dropna(subset=["datetime_event"]).sort_values("datetime_event")
    available_years = sorted(df_all["datetime_event"].dt.year.unique())
    global_color_map = build_year_color_map(available_years)
else:
    available_years = []
    global_color_map = {}

# --- KPI globaux ---
if not df_all.empty:
    kpi_data = compute_kpis(df_all)
    kpi_date = kpi_data.get("kpi_date")
    kpi_level = kpi_data.get("kpi_level")
    kpi_j1 = kpi_data.get("kpi_j1")
    kpi_j3 = kpi_data.get("kpi_j3")
    kpi_s1 = kpi_data.get("kpi_s1")
    kpi_7j = kpi_data.get("kpi_7j")
    kpi_y1 = kpi_data.get("kpi_y1")
    kpi_y2 = kpi_data.get("kpi_y2")
    kpi_y3 = kpi_data.get("kpi_y3")
else:
    kpi_date = kpi_level = kpi_j1 = kpi_j3 = kpi_s1 = kpi_7j = None

# Seuils actifs
thresholds = get_threshold_lines()

def get_local_comment(kpi_data, thresholds_df):
    thr_list = [
        dict(name=th.name, description=th.description, value=th.value)
        for th in thresholds_df.itertuples()
    ]
    return generate_commentary(kpi_data, thr_list)

# === Section 1 : Tendance actuelle ===

if kpi_7j is not None and kpi_7j > 0:
    emoji = "🟢"
elif kpi_7j is not None and kpi_7j < 0:
    emoji = "🔴"
else:
    emoji = "🟡"

st.markdown(f"## {emoji} Tendance actuelle")
commentary = get_local_comment(kpi_data, thresholds)
st.markdown("#### ✨ " + commentary)

# Première rangée de 3 KPI
col1, col2, col3 = st.columns(3)
with col1:
    st.markdown(render_kpi("Dernier relevé", kpi_date, is_delta=False), unsafe_allow_html=True)
with col2:
    st.markdown(
        render_kpi("Niveau actuel", f"{kpi_level:.2f} m" if kpi_level is not None else None, is_delta=False),
        unsafe_allow_html=True
    )
with col3:
    st.markdown(render_kpi("Tendance 7 jours (m/j)", kpi_7j, is_delta=True), unsafe_allow_html=True)

# Seconde rangée de 3 KPI
col4, col5, col6 = st.columns(3)
with col4:
    st.markdown(render_kpi("VS Hier", kpi_j1, is_delta=True), unsafe_allow_html=True)
with col5:
    st.markdown(render_kpi("VS Il y a 3 jours", kpi_j3, is_delta=True), unsafe_allow_html=True)
with col6:
    st.markdown(render_kpi("VS Semaine dernière", kpi_s1, is_delta=True), unsafe_allow_html=True)

if not df_all.empty:
    # _N_ jours sélectionnables par l’utilisateur
    days = st.number_input(
        "Afficher les derniers N jours",
        min_value=1, max_value=365, value=3, step=1
    )
    st.markdown(f"### Évolution sur les {days} derniers jours")

    # Filtrer
    start_dt = pd.Timestamp.now() - timedelta(days=days)
    df_window = df_all[df_all["datetime_event"] >= start_dt]

    if not df_window.empty:
        fig_recent = create_interactive_chart_plotly(
            data=df_window,
            x_field="datetime_event",
            y_field="value",
            x_axis_format="%d %b %H:%M",
            y_axis_label="Niveau d'eau (mNGF)",
            margin_value=1,
            # tu peux régler segment_size_hours ici si besoin
            horizontal_lines=thresholds
        )
        st.plotly_chart(fig_recent, width='stretch')
    else:
        st.write(f"Aucune donnée disponible pour les {days} derniers jours.")
else:
    st.write("Pas de données disponibles.")

st.markdown("---")

# === Section 2 : Comparaison annuelle ===
st.markdown("## 📈 Comparaison annuelle")

annual_comment = generate_annual_comparison(kpi_data)
st.markdown("#### ✨ " + annual_comment)
# KPI annuel
d1, d2, d3 = st.columns(3)
with d1:
    st.markdown(render_kpi(f"VS {datetime.now().year - 1}", kpi_y1, is_delta=True), unsafe_allow_html=True)
with d2:
    st.markdown(render_kpi(f"VS {datetime.now().year - 2}", kpi_y2, is_delta=True), unsafe_allow_html=True)
with d3:
    st.markdown(render_kpi(f"VS {datetime.now().year - 3}", kpi_y3, is_delta=True), unsafe_allow_html=True)

# --- Graphique 2 : comparaison annuelle ---
df_comparison = get_first_measure_data()
if not df_comparison.empty:
    df_comparison["Date"] = pd.to_datetime(df_comparison["date"], format="%Y-%m-%d")
    df_comparison = df_comparison.sort_values("Date")
    df_comparison["Year"] = df_comparison["Date"].dt.year
    df_comparison["dummy_date"] = pd.to_datetime(
        "2000-" + df_comparison["Date"].dt.strftime("%m-%d")
    )

    default_years = [
        y for y in range(datetime.now().year, datetime.now().year - 4, -1)
        if y in available_years
    ]
    selected_years = st.multiselect(
        "Sélectionnez les années à comparer",
        options=available_years,
        default=default_years
    )

    df_selected = df_comparison[df_comparison["Year"].isin(selected_years)]
    if not df_selected.empty:
        st.markdown("### Par année (du 1er janvier au 31 décembre)")
        fig4 = px.line(
            df_selected,
            x="dummy_date",
            y="value",
            color="Year",
            labels={"dummy_date": "Date", "value": "Niveau d'eau (mNGF)", "Year": "Année"},
            color_discrete_map=global_color_map
        )
        fig4.update_layout(
            width=800,
            height=800,
            margin=dict(l=20, r=20, t=20, b=20),
            legend=dict(orientation="h", yanchor="top", y=-0.2, xanchor="center", x=0.5),
            xaxis=dict(
                range=["2000-01-01", "2000-12-31"],
                tickformat="%B",
                hoverformat="%d %B",
                tickangle=-45,
                side="bottom",
                title=None,
                dtick="M1"
            ),
            hovermode="x unified"
        )
        for trace in fig4.data:
            trace.hovertemplate = "%{data.name} : %{y:.2f} m<extra></extra>"
        # Ajout des lignes horizontales de seuil
        # fig4 : comparaison annuelle
        for th in thresholds.itertuples():
            fig4.add_hline(
                y=th.value,
                line_color=th.color,
                line_dash=th.dash_style,
                annotation_text=th.name,
                annotation_position="top left"
            )
        st.plotly_chart(fig4, width='stretch')
    else:
        st.write("Aucune donnée pour les années sélectionnées.")
else:
    st.write("Aucune donnée pour la comparaison annuelle.")

# --- Graphique 1 : évolution quotidienne depuis 2021-07-07 ---
df_daily = get_first_measure_data()
if not df_daily.empty:
    df_daily["Date"] = pd.to_datetime(df_daily["date"], format="%Y-%m-%d")
    df_daily = df_daily.sort_values("Date")
    df_daily["Year"] = df_daily["Date"].dt.year

    st.markdown("### Évolution quotidienne du niveau d'eau (depuis le 7 juillet 2021)")
    fig3 = px.line(
        df_daily,
        x="Date",
        y="value",
        color="Year",
        color_discrete_map=global_color_map,
        labels={"value": "Niveau d'eau (mNGF)", "Date": "Date", "Year": "Année"}
    )
    # Axe X avec date au format "jour mois année"
    fig3.update_layout(
        hovermode="x unified",
        margin=dict(l=20, r=20, t=20, b=20),
        xaxis=dict(
            tickformat="%B %Y",
            hoverformat="%d %B %Y",
            tickangle=-45,
            title=None,
            dtick="M3"
        ),
        legend=dict(orientation="h", yanchor="top", y=-0.3, xanchor="center", x=0.5)
    )
    for trace in fig3.data:
        trace.hovertemplate = "Niveau : %{y:.2f} m<extra></extra>"
    # Ajout des lignes horizontales de seuil
    # fig3 : évolution quotidienne
    for th in thresholds.itertuples():
        fig3.add_hline(
            y=th.value,
            line_color=th.color,            # couleur depuis la BDD
            line_dash=th.dash_style,        # style (solid, dash, dot…)
            annotation_text=th.name,
            annotation_position="top left"
        )
    st.plotly_chart(fig3, width='stretch')
else:
    st.write("Aucune donnée pour la première mesure quotidienne.")

from webapp.forecast import forecast_water_level

st.markdown("## 🔮 Prévision jusqu’à la fin de l’année")

# Forecast uniquement si données suffisantes
if not df_all.empty and len(df_all) > 100:
    try:
        forecast_df = forecast_water_level(df_all)
        forecast_df = forecast_df[forecast_df["ds"] > pd.Timestamp.now()]  # que le futur

        fig_forecast = go.Figure()
        fig_forecast.add_trace(go.Scatter(
            x=df_all["datetime_event"], y=df_all["value"],
            mode="lines", name="Historique"
        ))
        fig_forecast.add_trace(go.Scatter(
            x=forecast_df["ds"], y=forecast_df["yhat"],
            mode="lines", name="Prévision",
            line=dict(dash="dot", color="black")
        ))
        for th in thresholds.itertuples():
            fig_forecast.add_hline(
                y=th.value,
                line_color=th.color,
                line_dash=th.dash_style,
                annotation_text=th.name,
                annotation_position="top left"
            )

        fig_forecast.update_layout(
            title="Prévision du niveau d'eau",
            xaxis_title="Date",
            yaxis_title="Niveau (mNGF)",
            hovermode="x unified",
            margin=dict(l=20, r=20, t=40, b=20)
        )
        st.plotly_chart(fig_forecast, width='stretch')
    except Exception as e:
        st.error(f"Erreur lors de la prévision : {e}")
        import traceback
        st.code(traceback.format_exc())
else:
    st.info("Pas assez de données pour générer une prévision.")

# --- Interface de gestion des lignes de seuil ---

st.markdown("## ⚙️ Gestion des lignes de seuil")

dash_options = {
    "Solide": "solid",
    "Tiret": "dash",
    "Points": "dot",
    "Tiret-point": "dashdot",
    "Double tiret": "longdash"
}

# Formulaire d'ajout
with st.expander("Ajouter une ligne de seuil"):
    with st.form("add_threshold"):
        new_name        = st.text_input("Nom court à afficher")
        new_description = st.text_area("Description détaillée (non affichée sur le graphique)")
        new_value       = st.number_input(
            "Valeur (mètre)",
            format="%.2f",
            min_value=630.0,
            max_value=680.0,
            step=0.1
        )
        new_color       = st.color_picker("Couleur de la ligne", "#1f77b4")
        new_dash_label  = st.selectbox("Style de ligne", options=list(dash_options.keys()))
        if st.form_submit_button("Ajouter"):
            create_threshold_line(
                name=new_name,
                description=new_description,
                value=new_value,
                color=new_color,
                dash_style=dash_options[new_dash_label]
            )
            st.success(f"Ligne « {new_name} » ajoutée.")
            st.rerun()

# Liste, modification et suppression
if thresholds.empty:
    st.info("Aucune ligne définie pour l’instant.")
else:
    for th in thresholds.itertuples():
        with st.expander(f"{th.name} — {th.value:.2f} m"):
            mod_name        = st.text_input("Nom court", th.name, key=f"name_{th.id}")
            mod_description = st.text_area("Description détaillée", th.description, key=f"desc_{th.id}")
            mod_value       = st.number_input(
                "Valeur (mètre)",
                value=th.value,
                min_value=630.0,
                max_value=680.0,
                format="%.2f",
                step=0.1,
                key=f"value_{th.id}"
            )
            mod_color = st.color_picker("Couleur", th.color, key=f"color_{th.id}")
            current_dash_label = [k for k,v in dash_options.items() if v == th.dash_style][0]
            mod_dash_label = st.selectbox(
                "Style de ligne",
                options=list(dash_options.keys()),
                index=list(dash_options.keys()).index(current_dash_label),
                key=f"dash_{th.id}"
            )
            btn_col1, btn_col2 = st.columns(2)
            if btn_col1.button("Modifier", key=f"mod_{th.id}"):
                update_threshold_line(
                    id=th.id,
                    name=mod_name,
                    description=mod_description,
                    value=mod_value,
                    color=mod_color,
                    dash_style=dash_options[mod_dash_label]
                )
                st.success("Modifié.")
                st.rerun()
            if btn_col2.button("Supprimer", key=f"del_{th.id}"):
                delete_threshold_line(th.id)
                st.warning("Supprimé.")
                st.rerun()