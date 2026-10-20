import pytest
from pydantic import ValidationError

from app.modules.simulation.engine import (
    AIR_TEMPERATURE,
    MAX_STEPS,
    MODEL_VERSION,
    RELATIVE_HUMIDITY,
    SCENARIOS,
    SimulationInputs,
    generate,
    heat_delta,
)

INPUTS = SimulationInputs()


def series(seed, scenario, inputs=INPUTS, device=0, steps=None):
    return [generate(seed, scenario, inputs, s, device) for s in (steps or range(inputs.total_steps))]


def test_defaults_are_example_values_with_288_steps():
    assert MODEL_VERSION == "didactic-v1"
    assert INPUTS.total_steps == 288  # 24 h a 5 min por paso


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_golden_same_seed_same_series_and_other_seed_differs(scenario):
    assert series(42, scenario) == series(42, scenario)
    assert series(42, scenario) != series(43, scenario)


def test_golden_snapshot_pins_didactic_v1():
    # Si cambian estos valores, cambió el motor: hay que subir MODEL_VERSION.
    assert generate(42, "base", INPUTS, 0) == {AIR_TEMPERATURE: 16.75, RELATIVE_HUMIDITY: 78.03}
    assert generate(42, "base", INPUTS, 100) == {AIR_TEMPERATURE: 22.42, RELATIVE_HUMIDITY: 64.41}
    assert generate(42, "heat_rise", INPUTS, 100) == {AIR_TEMPERATURE: 30.42, RELATIVE_HUMIDITY: 44.41}


def test_independent_of_calculation_order_and_device_noise_differs():
    forward = series(7, "base", steps=range(50))
    backward = list(reversed(series(7, "base", steps=range(49, -1, -1))))
    assert forward == backward
    assert series(7, "base", device=0, steps=range(10)) != series(7, "base", device=1, steps=range(10))


def test_heat_rise_ramps_saturates_and_ventilates():
    assert heat_delta(INPUTS, 59) == 0
    assert heat_delta(INPUTS, 60) == 0
    assert heat_delta(INPUTS, 78) == pytest.approx(4.0)  # mitad de la rampa de 36 pasos
    assert heat_delta(INPUTS, 96) == pytest.approx(8.0)  # saturación
    assert heat_delta(INPUTS, 179) == pytest.approx(8.0)
    assert heat_delta(INPUTS, 198) == pytest.approx(4.0)  # ventilación: baja con el mismo retardo
    assert heat_delta(INPUTS, 216) == 0
    base, heat = generate(1, "base", INPUTS, 120), generate(1, "heat_rise", INPUTS, 120)
    assert heat[AIR_TEMPERATURE] == pytest.approx(base[AIR_TEMPERATURE] + 8.0, abs=0.01)
    assert heat[RELATIVE_HUMIDITY] < base[RELATIVE_HUMIDITY]


def test_sensor_loss_only_affects_one_device_in_its_window():
    lost = series(3, "sensor_loss", device=0)
    other = series(3, "sensor_loss", device=1)
    missing = [i for i, v in enumerate(lost) if v[AIR_TEMPERATURE] is None]
    assert missing == list(range(60, 84))
    assert all(v == {AIR_TEMPERATURE: None, RELATIVE_HUMIDITY: None} for v in lost[60:84])
    assert all(v[AIR_TEMPERATURE] is not None for v in other)
    assert lost[84] == generate(3, "base", INPUTS, 84, 0)  # se recupera


def test_humidity_is_clamped_to_0_100():
    wet = SimulationInputs(temp_mean_c=20, temp_amplitude_c=20, humidity_mean_pct=100, humidity_coupling=10)
    values = [v[RELATIVE_HUMIDITY] for v in series(5, "base", wet)]
    assert max(values) == 100.0 and min(values) == 0.0
    assert all(0 <= v <= 100 for v in values)


@pytest.mark.parametrize(
    "bad",
    [
        {"temp_mean_c": 50.5},
        {"temp_mean_c": -10.5},
        {"temp_amplitude_c": 21},
        {"step_minutes": 0},
        {"step_minutes": 61},
        {"horizon_hours": 169},
        {"horizon_hours": 0},
        {"step_minutes": 1, "horizon_hours": 100},  # 6000 pasos > 5000
        {"tick_seconds": 0.4},
        {"heat_start_step": 100, "heat_end_step": 100},
        {"temp_mean_c": float("nan")},
        {"desconocido": 1},
    ],
)
def test_inputs_validated_against_general_physical_ranges(bad):
    with pytest.raises(ValidationError):
        SimulationInputs(**bad)


def test_max_steps_boundary():
    assert SimulationInputs(step_minutes=2, horizon_hours=MAX_STEPS * 2 / 60).total_steps == MAX_STEPS


def test_unknown_scenario_rejected():
    with pytest.raises(ValueError):
        generate(1, "tormenta", INPUTS, 0)
