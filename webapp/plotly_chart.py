import pandas as pd
import plotly.express as px
import locale

#locale.setlocale(locale.LC_TIME, 'fr_FR.UTF-8')

def create_interactive_chart_plotly(
    data: pd.DataFrame,
    x_field: str,
    y_field: str,
    x_axis_format: str,
    y_axis_label: str,
    margin_value: float,
    chart_width: int = 800,
    chart_height: int = 400,
    color: str = "#1f77b4",
    dtick: str = None
):
    """Create a basic interactive line chart with uniform hover."""
    y_min = data[y_field].min() - margin_value
    y_max = data[y_field].max() + margin_value
    x_min = data[x_field].min()
    x_max = data[x_field].max()

    fig = px.line(
        data_frame=data,
        x=x_field,
        y=y_field,
        color_discrete_sequence=[color],
        labels={y_field: "Water Level"}
    )
    fig.update_layout(
        hovermode='x unified',
        width=chart_width,
        height=chart_height,
        margin=dict(l=20, r=20, t=20, b=20),
        xaxis=dict(
            range=[x_min, x_max],
            dtick=dtick,
            tickformat=x_axis_format,
            tickangle=-45,
            side="bottom",
            title=None
        ),
        yaxis=dict(
            range=[y_min, y_max],
            title=y_axis_label
        )
    )
    fig.update_traces(
        line=dict(width=2),
        hovertemplate=(
            "<b>Niveau:</b> %{y:.2f} m"
        ),
        showlegend=False
    )
    return fig