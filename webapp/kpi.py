import locale
from datetime import timedelta

# locale.setlocale(locale.LC_TIME, 'fr_FR.UTF-8')

def get_closest_value(df, target_time):
    """Return last value <= target_time."""
    df_filtered = df[df["datetime_event"] <= target_time]
    return None if df_filtered.empty else df_filtered.iloc[-1]["value"]

def compute_kpis(df_all):
    """Compute KPI values for recent trends and comparisons."""
    if df_all.empty:
        return {}

    df_all = df_all.sort_values("datetime_event")
    current_row = df_all.iloc[-1]
    current_value = current_row["value"]
    current_date = current_row["datetime_event"]

    # Last measurement timestamp
    kpi_date = current_date.strftime("%d %B %Y %H:%M")
    # Current water level
    kpi_level = current_value

    # Comparison vs 1 day ago
    value_j1 = get_closest_value(df_all, current_date - timedelta(days=1))
    kpi_j1 = current_value - value_j1 if value_j1 is not None else None

    # Comparison vs 3 days ago
    value_j3 = get_closest_value(df_all, current_date - timedelta(days=3))
    kpi_j3 = current_value - value_j3 if value_j3 is not None else None

    # Comparison vs 1 week ago
    value_s1 = get_closest_value(df_all, current_date - timedelta(weeks=1))
    kpi_s1 = current_value - value_s1 if value_s1 is not None else None

    # Trend over last 7 days (average daily change)
    kpi_7j = (kpi_s1 / 7) if kpi_s1 is not None else None

    # Comparison vs 1 month ago
    value_m1 = get_closest_value(df_all, current_date - timedelta(days=30))
    kpi_m1 = current_value - value_m1 if value_m1 is not None else None

    # Comparison vs 2 months ago
    value_m2 = get_closest_value(df_all, current_date - timedelta(days=60))
    kpi_m2 = current_value - value_m2 if value_m2 is not None else None

    # Comparison vs 1 year ago
    value_y1 = get_closest_value(df_all, current_date - timedelta(days=365))
    kpi_y1 = current_value - value_y1 if value_y1 is not None else None

    # Comparison vs 2 years ago
    value_y2 = get_closest_value(df_all, current_date - timedelta(days=730))
    kpi_y2 = current_value - value_y2 if value_y2 is not None else None

    # Comparison vs 3 years ago
    value_y3 = get_closest_value(df_all, current_date - timedelta(days=1095))
    kpi_y3 = current_value - value_y3 if value_y3 is not None else None

    return {
        "kpi_date": kpi_date,
        "kpi_level": kpi_level,
        "kpi_j1": kpi_j1,
        "kpi_j3": kpi_j3,
        "kpi_s1": kpi_s1,
        "kpi_7j": kpi_7j,
        "kpi_m1": kpi_m1,
        "kpi_m2": kpi_m2,
        "kpi_y1": kpi_y1,
        "kpi_y2": kpi_y2,
        "kpi_y3": kpi_y3,
    }