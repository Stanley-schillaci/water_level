def build_year_color_map(years_list):
    """Map each year to a fixed color palette."""
    colors = [
        "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728",
        "#9467bd", "#8c564b", "#e377c2", "#7f7f7f"
    ]
    reversed_years = list(reversed(years_list))
    color_map = {}
    for idx, year in enumerate(reversed_years):
        color_map[year] = colors[idx % len(colors)]
    return color_map