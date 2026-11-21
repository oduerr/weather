#!/usr/bin/env python3
"""
Verification of the FogCast forecast models against DWD observations.

FogCast has its own benchmark (`/models/benchmarking`, computed by the
Cronjob-Service repo in `cron/jobs/model_benchmarking/benchmarking.py`). It
pools every forecast that was issued *and* valid inside a rolling window of
1, 3 or 7 days -- the "s", "m" and "l" in its `lead_time` field are those
window lengths, not lead-time classes -- and scores them by RMSE against the
Open-Meteo forecast API (best_match) for the same hours. Two consequences:
all lead times inside a window are mixed together, and the reference is a
model, not a measurement; best_match for Konstanz is ICON-based, which
favours the ICON models.

This script answers a different question: it scores every model against the
DWD station measurement and splits the result by lead time.

How it works
------------
`GET /forecasts?datetime=T&model_id=M` returns every run of model M that is
valid at time T -- roughly 160 runs spanning the previous 14 days. The run
time is `_time`, the valid time is `forecast_date`, so

    lead time = forecast_date - _time

One request therefore yields the whole lead-time spectrum for one valid time.
Sampling many valid times and pooling the errors gives a verification that
means something.

Truth is the DWD station at Konstanz via `/actual/temperature-history`
(hourly). That is an independent measurement, not another model -- unlike
comparing a forecast against some other model's analysis.

Metrics
-------
Continuous variables (temperature_2m):
    MAE, RMSE, bias (forecast - observation), n

Categorical variables (fog), scored as a binary event:
    POD  probability of detection  = hits / observed events
    FAR  false alarm ratio         = false alarms / forecast events
    CSI  critical success index    = hits / (hits + misses + false alarms)
    base rate, n
Fog observations are derived from the DWD visibility channel when available,
otherwise from the Open-Meteo reanalysis the API proxies (which the script
labels loudly, because that is a model, not a measurement). Pass
--fog-threshold to change the visibility cutoff in metres.

The ki_* models are excluded from fog scoring. They are temperature models
(the FogCast benchmark calls them "KI-Temperaturmodelle"): the API derives
`fog` from `weather_code in (45, 48)`, and the ki_* models' weather_code is
not their own. It is identical across RF/LSTM/CNN within each group and
matches ECMWF (the _lt models, 95.6 %) or the latest ICON run (the _st
models, 82 %). Scoring it would measure that NWP model under a ki_* name.

Usage
-----
    python3 verify_fogcast_models.py                     # last 14 days, KI models + ICON
    python3 verify_fogcast_models.py --days 30 --every 3
    python3 verify_fogcast_models.py --models all
    python3 verify_fogcast_models.py --variable fog
    python3 verify_fogcast_models.py --csv scores.csv

Responses are cached under .fogcast-cache/ so re-runs cost nothing and the
university server is not hammered. Delete that directory to force a refetch.

Stdlib only -- no pip install needed.
"""

import argparse
import csv
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

API = "https://fogcast.in.htwg-konstanz.de/api"
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".fogcast-cache")

# The six models trained on the Konstanz station, plus a couple of strong NWP
# baselines to put their scores in context.
DEFAULT_MODELS = [
    "ki_rf_lt", "ki_rf_st",
    "ki_lstm_lt", "ki_lstm_st",
    "ki_cnn_lt", "ki_cnn_st",
    "icon_d2", "icon_seamless", "ecmwf_ifs025",
]

# Lead-time buckets in hours: (label, lower bound inclusive, upper exclusive).
LEAD_BUCKETS = [
    ("0-6h", 0, 6),
    ("6-12h", 6, 12),
    ("12-24h", 12, 24),
    ("24-48h", 24, 48),
    ("48-72h", 48, 72),
    ("72-120h", 72, 120),
    ("120-168h", 120, 168),
]

RFC1123 = "%a, %d %b %Y %H:%M:%S %Z"


# --------------------------------------------------------------------------
# HTTP with an on-disk cache
# --------------------------------------------------------------------------

def _cache_path(url):
    import hashlib
    return os.path.join(CACHE_DIR, hashlib.sha256(url.encode()).hexdigest() + ".json")


def fetch(url, timeout=120, retries=3, verbose=False):
    """GET a JSON URL, caching the result on disk. Returns None on failure."""
    path = _cache_path(url)
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as fh:
                return json.load(fh)
        except (ValueError, OSError):
            os.remove(path)

    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.load(resp)
            os.makedirs(CACHE_DIR, exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(data, fh)
            return data
        except (urllib.error.URLError, ValueError, OSError) as exc:
            last = exc
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    if verbose:
        print(f"  ! failed: {url}\n    {last}", file=sys.stderr)
    return None


def parse_time(value):
    """Parse the RFC-1123 timestamps the API returns, as UTC."""
    if value is None:
        return None
    if isinstance(value, str) and value.endswith("GMT"):
        return datetime.strptime(value, RFC1123).replace(tzinfo=timezone.utc)
    try:  # ISO fallback, in case the API format changes
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


# --------------------------------------------------------------------------
# Observations
# --------------------------------------------------------------------------

def get_observations(start, stop, channel="temperature_air", verbose=False):
    """Hourly DWD observations, as {valid_time: value}."""
    url = (f"{API}/actual/temperature-history"
           f"?start={urllib.parse.quote(start.strftime('%Y-%m-%d %H:%M:%S'))}"
           f"&stop={urllib.parse.quote(stop.strftime('%Y-%m-%d %H:%M:%S'))}"
           f"&frequency=hourly")
    rows = fetch(url, verbose=verbose)
    if not rows or isinstance(rows, dict):
        return {}

    obs = {}
    for row in rows:
        if row.get("name") != channel:
            continue
        when, value = parse_time(row.get("date")), row.get("value")
        if when is not None and value is not None:
            try:
                obs[when] = float(value)
            except (TypeError, ValueError):
                pass
    return obs


def get_reanalysis_visibility(start, stop, verbose=False):
    """Hourly visibility in metres from `/actual/archive`, as {valid_time: value}.

    Caveat worth keeping in mind: this endpoint serves the Open-Meteo *archive*
    (an icon_seamless reanalysis), not a station measurement. The DWD feed this
    API exposes carries no visibility channel, so observed fog is not available
    and this is the closest stand-in. Scoring a fog model against a reanalysis
    is weaker evidence than scoring it against an observation.
    """
    out = {}
    day = start.replace(hour=0, minute=0, second=0, microsecond=0)
    days = []
    while day <= stop:
        days.append(day)
        day += timedelta(days=1)

    for d in days:
        url = (f"{API}/actual/archive"
               f"?date={urllib.parse.quote(d.strftime('%Y-%m-%d %H:%M:%S'))}"
               f"&model_id=icon_seamless")
        rows = fetch(url, verbose=verbose)
        if not rows or isinstance(rows, dict):
            continue
        for row in rows:
            when = parse_time(row.get("date"))
            vis = row.get("visibility")
            if when is not None and vis is not None:
                try:
                    out[when] = float(vis)
                except (TypeError, ValueError):
                    pass
    return out


def observed_channels(start, stop, verbose=False):
    """Which measurement channels the observation endpoint actually returns."""
    url = (f"{API}/actual/temperature-history"
           f"?start={urllib.parse.quote(start.strftime('%Y-%m-%d %H:%M:%S'))}"
           f"&stop={urllib.parse.quote(stop.strftime('%Y-%m-%d %H:%M:%S'))}"
           f"&frequency=hourly")
    rows = fetch(url, verbose=verbose)
    if not rows or isinstance(rows, dict):
        return set()
    return {row.get("name") for row in rows if row.get("name")}


# --------------------------------------------------------------------------
# Forecasts
# --------------------------------------------------------------------------

def get_forecasts(model, valid_time, verbose=False):
    """Every run of `model` valid at `valid_time`, as (lead_hours, record)."""
    stamp = valid_time.strftime("%Y-%m-%dT%H:%M:%SZ")
    url = f"{API}/forecasts?datetime={urllib.parse.quote(stamp)}&model_id={model}"
    rows = fetch(url, verbose=verbose)
    if not rows or isinstance(rows, dict):
        return []

    out = []
    for row in rows:
        run = parse_time(row.get("_time"))
        valid = parse_time(row.get("forecast_date"))
        if run is None or valid is None:
            continue
        lead = (valid - run).total_seconds() / 3600.0
        if lead >= 0:
            out.append((lead, row))
    return out


# --------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------

def bucket_for(lead):
    for label, lo, hi in LEAD_BUCKETS:
        if lo <= lead < hi:
            return label
    return None


def continuous_scores(errors):
    n = len(errors)
    if n == 0:
        return None
    return {
        "n": n,
        "mae": sum(abs(e) for e in errors) / n,
        "rmse": math.sqrt(sum(e * e for e in errors) / n),
        "bias": sum(errors) / n,
    }


def categorical_scores(pairs):
    """pairs: (forecast_event, observed_event) booleans."""
    n = len(pairs)
    if n == 0:
        return None
    hits = sum(1 for f, o in pairs if f and o)
    misses = sum(1 for f, o in pairs if not f and o)
    false_alarms = sum(1 for f, o in pairs if f and not o)
    observed = hits + misses
    forecast = hits + false_alarms
    denom = hits + misses + false_alarms
    return {
        "n": n,
        "pod": hits / observed if observed else float("nan"),
        "far": false_alarms / forecast if forecast else float("nan"),
        "csi": hits / denom if denom else float("nan"),
        "base_rate": observed / n,
        "hits": hits, "misses": misses, "false_alarms": false_alarms,
    }


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------

def print_continuous(results, variable, metric):
    labels = [b[0] for b in LEAD_BUCKETS]
    # For bias, what matters is distance from zero, not the signed value.
    models = sorted(results, key=lambda m: _sort_key(
        results[m], labels, metric, absolute=(metric == "bias")))

    width = max(len(m) for m in models) + 2
    header = f"{'model':<{width}}" + "".join(f"{lab:>10}" for lab in labels)
    print("\n" + header)
    print("-" * len(header))
    for model in models:
        marker = " *" if model.startswith("ki_") else "  "
        line = f"{model + marker:<{width}}"
        for lab in labels:
            s = results[model].get(lab)
            line += f"{s[metric]:>10.3f}" if s else f"{'-':>10}"
        print(line)

    print("\n" + f"{'pairs':<{width}}" + "".join(
        f"{_total_n(results, lab):>10}" for lab in labels))
    goal = ("closer to zero is better" if metric == "bias"
            else "lower is better")
    print(f"\n{variable}: {metric.upper()} by lead time, {goal}."
          f"  * = model trained on the Konstanz station.")


def print_categorical(results, variable):
    labels = [b[0] for b in LEAD_BUCKETS]
    models = sorted(results, key=lambda m: -_mean_metric(results[m], labels, "csi"))
    width = max(len(m) for m in models) + 2

    for metric, direction in (("pod", "higher"), ("far", "lower"), ("csi", "higher")):
        header = f"{'model':<{width}}" + "".join(f"{lab:>10}" for lab in labels)
        print(f"\n{metric.upper()} ({direction} is better)")
        print(header)
        print("-" * len(header))
        for model in models:
            marker = " *" if model.startswith("ki_") else "  "
            line = f"{model + marker:<{width}}"
            for lab in labels:
                s = results[model].get(lab)
                if s and not math.isnan(s[metric]):
                    line += f"{s[metric]:>10.3f}"
                else:
                    line += f"{'-':>10}"
            print(line)

    any_model = next(iter(results.values()), {})
    rates = [s["base_rate"] for s in any_model.values() if s]
    if rates:
        print(f"\nobserved {variable} base rate: {sum(rates) / len(rates):.3%}")

    # A model that never forecasts the event scores POD 0 and an undefined FAR.
    # That is a property of the data, not a skill measurement, so say so plainly.
    degenerate = [m for m in results
                  if all(s["hits"] + s["false_alarms"] == 0 for s in results[m].values())]
    if degenerate:
        print(f"\nNever forecast {variable} even once, so their scores below are\n"
              f"degenerate rather than bad: {', '.join(sorted(degenerate))}.\n"
              f"The API derives fog from weather_code in (45, 48); these models\n"
              f"emitted neither code in this period.")


def _sort_key(per_bucket, labels, metric, absolute=False):
    vals = [per_bucket[l][metric] for l in labels if per_bucket.get(l)]
    if not vals:
        return float("inf")
    mean = sum(vals) / len(vals)
    return abs(mean) if absolute else mean


def _mean_metric(per_bucket, labels, metric):
    vals = [per_bucket[l][metric] for l in labels
            if per_bucket.get(l) and not math.isnan(per_bucket[l][metric])]
    return sum(vals) / len(vals) if vals else -1.0


def _total_n(results, label):
    """Forecast/observation pairs in this bucket, summed over all models."""
    return sum(s["n"] for m in results for lab, s in results[m].items()
               if lab == label and s)


def write_csv(path, results, variable, categorical):
    keys = (["n", "pod", "far", "csi", "base_rate", "hits", "misses", "false_alarms"]
            if categorical else ["n", "mae", "rmse", "bias"])
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["variable", "model", "lead_bucket"] + keys)
        for model in sorted(results):
            for label, _, _ in LEAD_BUCKETS:
                s = results[model].get(label)
                if s:
                    writer.writerow([variable, model, label] + [s[k] for k in keys])
    print(f"\nwrote {path}")


# --------------------------------------------------------------------------

# --------------------------------------------------------------------------
# HTML report
# --------------------------------------------------------------------------

# Categorical slots from the dataviz reference palette, validated for the
# adjacent pairlist in both modes (worst CVD dE 9.1 light / 8.4 dark). Slots
# 3-5 sit below 3:1 on the light surface, so the report always ships the
# tables alongside the charts.
KI_FAMILY_ORDER = ["ki_rf", "ki_lstm", "ki_cnn"]


def _family(model):
    for suffix in ("_st", "_lt"):
        if model.endswith(suffix):
            return model[: -len(suffix)]
    return model


def _family_slots(models):
    """Colour follows the model family, so ki_rf_st and ki_rf_lt share a hue."""
    families = [f for f in KI_FAMILY_ORDER if any(_family(m) == f for m in models)]
    for m in models:
        f = _family(m)
        if f not in families:
            families.append(f)
    return {f: (i + 1 if i < 8 else None) for i, f in enumerate(families)}


def _panels(models):
    """Short- and long-range local models get their own panel, NWP goes in both."""
    st = [m for m in models if m.startswith("ki_") and m.endswith("_st")]
    lt = [m for m in models if m.startswith("ki_") and m.endswith("_lt")]
    other = [m for m in models if m not in st and m not in lt]
    if st and lt:
        return [
            {"title": "Kurzfrist-Modelle (ki_*_st, bis 46 h) + NWP", "models": st + other},
            {"title": "Langfrist-Modelle (ki_*_lt, bis 168 h) + NWP", "models": lt + other},
        ]
    return [{"title": "Alle Modelle", "models": st + lt + other}]


def _fmt(value, digits=2):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "–"
    return f"{value:.{digits}f}".replace(".", ",")


def _html_table(results, labels, metric, order, caption, digits=2):
    import html as _h
    head = "".join(f"<th>{_h.escape(l)}</th>" for l in labels)
    rows = []
    for model in order:
        tag = ' <span class="tag">lokal</span>' if model.startswith("ki_") else ""
        cells = []
        for lab in labels:
            s = results.get(model, {}).get(lab)
            cells.append(f"<td>{_fmt(s[metric], digits) if s else '–'}</td>")
        rows.append(f"<tr><th scope='row'><code>{_h.escape(model)}</code>{tag}</th>{''.join(cells)}</tr>")
    return (f"<figure class='table'><figcaption>{caption}</figcaption>"
            f"<div class='scroll'><table><thead><tr><th>Modell</th>{head}</tr></thead>"
            f"<tbody>{''.join(rows)}</tbody></table></div></figure>")


def _order(results, labels, metric, mode):
    def key(m):
        vals = [results[m][l][metric] for l in labels
                if results[m].get(l) and not math.isnan(results[m][l][metric])]
        if not vals:
            return float("inf")
        mean = sum(vals) / len(vals)
        return {"abs": abs(mean), "asc": mean, "desc": -mean}[mode]
    return sorted(results, key=key)


def _best_row(results, labels, metric, mode):
    """Winner per lead bucket -- a fact from the table, not an interpretation."""
    import html as _h
    cells = []
    for lab in labels:
        cands = [(m, results[m][lab][metric]) for m in results
                 if results[m].get(lab) and not math.isnan(results[m][lab][metric])]
        if not cands:
            cells.append("<td>–</td>")
            continue
        pick = {"abs": lambda c: abs(c[1]), "asc": lambda c: c[1],
                "desc": lambda c: -c[1]}[mode]
        m, v = min(cands, key=pick)
        cells.append(f"<td><code>{_h.escape(m)}</code><br><span class='muted'>{_fmt(v)}</span></td>")
    head = "".join(f"<th>{_h.escape(l)}</th>" for l in labels)
    return (f"<div class='scroll'><table class='best'><thead><tr><th></th>{head}</tr></thead>"
            f"<tbody><tr><th scope='row'>bestes Modell</th>{''.join(cells)}</tr></tbody></table></div>")


def _no_nan(obj):
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    if isinstance(obj, dict):
        return {k: _no_nan(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_no_nan(v) for v in obj]
    return obj


def write_html(path, results, meta, categorical):
    import html as _h
    labels = [b[0] for b in LEAD_BUCKETS]
    models = [m for m in meta["models"] if m in results]
    slots = _family_slots(models)
    panels = [{"title": p["title"], "models": [m for m in p["models"] if m in results]}
              for p in _panels(models)]

    if categorical:
        charts = [{"id": "csi", "metric": "csi", "title": "CSI nach Vorlaufzeit (höher ist besser)",
                   "yTitle": "CSI", "unit": "", "zero": False}]
        tables = [
            _html_table(results, labels, "csi", _order(results, labels, "csi", "desc"),
                        "CSI – Critical Success Index (höher ist besser)"),
            _html_table(results, labels, "pod", _order(results, labels, "pod", "desc"),
                        "POD – Trefferquote (höher ist besser)"),
            _html_table(results, labels, "far", _order(results, labels, "far", "asc"),
                        "FAR – Fehlalarmquote (niedriger ist besser)"),
            _html_table(results, labels, "n", _order(results, labels, "csi", "desc"),
                        "Anzahl Vorhersage/Wahrheit-Paare", digits=0),
        ]
        best = _best_row(results, labels, "csi", "desc")
    else:
        charts = [
            {"id": "mae", "metric": "mae", "title": "MAE nach Vorlaufzeit (niedriger ist besser)",
             "yTitle": "MAE (°C)", "unit": " °C", "zero": False},
            {"id": "bias", "metric": "bias",
             "title": "Bias nach Vorlaufzeit (Vorhersage − Messung, nahe 0 ist besser)",
             "yTitle": "Bias (°C)", "unit": " °C", "zero": True},
        ]
        tables = [
            _html_table(results, labels, "mae", _order(results, labels, "mae", "asc"),
                        "MAE in °C (niedriger ist besser)"),
            _html_table(results, labels, "bias", _order(results, labels, "bias", "abs"),
                        "Bias in °C, Vorhersage − Messung (nahe 0 ist besser; negativ = zu kalt)"),
            _html_table(results, labels, "rmse", _order(results, labels, "rmse", "asc"),
                        "RMSE in °C (niedriger ist besser)"),
            _html_table(results, labels, "n", _order(results, labels, "mae", "asc"),
                        "Anzahl Vorhersage/Messung-Paare", digits=0),
        ]
        best = _best_row(results, labels, "mae", "asc")

    # --- setup and caveats, all derived from this run ----------------------
    coord_rows = "".join(
        f"<li><code>{_h.escape(m)}</code>: "
        f"{', '.join(f'{la}° N / {lo}° E' for la, lo in meta['coords'].get(m, []))}</li>"
        for m in models)
    hours = meta["hours_sampled"]
    caveats = []
    if len(hours) < 24:
        caveats.append(
            f"<strong>Nur {len(hours)} Tageszeiten bewertet</strong> "
            f"({', '.join(f'{h:02d}' for h in hours)} UTC). Stunden dazwischen – etwa das "
            f"Nachmittagsmaximum – gehen nicht ein. <code>--every 1</code> behebt das, kostet "
            f"aber entsprechend mehr Anfragen.")
    distinct = {tuple(c) for m in models for c in meta["coords"].get(m, [])}
    if len(distinct) > 1:
        caveats.append(
            f"<strong>Die Modelle liegen an {len(distinct)} verschiedenen Punkten</strong> "
            f"(siehe Koordinaten). Die DWD-Station 2712 steht auf 47.6952° N / 9.1307° E; "
            f"Modelle an anderen Punkten werden also einige Kilometer neben der Messung "
            f"bewertet (die KI-Modelle 4,9 km). Ein kleiner, aber systematischer Unterschied.")
    caveats.append(
        f"<strong>{meta['days']} Tage, eine Station, eine Jahreszeit.</strong> Das Ergebnis "
        f"sagt nichts über andere Wetterlagen – insbesondere nicht über winterliche "
        f"Inversionen, in denen Nebel am Bodensee am wichtigsten ist.")
    if meta.get("truth_note"):
        caveats.append(f"<strong>Wahrheit ist keine Messung.</strong> {_h.escape(meta['truth_note'])}")
    if meta.get("degenerate"):
        caveats.append(
            "<strong>Nie Nebel vorhergesagt:</strong> "
            + ", ".join(f"<code>{_h.escape(m)}</code>" for m in meta["degenerate"])
            + ". Die API leitet Nebel aus <code>weather_code</code> 45/48 ab; diese Modelle "
              "geben die Codes nie aus. Ihre Werte sind daher degeneriert, nicht schlecht.")
    if meta.get("excluded_ki"):
        caveats.append(
            "<strong>Die lokalen KI-Modelle fehlen hier absichtlich</strong> ("
            + ", ".join(f"<code>{_h.escape(m)}</code>" for m in meta["excluded_ki"])
            + "). Es sind reine Temperaturmodelle. Ihr <code>weather_code</code> – und damit "
              "das Nebel-Flag – ist für RF, LSTM und CNN identisch und stammt aus einem "
              "NWP-Modell (ECMWF bei <code>_lt</code>, ICON bei <code>_st</code>). Eine "
              "Bewertung würde dieses NWP-Modell messen, nicht das KI-Modell.")
    caveats.append(
        "Anders als der FogCast-eigene Benchmark (<code>/models/benchmarking</code>) wird hier "
        + ("gegen eine Reanalyse" if meta.get("truth_note") else "gegen die DWD-Messung")
        + " statt gegen die Open-Meteo-Vorhersage verglichen und nach "
        "Vorlaufzeit aufgeschlüsselt. Dessen „s/m/l“ sind Zeitfenster von 1/3/7 Tagen, in "
        "denen alle Vorlaufzeiten gemischt werden.")

    variable_label = "Nebel (ja/nein)" if categorical else "Lufttemperatur in 2 m"
    title = f"FogCast-Verifikation – {variable_label}"

    data = {
        "labels": labels,
        "results": results,
        "slots": {m: slots.get(_family(m)) for m in models},
        "panels": panels,
        "charts": charts,
    }
    data_json = json.dumps(_no_nan(data), allow_nan=False).replace("</", "<\\/")

    page = HTML_TEMPLATE
    for key, value in {
        "__TITLE__": _h.escape(title),
        "__VARIABLE__": _h.escape(variable_label),
        "__FORECAST_VAR__": _h.escape(meta["variable"]),
        "__TRUTH__": _h.escape(meta["truth"]),
        "__PERIOD__": _h.escape(f"{meta['start']} bis {meta['stop']} UTC"),
        "__VALID__": str(meta["n_valid"]),
        "__EVERY__": str(meta["every"]),
        "__PAIRS__": f"{meta['pairs']:,}".replace(",", "."),
        "__NMODELS__": str(len(models)),
        "__COORDS__": coord_rows,
        "__BUCKETS__": ", ".join(labels),
        "__CAVEATS__": "".join(f"<li>{c}</li>" for c in caveats),
        "__BEST__": best,
        "__TABLES__": "".join(tables),
        "__GENERATED__": _h.escape(meta["generated"]),
        "__CMD__": _h.escape(meta["cmd"]),
        "__CHARTS__": "".join(
            f"<section class='chart'><h3>{_h.escape(c['title'])}</h3>"
            f"<div class='grid'>" + "".join(
                f"<div class='panel'><div class='ptitle'>{_h.escape(p['title'])}</div>"
                f"<div class='plot' id='{c['id']}-{i}' role='img' "
                f"aria-label='{_h.escape(c['title'] + ' – ' + p['title'])}'></div></div>"
                for i, p in enumerate(panels)) + "</div></section>"
            for c in charts),
        "__DATA__": data_json,
    }.items():
        page = page.replace(key, value)

    with open(path, "w", encoding="utf-8") as fh:
        fh.write(page)
    print(f"\nwrote {path}")


HTML_TEMPLATE = r"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.27.0/plotly.min.js"></script>
<style>
:root{
  color-scheme: light;
  --bg:#f5f5f3; --surface:#fcfcfb; --text:#0b0b0b; --text2:#52514e; --muted:#77766f;
  --rule:#e2e1dc; --grid:#ecebe7; --tag:#e7eefa; --tag-ink:#1c5cab;
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --s4:#eda100;
  --s5:#e87ba4; --s6:#008300; --s7:#4a3aa7; --s8:#e34948; --other:#8a8983;
}
@media (prefers-color-scheme: dark){
  :root:where(:not([data-theme="light"])){
    color-scheme: dark;
    --bg:#121211; --surface:#1a1a19; --text:#ffffff; --text2:#c3c2b7; --muted:#9a998f;
    --rule:#2f2f2c; --grid:#262624; --tag:#1f2d42; --tag-ink:#86b6ef;
    --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500;
    --s5:#d55181; --s6:#008300; --s7:#9085e9; --s8:#e66767; --other:#7d7c75;
  }
}
:root[data-theme="dark"]{
  color-scheme: dark;
  --bg:#121211; --surface:#1a1a19; --text:#ffffff; --text2:#c3c2b7; --muted:#9a998f;
  --rule:#2f2f2c; --grid:#262624; --tag:#1f2d42; --tag-ink:#86b6ef;
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500;
  --s5:#d55181; --s6:#008300; --s7:#9085e9; --s8:#e66767; --other:#7d7c75;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
  font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding-inline:16px}
main{max-width:1120px;margin:0 auto;padding-block:28px 48px}
h1{font-size:26px;line-height:1.2;margin:0 0 6px}
h2{font-size:18px;margin:36px 0 10px}
h3{font-size:15px;margin:0 0 10px;color:var(--text)}
p.lede{color:var(--text2);margin:0 0 20px;max-width:70ch}
code{font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
.card{background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:16px 18px}
dl.setup{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;margin:0}
dl.setup dt{color:var(--text2)} dl.setup dd{margin:0}
ul{margin:6px 0 0;padding-left:20px} li{margin:4px 0}
.caveats li{color:var(--text)}
section.chart{background:var(--surface);border:1px solid var(--rule);border-radius:10px;
  padding:16px 18px;margin:16px 0}
.grid{display:grid;grid-template-columns:1fr;gap:18px}
@media (min-width:900px){.grid{grid-template-columns:1fr 1fr}}
.ptitle{font-size:13px;color:var(--text2);margin-bottom:4px}
.plot{width:100%;height:380px}
.scroll{overflow-x:auto}
figure.table{margin:16px 0;background:var(--surface);border:1px solid var(--rule);
  border-radius:10px;padding:14px 16px}
figcaption{font-weight:600;margin-bottom:8px}
table{border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:14px;min-width:100%}
th,td{padding:6px 10px;border-bottom:1px solid var(--rule);text-align:right;white-space:nowrap}
thead th{color:var(--text2);font-weight:600}
tbody th{text-align:left;font-weight:normal}
td:first-child,th:first-child{text-align:left}
.best td{text-align:center}
.muted{color:var(--muted);font-size:13px}
.tag{display:inline-block;margin-left:6px;padding:0 7px;border-radius:999px;
  background:var(--tag);color:var(--tag-ink);font-size:11px;font-weight:600;vertical-align:1px}
.legend-note{font-size:13px;color:var(--text2);margin:8px 0 0}
footer{margin-top:36px;color:var(--muted);font-size:13px}
.noplot{color:var(--muted);font-size:14px;padding:20px 0}
</style>
</head>
<body>
<main>
<h1>__TITLE__</h1>
<p class="lede">Wie gut treffen die FogCast-Modelle die tatsächlich gemessenen Werte in
Konstanz – aufgeschlüsselt danach, wie weit im Voraus die Vorhersage gemacht wurde?</p>

<div class="card">
<dl class="setup">
  <dt>Größe</dt><dd>__VARIABLE__ (Vorhersagevariable <code>__FORECAST_VAR__</code>)</dd>
  <dt>Wahrheit</dt><dd>__TRUTH__</dd>
  <dt>Zeitraum</dt><dd>__PERIOD__</dd>
  <dt>Stichprobe</dt><dd>__VALID__ Gültigkeitszeitpunkte (alle __EVERY__ h), jeweils mit allen
    Läufen der Vorwoche · __PAIRS__ Vorhersage/Wahrheit-Paare</dd>
  <dt>Vorlaufklassen</dt><dd>__BUCKETS__</dd>
  <dt>Modelle (__NMODELS__)</dt><dd><ul>__COORDS__</ul></dd>
</dl>
</div>

<h2>Einschränkungen</h2>
<div class="card"><ul class="caveats">__CAVEATS__</ul></div>

<h2>Ergebnis</h2>
__CHARTS__
<p class="legend-note">Durchgezogen = lokales FogCast-Modell (<code>ki_*</code>),
gestrichelt = numerisches Wettermodell (NWP). Farbe = Modellfamilie; <code>_st</code>
und <code>_lt</code> derselben Familie teilen sich eine Farbe. Beide Panels haben dieselbe
Skala. Leere Stellen: das Modell rechnet nicht so weit voraus.</p>

<h2>Bestes Modell je Vorlaufklasse</h2>
<div class="card">__BEST__</div>

<h2>Tabellen</h2>
__TABLES__

<footer>Erzeugt __GENERATED__ mit <code>__CMD__</code><br>
Quelle: FogCast-API der HTWG Konstanz (<code>/forecasts</code>, <code>/actual/…</code>).
Die Grafiken laden Plotly aus dem Netz; die Tabellen funktionieren auch offline.</footer>
</main>

<script>
const DATA = __DATA__;

function css(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function colorFor(model){
  const slot = DATA.slots[model];
  return slot ? css('--s' + slot) : css('--other');
}

function draw(){
  if (typeof Plotly === 'undefined'){
    document.querySelectorAll('.plot').forEach(el => {
      el.innerHTML = '<div class="noplot">Grafik nicht verfügbar (Plotly konnte nicht geladen werden). Die Tabellen unten enthalten dieselben Zahlen.</div>';
      el.style.height = 'auto';
    });
    return;
  }
  const surface = css('--surface'), text = css('--text'), text2 = css('--text2'),
        grid = css('--grid'), rule = css('--rule');

  for (const chart of DATA.charts){
    // One scale across both panels, so the panels can be compared by eye.
    let lo = Infinity, hi = -Infinity;
    for (const p of DATA.panels) for (const m of p.models) for (const lab of DATA.labels){
      const s = (DATA.results[m] || {})[lab];
      const v = s ? s[chart.metric] : null;
      if (v !== null && v !== undefined && isFinite(v)){ lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    if (chart.zero){ lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    else { lo = Math.min(lo, 0); }
    const pad = (hi - lo) * 0.08 || 0.1;
    const range = [chart.zero ? lo - pad : 0, hi + pad];

    DATA.panels.forEach((panel, i) => {
      const el = document.getElementById(chart.id + '-' + i);
      if (!el) return;
      const traces = panel.models.map(m => {
        const local = m.startsWith('ki_');
        const color = colorFor(m);
        return {
          type: 'scatter', mode: 'lines+markers', name: m,
          x: DATA.labels,
          y: DATA.labels.map(l => { const s = (DATA.results[m] || {})[l];
                                    const v = s ? s[chart.metric] : null;
                                    return (v === null || v === undefined || !isFinite(v)) ? null : v; }),
          connectgaps: false,
          line: { color, width: 2, dash: local ? 'solid' : 'dash' },
          marker: { color, size: 8, line: { color: surface, width: 2 } },
          hovertemplate: '%{y:.2f}' + chart.unit + '<extra>' + m + '</extra>'
        };
      });
      const shapes = chart.zero ? [{ type: 'line', xref: 'paper', x0: 0, x1: 1,
        y0: 0, y1: 0, line: { color: text2, width: 1 } }] : [];
      Plotly.react(el, traces, {
        paper_bgcolor: surface, plot_bgcolor: surface,
        font: { family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: text2, size: 12 },
        separators: ',.',
        margin: { l: 56, r: 12, t: 8, b: 96 },
        hovermode: 'x unified',
        hoverlabel: { bgcolor: surface, bordercolor: rule, font: { color: text } },
        xaxis: { title: { text: 'Vorlaufzeit' }, type: 'category', gridcolor: grid,
                 linecolor: rule, tickcolor: rule, showspikes: true, spikecolor: text2,
                 spikethickness: 1, spikedash: 'solid', spikemode: 'across' },
        yaxis: { title: { text: chart.yTitle }, range, gridcolor: grid, zeroline: false,
                 linecolor: rule, tickformat: '.1f' },
        legend: { orientation: 'h', y: -0.28, x: 0, font: { color: text, size: 12 } },
        shapes
      }, { displayModeBar: false, responsive: true });
    });
  }
}

draw();
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
} catch (e) {}
</script>
</body>
</html>
"""



def main():
    ap = argparse.ArgumentParser(
        description="Verify FogCast models against DWD observations over many runs.",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=14,
                    help="how many days back to evaluate (default 14)")
    ap.add_argument("--every", type=int, default=6,
                    help="hours between evaluated valid times (default 6)")
    ap.add_argument("--models", default=",".join(DEFAULT_MODELS),
                    help="comma-separated model ids, or 'all'")
    ap.add_argument("--variable", default="temperature_2m",
                    help="forecast variable to score (default temperature_2m)")
    ap.add_argument("--fog-threshold", type=float, default=1000.0,
                    help="visibility in metres below which fog is observed (default 1000)")
    ap.add_argument("--workers", type=int, default=4,
                    help="parallel requests; keep it modest, this is a university server")
    ap.add_argument("--csv", help="also write per-bucket scores to this CSV file")
    ap.add_argument("--html", nargs="?", const="fogcast-report.html",
                    help="write a self-contained HTML report with charts "
                         "(default name fogcast-report.html, which is gitignored)")
    ap.add_argument("--no-cache", action="store_true", help="ignore the on-disk cache")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    if args.no_cache:
        global CACHE_DIR
        CACHE_DIR = os.path.join(CACHE_DIR, f"nocache-{int(time.time())}")

    models = args.models.split(",") if args.models != "all" else fetch(f"{API}/models")
    if not models:
        sys.exit("could not determine the model list")
    models = [m.strip() for m in models if m.strip()]

    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    # Leave a 2 h margin so the observation for the newest valid time exists.
    stop = now - timedelta(hours=2)
    start = stop - timedelta(days=args.days)
    valid_times = []
    t = start
    while t <= stop:
        valid_times.append(t)
        t += timedelta(hours=args.every)

    categorical = args.variable == "fog"
    excluded_ki = []
    if categorical:
        excluded_ki = [m for m in models if m.startswith("ki_")]
        models = [m for m in models if not m.startswith("ki_")]
        if excluded_ki:
            print(f"Skipping {', '.join(excluded_ki)} for fog: they are temperature\n"
                  f"models whose weather_code (and so fog) is copied from an NWP model\n"
                  f"(ECMWF for _lt, ICON for _st) and identical across RF/LSTM/CNN.\n")
        if not models:
            sys.exit("No models left to score for fog. Pass NWP models, e.g.\n"
                     "--models icon_d2,icon_seamless,meteoswiss_icon_ch1")
    if not categorical and args.variable != "temperature_2m":
        sys.exit(f"--variable {args.variable}: the only observation the API serves is\n"
                 f"DWD temperature_air, so only temperature_2m (or fog) can be scored.")

    print(f"FogCast verification")
    print(f"  period      {start:%Y-%m-%d %H:%M} .. {stop:%Y-%m-%d %H:%M} UTC")
    print(f"  valid times {len(valid_times)} (every {args.every} h)")
    print(f"  models      {len(models)}")
    print(f"  variable    {args.variable}")
    print(f"  requests    {len(models) * len(valid_times)} (cached in {os.path.basename(CACHE_DIR)}/)")

    # --- observations ------------------------------------------------------
    truth_note = None
    if categorical:
        channels = observed_channels(start, stop + timedelta(hours=1), args.verbose)
        vis_channel = next((c for c in channels if "visibility" in c.lower()), None)
        if vis_channel:
            print(f"  truth       DWD {vis_channel} < {args.fog_threshold:.0f} m")
            raw = get_observations(start, stop + timedelta(hours=1), vis_channel, args.verbose)
        else:
            # The DWD feed carries no visibility, so fall back to the reanalysis.
            print(f"  truth       reanalysis visibility < {args.fog_threshold:.0f} m")
            truth_note = ("Fog truth came from /actual/archive, which is an Open-Meteo\n"
                          "icon_seamless reanalysis, NOT a station observation -- the DWD\n"
                          "feed exposes no visibility channel. Treat these scores as a\n"
                          "model-against-model comparison.")
            raw = get_reanalysis_visibility(start, stop + timedelta(hours=1), args.verbose)
        obs = {t: (v < args.fog_threshold) for t, v in raw.items()}
    else:
        print(f"  truth       DWD temperature_air (hourly)")
        obs = get_observations(start, stop + timedelta(hours=1), "temperature_air", args.verbose)

    if not obs:
        sys.exit("\nNo observations returned for that period -- nothing to verify against.")
    print(f"  observations {len(obs)} hourly values\n")

    # --- forecasts ---------------------------------------------------------
    jobs = [(m, t) for m in models for t in valid_times]
    collected = defaultdict(list)
    coords = defaultdict(set)
    done = 0

    def work(job):
        model, valid = job
        return model, valid, get_forecasts(model, valid, args.verbose)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for model, valid, rows in pool.map(work, jobs):
            done += 1
            if done % 25 == 0 or done == len(jobs):
                print(f"\r  fetching {done}/{len(jobs)}", end="", flush=True)
            for _, row in rows[:1]:
                coords[model].add((row.get("latitude"), row.get("longitude")))
            truth = obs.get(valid)
            if truth is None:
                continue
            for lead, row in rows:
                label = bucket_for(lead)
                if label is None:
                    continue
                value = row.get(args.variable)
                if value is None:
                    continue
                if categorical:
                    collected[(model, label)].append((bool(value), bool(truth)))
                else:
                    try:
                        collected[(model, label)].append(float(value) - truth)
                    except (TypeError, ValueError):
                        pass
    print()

    # --- scores ------------------------------------------------------------
    results = defaultdict(dict)
    for (model, label), values in collected.items():
        score = categorical_scores(values) if categorical else continuous_scores(values)
        if score:
            results[model][label] = score

    if not results:
        sys.exit("\nNo model/observation pairs matched. Try a longer --days, or check\n"
                 "that the variable exists for these models (the ki_* models only\n"
                 "carry temperature_2m, weather_code and fog).")

    if categorical:
        print_categorical(results, args.variable)
    else:
        print_continuous(results, args.variable, "mae")
        print_continuous(results, args.variable, "bias")

    if args.csv:
        write_csv(args.csv, results, args.variable, categorical)

    if args.html:
        degenerate = sorted(
            m for m in results if categorical
            and all(s["hits"] + s["false_alarms"] == 0 for s in results[m].values()))
        if categorical:
            truth = ("Sichtweite < %.0f m aus /actual/archive (Open-Meteo-Reanalyse "
                     "icon_seamless)" % args.fog_threshold) if truth_note else \
                    "DWD-Sichtweite < %.0f m" % args.fog_threshold
        else:
            truth = ("DWD-Station 2712 Konstanz, stündliche Messung temperature_air "
                     "(über /actual/temperature-history)")
        meta = {
            "variable": args.variable,
            "truth": truth,
            "truth_note": " ".join(truth_note.split()) if truth_note else None,
            "start": start.strftime("%d.%m.%Y %H:%M"),
            "stop": stop.strftime("%d.%m.%Y %H:%M"),
            "days": args.days,
            "every": args.every,
            "n_valid": len(valid_times),
            "hours_sampled": sorted({t.hour for t in valid_times}),
            "pairs": sum(s["n"] for m in results for s in results[m].values()),
            "models": models,
            "coords": {m: sorted(coords[m]) for m in models},
            "degenerate": degenerate,
            "excluded_ki": excluded_ki,
            "generated": datetime.now().strftime("%d.%m.%Y %H:%M"),
            "cmd": "python3 " + " ".join([os.path.basename(sys.argv[0])] + sys.argv[1:]),
        }
        write_html(args.html, dict(results), meta, categorical)

    reference = "the reanalysis" if truth_note else "the DWD measurement"
    print(f"\nNote: scored against {reference} and split by lead time. The\n"
          f"FogCast benchmark (/models/benchmarking) instead scores 1/3/7-day windows\n"
          f"against the Open-Meteo forecast, mixing lead times. Scores here are for\n"
          f"one station and one period -- widen --days before drawing conclusions.")
    if truth_note:
        print("\n" + truth_note)


if __name__ == "__main__":
    main()
