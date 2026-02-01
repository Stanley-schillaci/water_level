from prophet import Prophet
import pandas as pd

def forecast_water_level(df_all, days_ahead=160):
    """
    Prend un DataFrame df_all avec colonnes 'datetime_event' et 'value',
    renvoie un DataFrame de prévisions avec colonnes 'ds', 'yhat'.
    """
    df = df_all.copy()
    df = df.rename(columns={"datetime_event": "ds", "value": "y"})
    df = df[["ds", "y"]].dropna()
    
    model = Prophet(daily_seasonality=True, yearly_seasonality=True)
    model.fit(df)

    future = model.make_future_dataframe(periods=days_ahead)
    forecast = model.predict(future)
    return forecast[["ds", "yhat"]]