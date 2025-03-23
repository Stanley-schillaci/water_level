import streamlit as st
import pandas as pd
import plotly.express as px
import locale

from datetime import timedelta, datetime
#locale.setlocale(locale.LC_TIME, 'fr_FR.UTF-8')

from webapp.data_access import get_first_measure_data, get_all_data
from webapp.ui_components import inject_kpi_style, render_kpi
from webapp.plotly_chart import create_interactive_chart_plotly
from webapp.colors import build_year_color_map
from webapp.kpi import compute_kpis  # Utilisation du calcul des KPI
from update_missing_day import update_db


# --- Mise à jour de la base de données avant l'interface ---
update_db()

st.set_page_config(
    page_title="Surveillance du niveau d'eau",
    page_icon="💧",
    layout="wide"
)

st.title("Niveau d'eau du barrage du lac des Saints Peyres")

inject_kpi_style()

# Récupérer et préparer les données
df_all = get_all_data()
if not df_all.empty:
    df_all["datetime_event"] = pd.to_datetime(df_all["datetime_event"], errors="coerce")
    df_all = df_all.dropna(subset=["datetime_event"]).sort_values("datetime_event")
    available_years = sorted(df_all["datetime_event"].dt.year.unique())
    global_color_map = build_year_color_map(available_years)
else:
    available_years = []
    global_color_map = {}

# --- Calcul des KPI via kpi.py ---
if not df_all.empty:
    kpi_data = compute_kpis(df_all)
    kpi_date = kpi_data.get("kpi_date")  # Format "%d %B %Y %H:%M"
    kpi_level = kpi_data.get("kpi_level")
    kpi_j1 = kpi_data.get("kpi_j1")
    kpi_s1 = kpi_data.get("kpi_s1")
    kpi_m1 = kpi_data.get("kpi_m1")
    kpi_m2 = kpi_data.get("kpi_m2")
    kpi_y1 = kpi_data.get("kpi_y1")
    kpi_y2 = kpi_data.get("kpi_y2")
else:
    kpi_date = kpi_level = kpi_j1 = kpi_s1 = kpi_m1 = kpi_m2 = kpi_y1 = kpi_y2 = None

# --- Affichage des KPI ---
col1, col2, col3, col4 = st.columns(4)
with col1:
    st.markdown(render_kpi("Dernier relevé", kpi_date, is_delta=False), unsafe_allow_html=True)
    st.markdown(render_kpi("Niveau actuel", f"{kpi_level:.2f} m" if kpi_level is not None else None, is_delta=False), unsafe_allow_html=True)
with col2:
    st.markdown(render_kpi("VS Hier", kpi_j1, is_delta=True), unsafe_allow_html=True)
    st.markdown(render_kpi("VS La semaine dernière", kpi_s1, is_delta=True), unsafe_allow_html=True)
with col3:
    st.markdown(render_kpi("VS Le mois dernier", kpi_m1, is_delta=True), unsafe_allow_html=True)
    st.markdown(render_kpi("VS Il y a 2 mois", kpi_m2, is_delta=True), unsafe_allow_html=True)
with col4:
    st.markdown(render_kpi("VS L'an dernier", kpi_y1, is_delta=True), unsafe_allow_html=True)
    st.markdown(render_kpi("VS Il y a 2 ans", kpi_y2, is_delta=True), unsafe_allow_html=True)

# --- Graphique : évolution quotidienne depuis 2021-07-07 ---
df_daily = get_first_measure_data()
if not df_daily.empty:
    df_daily["Date"] = pd.to_datetime(df_daily["date"], format="%Y-%m-%d")
    df_daily = df_daily.sort_values("Date")
    df_daily["Year"] = df_daily["Date"].dt.year

    st.subheader("Évolution quotidienne du niveau d'eau (depuis le 7 juillet 2021)")
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
        xaxis=dict(tickformat="%B %Y", hoverformat="%d %B %Y", tickangle=-45, title=None, dtick="M3"),
        legend=dict(orientation="h", yanchor="top", y=-0.3, xanchor="center", x=0.5)
    )
    for trace in fig3.data:
        trace.hovertemplate = f"Niveau : %{{y:.2f}} m<extra></extra>"
    st.plotly_chart(fig3, use_container_width=True)
else:
    st.write("Aucune donnée pour la première mesure quotidienne.")

# --- Graphique : comparaison annuelle ---
df_comparison = get_first_measure_data()
if not df_comparison.empty:
    df_comparison["Date"] = pd.to_datetime(df_comparison["date"], format="%Y-%m-%d")
    df_comparison = df_comparison.sort_values("Date")
    df_comparison["Year"] = df_comparison["Date"].dt.year
    df_comparison["dummy_date"] = pd.to_datetime("2000-" + df_comparison["Date"].dt.strftime("%m-%d"))

    default_years = [y for y in range(datetime.now().year, datetime.now().year - 3, -1) if y in available_years]
    selected_years = st.multiselect(
        "Sélectionnez les années à comparer",
        options=available_years,
        default=default_years
    )

    df_selected = df_comparison[df_comparison["Year"].isin(selected_years)]
    if not df_selected.empty:
        st.subheader("Comparaison annuelle (du 1er janvier au 31 décembre)")
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
                tickformat="%B",  # Affiche uniquement jour et mois
                hoverformat="%d %B %Y",
                tickangle=-45,
                side="bottom",
                title=None,
                dtick="M1"
            ),
            hovermode="x unified"  # Active le tooltip unifié
        )
        # Pour chaque trace, on définit un hovertemplate qui affiche le nom de la trace (année) et le niveau d'eau.
        for trace in fig4.data:
            trace.hovertemplate = "%{data.name} : %{y:.2f} m<extra></extra>"
        st.plotly_chart(fig4, use_container_width=True)
    else:
        st.write("Aucune donnée pour les années sélectionnées.")
else:
    st.write("Aucune donnée pour la comparaison annuelle.")

# --- Graphique : données horaires sur les 3 derniers jours ---
if not df_all.empty:
    df_all["datetime_event"] = pd.to_datetime(df_all["datetime_event"])
    three_days_ago = pd.Timestamp.now() - timedelta(days=3)
    df_last3days = df_all[df_all["datetime_event"] >= three_days_ago]
    if not df_last3days.empty:
        st.subheader("Évolution sur les 3 derniers jours (par heure)")
        fig2 = create_interactive_chart_plotly(
            data=df_last3days,
            x_field="datetime_event",
            y_field="value",
            x_axis_format="%d %B %Y %H:%M",  # Date et heure complets
            y_axis_label="Niveau d'eau (mNGF)",
            margin_value=1
        )
        st.plotly_chart(fig2, use_container_width=True)
    else:
        st.write("Aucune donnée disponible pour les 3 derniers jours.")
else:
    st.write("Aucune donnée disponible.")

# --- Graphique : évolution depuis le début de l'année ---
df_year = get_first_measure_data()
if not df_year.empty:
    df_year["Date"] = pd.to_datetime(df_year["date"], format="%Y-%m-%d")
    df_year = df_year.sort_values("Date")
    start_of_year = pd.Timestamp.now().replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    df_year = df_year[df_year["Date"] >= start_of_year]
    if not df_year.empty:
        st.subheader("Évolution depuis le début de l'année (par jour)")
        fig_year = create_interactive_chart_plotly(
            data=df_year,
            x_field="Date",
            y_field="value",
            x_axis_format="%d %B %Y",  # Date sans heure
            y_axis_label="Niveau d'eau (mNGF)",
            margin_value=1
        )
        st.plotly_chart(fig_year, use_container_width=True)
    else:
        st.write("Aucune donnée disponible pour l'année en cours.")
else:
    st.write("Aucune donnée pour les mesures quotidiennes.")