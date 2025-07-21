import pandas as pd
import plotly.graph_objects as go
from typing import List, Dict
import numpy as np
from sklearn.linear_model import LinearRegression

def create_interactive_chart_plotly(
    data: pd.DataFrame,
    x_field: str,
    y_field: str,
    x_axis_format: str,
    y_axis_label: str,
    margin_value: float,
    chart_width: int = 800,
    chart_height: int = 800,
    slope_threshold: float = 0.03,     # pente max pour normalisation
    segment_size_hours: int = 1,       # taille d'un segment en heures
    horizontal_lines=None              # DataFrame ou liste de dicts
):
    """
    Trace chaque segment de durée `segment_size_hours` avec un gradient saturé :
      - pour s < 0 : du rouge foncé (faible baisse) au rouge vif (forte baisse)
      - pour s > 0 : du vert foncé (faible montée) au vert vif (forte montée)
    """
    # — Préparation et rééchantillonnage —
    df = data.copy()
    df[x_field] = pd.to_datetime(df[x_field])
    df = (
        df
        .set_index(x_field)
        .resample(f"{segment_size_hours}h")
        .mean()[[y_field]]
        .dropna()
        .reset_index()
        .sort_values(x_field)
    )

    # — Calcul des pentes —
    df['delta'] = df[y_field].diff()
    df['slope'] = df['delta'] / segment_size_hours

    # — Construction des segments —
    segments = []
    for i in range(1, len(df)):
        segments.append({
            'x':     [df.loc[i-1, x_field], df.loc[i, x_field]],
            'y':     [df.loc[i-1, y_field], df.loc[i, y_field]],
            'slope': df.loc[i, 'slope']
        })

    # — Mapping pente → couleur saturée —
    def slope_to_color(s):
        # normaliser dans [-1,1]
        v = max(min(s / slope_threshold, 1), -1)
        if v >= 0:
            # faible montée = vert foncé (0,150,0) → forte montée = vert vif (0,255,0)
            g = int(150 + 105 * v)
            return f"rgb(0,{g},0)"
        else:
            # faible baisse = rouge foncé (150,0,0) → forte baisse = rouge vif (255,0,0)
            r = int(150 + 105 * (-v))
            return f"rgb({r},0,0)"

    # — Construction de la figure —
    fig = go.Figure()
    for seg in segments:
        fig.add_trace(go.Scatter(
            x=seg['x'], y=seg['y'],
            mode='lines',
            line=dict(color=slope_to_color(seg['slope']), width=3),
            hoverinfo='skip',
            showlegend=False
        ))

    # — Trace invisible pour le tooltip —
    fig.add_trace(go.Scatter(
        x=df[x_field], y=df[y_field],
        mode='markers',
        marker=dict(size=20, color='rgba(0,0,0,0)'),
        customdata=df['slope'],
        hovertemplate=(
            "Date : %{x|%d %b %Y %H:%M}<br>"
            "Hauteur : %{y:.2f} m<br>"
            "Pente : %{customdata:.3f} m/h<extra></extra>"
        ),
        showlegend=False
    ))

    # — Layout —
    y_min, y_max = df[y_field].min() - margin_value, df[y_field].max() + margin_value
    x_min, x_max = df[x_field].min(), df[x_field].max()
    fig.update_layout(
        hovermode='closest',
        width=chart_width, height=chart_height,
        margin=dict(l=20, r=20, t=20, b=20),
        xaxis=dict(range=[x_min, x_max], tickformat=x_axis_format, tickangle=-45, title=None),
        yaxis=dict(range=[y_min, y_max], title=y_axis_label)
    )

    # — Lignes de seuil —
    lines: List[Dict] = []
    if horizontal_lines is not None:
        if isinstance(horizontal_lines, pd.DataFrame):
            lines = horizontal_lines.to_dict('records')
        else:
            lines = horizontal_lines
    for line in lines:
        fig.add_hline(
            y=line['value'],
            line_color=line['color'],
            line_dash=line['dash_style'],
            annotation_text=line['name'],
            annotation_position='top left'
        )

        # — Régression linéaire (tendance globale) —
    if len(df) >= 2:
        # Transformer les dates en valeurs numériques
        df['_ts'] = df[x_field].astype(np.int64) // 10**9  # timestamp en secondes
        X = df[['_ts']].values
        y = df[y_field].values

        model = LinearRegression()
        model.fit(X, y)
        y_pred = model.predict(X)

        # Tracer la tendance
        fig.add_trace(go.Scatter(
            x=df[x_field],
            y=y_pred,
            mode='lines',
            line=dict(color='black', width=2, dash='dot'),
            name="Tendance linéaire",
            hoverinfo='skip',
            showlegend=False
        ))

    return fig