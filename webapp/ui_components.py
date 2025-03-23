import streamlit as st

KPI_STYLE = """
<style>
.kpi-card {
    background-color: #f0f2f6;
    border-radius: 10px;
    padding: 20px;
    text-align: center;
    box-shadow: 2px 2px 10px rgba(0,0,0,0.1);
    margin: 10px;
}
.kpi-title {
    font-size: 16px;
    color: #333;
    margin-bottom: 5px;
}
.kpi-value {
    font-size: 24px;
    font-weight: bold;
    color: #1f77b4;
}
.kpi-delta-positive {
    color: green;
    font-size: 20px;
}
.kpi-delta-negative {
    color: red;
    font-size: 20px;
}
</style>
"""

def inject_kpi_style():
    """Inject CSS for KPI cards."""
    st.markdown(KPI_STYLE, unsafe_allow_html=True)

def render_kpi(title, value, is_delta=False):
    """Render KPI card with optional delta arrow."""
    if value is None:
        display_value = "N/A"
    else:
        if is_delta:
            try:
                num = float(value)
            except Exception:
                num = 0.0
            arrow = "▲" if num >= 0 else "▼"
            color_class = "kpi-delta-positive" if num >= 0 else "kpi-delta-negative"
            display_value = f'<span class="{color_class}">{arrow} {abs(num):.2f} m</span>'
        else:
            display_value = f"{value}"
    return f"""
    <div class="kpi-card">
      <div class="kpi-title">{title}</div>
      <div class="kpi-value">{display_value}</div>
    </div>
    """