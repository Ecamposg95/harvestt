"""Motor didáctico `didactic-v1`: funciones puras, sin estado ni E/S.

No es un modelo agronómico: genera series plausibles para demostrar la plataforma.
"""
import math
import random
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MODEL_VERSION = "didactic-v1"

SCENARIO_BASE = "base"
SCENARIO_HEAT_RISE = "heat_rise"
SCENARIO_SENSOR_LOSS = "sensor_loss"
SCENARIOS = (SCENARIO_BASE, SCENARIO_HEAT_RISE, SCENARIO_SENSOR_LOSS)
ScenarioLiteral = Literal["base", "heat_rise", "sensor_loss"]

AIR_TEMPERATURE = "air_temperature"
RELATIVE_HUMIDITY = "relative_humidity"
VARIABLES = (AIR_TEMPERATURE, RELATIVE_HUMIDITY)
VariableLiteral = Literal["air_temperature", "relative_humidity"]
UNITS = {AIR_TEMPERATURE: "Cel", RELATIVE_HUMIDITY: "%"}

MAX_STEPS = 5000
MAX_HORIZON_HOURS = 168  # 7 días

LIMITS = [
    "Simulación didáctica, sin calibración agronómica.",
    "Modelo didactic-v1: curva diurna sinusoidal con ruido pseudoaleatorio; no representa un invernadero real.",
    "La humedad relativa se deriva de la temperatura con una relación inversa didáctica, acotada a 0–100 %.",
    "Los parámetros son valores de ejemplo dentro de rangos físicos generales; no son recomendaciones de cultivo.",
]


def _num(default: float, **bounds):
    return Field(default=default, allow_inf_nan=False, **bounds)


class SimulationInputs(BaseModel):
    """Parámetros del motor. Los valores por defecto son de ejemplo, nunca óptimos agronómicos."""

    model_config = ConfigDict(extra="forbid")

    temp_mean_c: float = _num(22.0, ge=-10, le=50)
    temp_amplitude_c: float = _num(6.0, ge=0, le=20)
    peak_hour: float = _num(14.0, ge=0, lt=24)
    temp_noise_c: float = _num(0.3, ge=0, le=5)
    humidity_mean_pct: float = _num(65.0, ge=0, le=100)
    humidity_coupling: float = _num(2.5, ge=0, le=10)
    humidity_noise_pct: float = _num(1.0, ge=0, le=10)
    step_minutes: int = Field(default=5, ge=1, le=60)
    horizon_hours: float = _num(24.0, gt=0, le=MAX_HORIZON_HOURS)
    tick_seconds: float = _num(2.0, ge=0.5, le=60)
    heat_start_step: int = Field(default=60, ge=0, le=MAX_STEPS)
    heat_ramp_steps: int = Field(default=36, ge=1, le=MAX_STEPS)
    heat_end_step: int = Field(default=180, ge=1, le=MAX_STEPS)
    heat_peak_c: float = _num(8.0, ge=0, le=20)
    loss_device: int = Field(default=0, ge=0, le=9)
    loss_start_step: int = Field(default=60, ge=0, le=MAX_STEPS)
    loss_steps: int = Field(default=24, ge=1, le=MAX_STEPS)

    @property
    def total_steps(self) -> int:
        return math.ceil(self.horizon_hours * 60 / self.step_minutes)

    @model_validator(mode="after")
    def _check(self):
        if self.total_steps > MAX_STEPS:
            raise ValueError(f"El horizonte genera {self.total_steps} pasos; el máximo por corrida es {MAX_STEPS}")
        if self.heat_end_step <= self.heat_start_step:
            raise ValueError("heat_end_step debe ser mayor que heat_start_step")
        return self


def heat_delta(inputs: SimulationInputs, step: int) -> float:
    """Rampa de `heat_rise`: sube durante `heat_ramp_steps` (retardo), satura en `heat_peak_c` y,
    desde `heat_end_step` (ventilación didáctica), baja con el mismo retardo."""
    start, ramp, end, peak = inputs.heat_start_step, inputs.heat_ramp_steps, inputs.heat_end_step, inputs.heat_peak_c
    if step < start:
        return 0.0
    if step < end:
        return peak * min(1.0, (step - start) / ramp)
    reached = peak * min(1.0, (end - start) / ramp)
    return reached * max(0.0, 1.0 - (step - end) / ramp)


def _noise(seed: int, step: int, device: int, variable: str, amplitude: float) -> float:
    # Un generador por (semilla, paso, dispositivo, variable): determinista e independiente del orden de cálculo.
    return random.Random(f"{seed}:{step}:{device}:{variable}").uniform(-amplitude, amplitude)


def generate(
    seed: int, scenario: str, inputs: SimulationInputs, step: int, device: int = 0
) -> dict[str, float | None]:
    """Valores de un dispositivo (índice en la corrida) en un paso. `None` = sin lectura."""
    if scenario not in SCENARIOS:
        raise ValueError(f"escenario desconocido: {scenario}")
    if (
        scenario == SCENARIO_SENSOR_LOSS
        and device == inputs.loss_device
        and inputs.loss_start_step <= step < inputs.loss_start_step + inputs.loss_steps
    ):
        return {v: None for v in VARIABLES}

    hours = step * inputs.step_minutes / 60
    temp = inputs.temp_mean_c + inputs.temp_amplitude_c * math.cos(2 * math.pi * (hours - inputs.peak_hour) / 24)
    if scenario == SCENARIO_HEAT_RISE:
        temp += heat_delta(inputs, step)
    temp += _noise(seed, step, device, AIR_TEMPERATURE, inputs.temp_noise_c)

    humidity = inputs.humidity_mean_pct - inputs.humidity_coupling * (temp - inputs.temp_mean_c)
    humidity += _noise(seed, step, device, RELATIVE_HUMIDITY, inputs.humidity_noise_pct)
    humidity = min(100.0, max(0.0, humidity))
    return {AIR_TEMPERATURE: round(temp, 2), RELATIVE_HUMIDITY: round(humidity, 2)}
