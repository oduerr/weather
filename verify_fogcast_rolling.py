#!/usr/bin/env python3
"""
Rolling verification of FogCast temperature forecasts over a whole year.

verify_fogcast_models.py answers "how good is each model over the last two
weeks, by lead time". This script answers "how does that change over the
year": it fetches a year of archived forecasts once, pairs every one with the
DWD measurement at Konstanz, and then computes the error in sliding windows
(2, 3 and 4 weeks, moved on by one week) per model and lead-time group.

Fetching is the slow part and is done exactly once: every forecast lands in
pairs.csv, and the windows are computed from that file afterwards, so trying
a different window length never touches the server again.

What is fetched
---------------
For every valid time T (one every --every hours over --days days) and every
model M: `GET /forecasts?datetime=T&model_id=M`, which returns all runs of M
that were valid at T during the 14 days before it. Lead time is
valid time - run time, where "run time" is `_time`, the moment FogCast's cron
job wrote the forecast -- not the NWP model's own initialisation time. It is
the lead time a user of FogCast actually had.

Truth is DWD station 2712 Konstanz, hourly temperature_air, through
`/actual/temperature-history`, fetched month by month.

Models whose archive starts later than the requested period (the ki_* models
began on 2026-09-19) are probed weekly first, so the script does not send a
year's worth of requests that are bound to come back empty.

Output (default directory fogcast-data/, gitignored)
----------------------------------------------------
  pairs.csv         model, valid_time, run_time, lead_h, forecast, observed
                    -- one row per forecast; observed is empty if DWD had no value
  observations.csv  valid_time, observed
  rolling.csv       window_days, window_start, window_end, model, lead_group,
                    n, days_covered, mae, rmse, bias
  done.txt          model/valid-time pairs already fetched, so an interrupted
                    run continues where it stopped

Progress
--------
With --notify the script pushes a status message via `ntfy-send` after
--first-ping minutes, then every --ping-every minutes, and a summary at the
end. Without it, progress only goes to stdout.

Usage
-----
    python3 verify_fogcast_rolling.py --notify               # a year, the default models
    python3 verify_fogcast_rolling.py --analyze-only         # recompute rolling.csv
    python3 verify_fogcast_rolling.py --days 30 --models icon_d2

Stdlib only.
"""

import argparse
import csv
import json
import math
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from verify_fogcast_models import API, get_observations, parse_time  # noqa: E402

DEFAULT_MODELS = [
    "icon_d2", "icon_eu", "icon_seamless", "ecmwf_ifs025",
    "meteoswiss_icon_ch1", "meteoswiss_icon_ch2",
    "ki_rf_st", "ki_rf_lt", "ki_lstm_st", "ki_lstm_lt", "ki_cnn_st", "ki_cnn_lt",
]

LEAD_GROUPS = [("0-24h", 0, 24), ("24-72h", 24, 72), ("72-168h", 72, 168)]

TS = "%Y-%m-%dT%H:%M:%SZ"


# --------------------------------------------------------------------------
# Fetching
# --------------------------------------------------------------------------

def fetch_forecasts(model, valid_time, timeout=120, retries=3):
    """Every run of `model` valid at `valid_time`.

    Returns a list of (run_time, lead_h, temperature), [] if the archive has
    nothing for that time, or None if the request failed.
    """
    url = (f"{API}/forecasts?datetime={urllib.parse.quote(valid_time.strftime(TS))}"
           f"&model_id={urllib.parse.quote(model)}")
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                rows = json.load(resp)
            break
        except (urllib.error.URLError, ValueError, OSError):
            if attempt == retries - 1:
                return None
            time.sleep(2 ** attempt * 2)

    if not isinstance(rows, list):
        return None  # an error object from the API, not an empty archive
    out = []
    for row in rows:
        run = parse_time(row.get("_time"))
        valid = parse_time(row.get("forecast_date"))
        value = row.get("temperature_2m")
        if run is None or valid is None or value is None:
            continue
        try:
            value = float(value)
        except (TypeError, ValueError):
            continue
        if math.isnan(value):
            continue
        lead = (valid - run).total_seconds() / 3600.0
        if lead >= 0:
            out.append((run, lead, value))
    return out


def first_available(model, valid_times, step_days=7):
    """First valid time worth requesting for `model`.

    Probes one valid time per week; data can start between two probes, so the
    answer is the probe *before* the first hit. Returns None if the model has
    no data in the whole period.
    """
    step = max(1, int(step_days * 24 / max(1, _spacing_hours(valid_times))))
    probes = list(range(0, len(valid_times), step))
    if probes[-1] != len(valid_times) - 1:
        probes.append(len(valid_times) - 1)
    previous = 0
    for idx in probes:
        rows = fetch_forecasts(model, valid_times[idx])
        if rows is None or rows:  # a failed probe counts as "maybe data here"
            return valid_times[previous]
        previous = idx
    return None


def _spacing_hours(valid_times):
    if len(valid_times) < 2:
        return 1
    return (valid_times[1] - valid_times[0]).total_seconds() / 3600.0


def get_observations_by_month(start, stop):
    """Hourly DWD temperature, requested one month at a time."""
    obs = {}
    chunk_start = start
    while chunk_start < stop:
        chunk_stop = min(chunk_start + timedelta(days=31), stop)
        obs.update(get_observations(chunk_start, chunk_stop, "temperature_air"))
        chunk_start = chunk_stop
    return obs


# --------------------------------------------------------------------------
# Notifications
# --------------------------------------------------------------------------

def notify(message, enabled):
    print(f"[notify] {message}", flush=True)
    if not enabled:
        return
    exe = shutil.which("ntfy-send")
    if not exe:
        print("[notify] ntfy-send not found, message only printed", flush=True)
        return
    try:
        subprocess.run([exe, message], timeout=30, check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"[notify] failed: {exc}", flush=True)


def _n(x):
    """12345 -> '12.345' (German thousands separator)."""
    return f"{x:,}".replace(",", ".")


def _fmt_duration(seconds):
    minutes = int(seconds // 60)
    if minutes < 60:
        return f"{minutes} min"
    return f"{minutes // 60} h {minutes % 60:02d} min"


class Progress:
    """Shared counters, read by the ping thread."""

    def __init__(self, total):
        self.lock = threading.Lock()
        self.total = total
        self.done = 0
        self.failed = 0
        self.pairs = 0
        self.latest_valid = None
        self.started = time.time()

    def status(self):
        with self.lock:
            elapsed = time.time() - self.started
            pct = 100.0 * self.done / self.total if self.total else 100.0
            rate = self.done / elapsed if elapsed > 0 else 0
            remaining = (self.total - self.done) / rate if rate > 0 else None
            reached = self.latest_valid.strftime("%d.%m.%Y") if self.latest_valid else "–"
            eta = f", noch ca. {_fmt_duration(remaining)}" if remaining is not None else ""
            fails = f", {self.failed} Fehler" if self.failed else ""
            return (f"FogCast-Jahresverifikation: {_n(self.done)}/{_n(self.total)} Anfragen "
                    f"({pct:.0f} %), {_n(self.pairs)} Paare, bis {reached}{fails}. "
                    f"Läuft seit {_fmt_duration(elapsed)}{eta}.")


def ping_loop(progress, first_min, every_min, enabled, stop_event):
    """Status after `first_min`, then every `every_min` minutes after the start."""
    schedule = sorted({first_min * 60} | {every_min * 60 * k for k in range(1, 200)})
    for due in schedule:
        wait = due - (time.time() - progress.started)
        if wait > 0 and stop_event.wait(wait):
            return
        if stop_event.is_set():
            return
        notify(progress.status(), enabled)


# --------------------------------------------------------------------------
# Analysis
# --------------------------------------------------------------------------

def lead_group(lead):
    for label, lo, hi in LEAD_GROUPS:
        if lo <= lead < hi:
            return label
    return None


def analyze(out_dir, windows, step_days, min_coverage):
    """Compute rolling.csv from pairs.csv. Returns the per-model yearly summary."""
    pairs_path = os.path.join(out_dir, "pairs.csv")
    # (model, group) -> day -> [n, sum_abs, sum_sq, sum_err]
    daily = defaultdict(lambda: defaultdict(lambda: [0, 0.0, 0.0, 0.0]))
    first_day = last_day = None

    with open(pairs_path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if not row["observed"]:
                continue
            group = lead_group(float(row["lead_h"]))
            if group is None:
                continue
            err = float(row["forecast"]) - float(row["observed"])
            day = row["valid_time"][:10]
            acc = daily[(row["model"], group)][day]
            acc[0] += 1
            acc[1] += abs(err)
            acc[2] += err * err
            acc[3] += err
            first_day = day if first_day is None or day < first_day else first_day
            last_day = day if last_day is None or day > last_day else last_day

    if first_day is None:
        print("no pairs with observations yet -- nothing to analyse")
        return {}

    d0 = datetime.strptime(first_day, "%Y-%m-%d").date()
    d1 = datetime.strptime(last_day, "%Y-%m-%d").date()

    rolling_path = os.path.join(out_dir, "rolling.csv")
    with open(rolling_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["window_days", "window_start", "window_end", "model", "lead_group",
                         "n", "days_covered", "mae", "rmse", "bias"])
        for width in windows:
            # Align windows so the most recent one ends on the last day.
            end = d1
            ends = []
            while end - timedelta(days=width - 1) >= d0:
                ends.append(end)
                end -= timedelta(days=step_days)
            for end in reversed(ends):
                start = end - timedelta(days=width - 1)
                days = [(start + timedelta(days=i)).isoformat() for i in range(width)]
                for (model, group), per_day in sorted(daily.items()):
                    n = s_abs = s_sq = s_err = 0
                    covered = 0
                    for day in days:
                        acc = per_day.get(day)
                        if acc and acc[0]:
                            covered += 1
                            n += acc[0]
                            s_abs += acc[1]
                            s_sq += acc[2]
                            s_err += acc[3]
                    if n == 0 or covered < min_coverage * width:
                        continue
                    writer.writerow([width, start.isoformat(), end.isoformat(), model, group,
                                     n, covered, f"{s_abs / n:.4f}",
                                     f"{math.sqrt(s_sq / n):.4f}", f"{s_err / n:.4f}"])
    print(f"wrote {rolling_path}")

    # Whole-period summary, for the final message.
    summary = {}
    for (model, group), per_day in daily.items():
        n = sum(a[0] for a in per_day.values())
        if n:
            summary[(model, group)] = {
                "n": n,
                "mae": sum(a[1] for a in per_day.values()) / n,
                "bias": sum(a[3] for a in per_day.values()) / n,
                "first": min(per_day), "last": max(per_day),
            }
    return summary


def summary_text(out_dir):
    """MAE per model over the period every model covers -- the fair comparison."""
    since, same, _ = same_period(out_dir)
    if not same:
        return "keine Paare mit Messwerten"
    lines = [f"MAE °C, alle Modelle im gleichen Zeitraum ab "
             f"{datetime.strptime(since, TS):%d.%m.%Y}:"]
    for label, _, _ in LEAD_GROUPS:
        rows = sorted(((m, sc) for (m, g), sc in same.items() if g == label),
                      key=lambda r: r[1]["mae"])
        if rows:
            lines.append(f"**{label}**: " + ", ".join(
                f"{m} {sc['mae']:.2f}".replace(".", ",") for m, sc in rows))
    return "\n".join(lines)

# --------------------------------------------------------------------------
# HTML report
# --------------------------------------------------------------------------

def _week(valid_time):
    from datetime import date
    y, m, d = map(int, valid_time[:10].split("-"))
    return date(y, m, d).isocalendar()[:2]


def _bias_se(weeks):
    """Standard error of the bias from weekly means. Consecutive hours and days
    are correlated, so weeks are used as roughly independent blocks."""
    means = [s_ / n_ for n_, s_ in weeks.values() if n_]
    if len(means) < 2:
        return float("nan"), len(means)
    mu = sum(means) / len(means)
    sd = math.sqrt(sum((x - mu) ** 2 for x in means) / (len(means) - 1))
    return sd / math.sqrt(len(means)), len(means)


def same_period(out_dir):
    """Scores of every model over the period *all* of them cover, plus each
    model's bias over its whole archive.

    A model whose archive starts late (the ki_* models) would otherwise be
    compared on a few autumn weeks against a year-round average of the rest.
    Returns (since, scores, year) where scores[(model, group)] holds n, mae,
    bias, se, weeks for the common period and year[(model, group)] the same
    bias statistics over everything in pairs.csv.
    """
    first = {}
    rows = []
    with open(os.path.join(out_dir, "pairs.csv"), newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if not r["observed"]:
                continue
            m, v = r["model"], r["valid_time"]
            if m not in first or v < first[m]:
                first[m] = v
            rows.append((m, v, float(r["lead_h"]), float(r["forecast"]) - float(r["observed"])))
    if not first:
        return None, {}, {}
    since = max(first.values())
    acc = defaultdict(lambda: [0, 0.0, 0.0])
    weeks = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    year = defaultdict(lambda: [0, 0.0])
    year_weeks = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    for m, v, lead, err in rows:
        g = lead_group(lead)
        if g is None:
            continue
        w = _week(v)
        y = year[(m, g)]
        y[0] += 1
        y[1] += err
        yw = year_weeks[(m, g)][w]
        yw[0] += 1
        yw[1] += err
        if v < since:
            continue
        a = acc[(m, g)]
        a[0] += 1
        a[1] += abs(err)
        a[2] += err
        wk = weeks[(m, g)][w]
        wk[0] += 1
        wk[1] += err

    def pack(k, n, bias_sum, wk, mae=None):
        se, nw = _bias_se(wk)
        out = {"n": n, "bias": bias_sum / n, "se": se, "weeks": nw}
        if mae is not None:
            out["mae"] = mae / n
        return out

    scores = {k: pack(k, a[0], a[2], weeks[k], a[1]) for k, a in acc.items() if a[0]}
    yearly = {k: pack(k, y[0], y[1], year_weeks[k]) for k, y in year.items() if y[0]}
    return since, scores, yearly


MODEL_ROWS = [
    # model, provider, kind, grid, cell at 47.7 N, horizon, new runs
    ("meteoswiss_icon_ch1", "MeteoSwiss", "regional, Mitteleuropa", "0,01° ≈ 1 km", "1,1 × 0,7 km", "33 h", "alle 3 h"),
    ("icon_d2", "DWD", "regional, D + Nachbarn", "0,02° ≈ 2 km", "2,2 × 1,5 km", "48 h", "alle 3 h"),
    ("meteoswiss_icon_ch2", "MeteoSwiss", "regional, Mitteleuropa", "0,02° ≈ 2 km", "2,2 × 1,5 km", "120 h", "alle 6 h"),
    ("icon_eu", "DWD", "regional, Europa", "0,0625° ≈ 7 km", "7,0 × 4,7 km", "120 h", "alle 3 h"),
    ("icon_seamless", "DWD", "Kombination D2 → EU → Global", "je nach Vorlauf", "1,5–11 km", "7,5 Tage", "–"),
    ("ecmwf_ifs025", "ECMWF", "global", "0,25° ≈ 25 km", "27,8 × 18,7 km", "15 Tage", "alle 6 h"),
    ("ki_*_st", "FogCast", "Punktmodell RF/LSTM/CNN", "kein Gitter", "Punkt, 4,9 km neben Station", "46 h", "stündlich"),
    ("ki_*_lt", "FogCast", "Punktmodell RF/LSTM/CNN", "kein Gitter", "Punkt, 4,9 km neben Station", "168 h", "stündlich"),
]


def models_table_html():
    import html as _h
    rows = "".join(
        "<tr>" + f"<th scope='row'><code>{_h.escape(r[0])}</code>"
        + (" <span class='tag'>lokal</span>" if r[0].startswith("ki_") else "") + "</th>"
        + "".join(f"<td>{_h.escape(c)}</td>" for c in r[1:]) + "</tr>"
        for r in MODEL_ROWS)
    return ("<div class='scroll'><table class='models'><thead><tr><th>Modell</th><th>Anbieter</th>"
            "<th>Art</th><th>Gitterweite</th><th>Gitterzelle bei Konstanz</th><th>Horizont</th>"
            "<th>Takt</th></tr></thead><tbody>" + rows + "</tbody></table></div>")


# Setup diagram: hand-built SVG (geometry of the arcs computed, reviewed over five
# critique rounds). Colours come from the page's CSS variables, so it follows the
# light/dark theme.
SETUP_FIGURE = r"""<figure class="setup">
<svg viewBox="0 0 1100 650" role="img" aria-label="Aufbau der Verifikation: Wettermodelle gelangen über den FogCast-Cronjob stündlich in InfluxDB, KI-Modelle schreiben direkt hinein, die DWD-Messung wird live durchgereicht. Für jede Gültigkeit T liegen viele gespeicherte Vorhersagen vor; jede wird mit der einen Messung um T verglichen, nach Vorlaufzeit T − t gruppiert und in gleitenden 28-Tage-Fenstern gemittelt." font-size="12" fill="currentColor">
  <defs>
    <marker id="setup-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>
    <marker id="setup-arA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--accent)"/></marker>
  </defs>

  <text x="0" y="18" font-size="14" font-weight="600">① Woher die Daten kommen</text>

  <rect x="0" y="40" width="250" height="86" rx="8" style="fill:var(--box)" stroke="currentColor" stroke-opacity=".35"/>
  <text x="12" y="60" font-weight="600">Wettermodelle (NWP)</text>
  <text x="12" y="80">DWD: ICON-D2 · EU · Seamless</text>
  <text x="12" y="97">MeteoSwiss: ICON-CH1 · CH2</text>
  <text x="12" y="114">ECMWF: IFS 0,25°</text>

  <rect x="0" y="146" width="250" height="62" rx="8" style="fill:var(--box)" stroke="currentColor" stroke-opacity=".5" stroke-dasharray="5 4"/>
  <text x="12" y="166" font-weight="600">KI-Modelle (FogCast)</text>
  <text x="12" y="184">RF · LSTM · CNN</text>
  <text x="12" y="200" style="fill:var(--muted)">Erzeugung nicht öffentlich</text>

  <rect x="0" y="228" width="250" height="62" rx="8" style="fill:var(--accent-soft);stroke:var(--accent)" stroke-width="1.5"/>
  <text x="12" y="248" font-weight="600">DWD-Station 2712 Konstanz</text>
  <text x="12" y="266">47,6952° N · 9,1307° E · 428 m</text>
  <text x="12" y="282">misst die Lufttemperatur</text>

  <rect x="300" y="62" width="170" height="42" rx="8" style="fill:var(--box)" stroke="currentColor" stroke-opacity=".35"/>
  <text x="385" y="88" text-anchor="middle">Open-Meteo API</text>
  <line x1="250" y1="83" x2="298" y2="83" stroke="currentColor" marker-end="url(#setup-ar)"/>

  <rect x="530" y="40" width="190" height="86" rx="8" style="fill:var(--box)" stroke="currentColor" stroke-opacity=".35"/>
  <text x="625" y="62" text-anchor="middle" font-weight="600">FogCast-Cronjob</text>
  <text x="625" y="82" text-anchor="middle">fragt stündlich ab,</text>
  <text x="625" y="99" text-anchor="middle">speichert mit Zeitstempel t</text>
  <line x1="470" y1="83" x2="528" y2="83" stroke="currentColor" marker-end="url(#setup-ar)"/>

  <rect x="530" y="146" width="190" height="62" rx="8" style="fill:var(--box)" stroke="currentColor" stroke-opacity=".35"/>
  <text x="625" y="170" text-anchor="middle" font-weight="600">InfluxDB</text>
  <text x="625" y="190" text-anchor="middle">Bucket WeatherForecast</text>
  <line x1="625" y1="126" x2="625" y2="144" stroke="currentColor" marker-end="url(#setup-ar)"/>
  <text x="633" y="140" style="fill:var(--text2)" font-size="11">schreibt</text>
  <line x1="250" y1="177" x2="528" y2="177" stroke="currentColor" stroke-dasharray="5 4" marker-end="url(#setup-ar)"/>
  <text x="389" y="170" text-anchor="middle" style="fill:var(--muted)">schreibt direkt</text>

  <rect x="300" y="238" width="170" height="42" rx="8" style="fill:var(--box)" stroke="currentColor" stroke-opacity=".35"/>
  <text x="385" y="264" text-anchor="middle">DWD Opendata</text>
  <line x1="250" y1="259" x2="298" y2="259" style="stroke:var(--accent)" marker-end="url(#setup-arA)"/>

  <rect x="780" y="146" width="310" height="144" rx="8" style="fill:var(--box)" stroke="currentColor" stroke-opacity=".35"/>
  <line x1="780" y1="208" x2="1090" y2="208" stroke="currentColor" stroke-opacity=".2"/>
  <line x1="780" y1="242" x2="1090" y2="242" stroke="currentColor" stroke-opacity=".2"/>
  <text x="935" y="230" text-anchor="middle" font-weight="600">FogCast-API</text>
  <text x="935" y="183" text-anchor="middle">/forecasts?datetime=T</text>
  <text x="935" y="263" text-anchor="middle" style="fill:var(--accent)">/actual/temperature-history</text>
  <line x1="720" y1="185" x2="778" y2="185" stroke="currentColor" marker-end="url(#setup-ar)"/>
  <text x="749" y="178" text-anchor="middle" style="fill:var(--text2)" font-size="11">liest</text>
  <line x1="470" y1="259" x2="778" y2="259" style="stroke:var(--accent)" marker-end="url(#setup-arA)"/>
  <text x="625" y="252" text-anchor="middle" style="fill:var(--muted)">live weitergereicht, nicht gespeichert</text>

  <rect x="780" y="330" width="310" height="40" rx="8" style="fill:var(--surface)" stroke="currentColor"/>
  <text x="935" y="355" text-anchor="middle" font-weight="600">verify_fogcast_rolling.py</text>
  <line x1="880" y1="290" x2="880" y2="328" stroke="currentColor" marker-end="url(#setup-ar)"/>
  <text x="872" y="314" text-anchor="end" style="fill:var(--text2)" font-size="11">Vorhersagen</text>
  <line x1="1000" y1="290" x2="1000" y2="328" style="stroke:var(--accent)" marker-end="url(#setup-arA)"/>
  <text x="1008" y="314" style="fill:var(--accent)" font-size="11">Messungen</text>

  <g transform="translate(0,-6)">
  <text x="0" y="405" font-size="14" font-weight="600">② Wie aus einer Messung viele Fehler werden</text>

  <rect x="60" y="430" width="388.6" height="140" style="fill:var(--band1)"/>
  <rect x="448.6" y="430" width="194.3" height="140" style="fill:var(--band2)"/>
  <rect x="642.9" y="430" width="97.1" height="140" style="fill:var(--band3)"/>
  <line x1="448.6" y1="430" x2="448.6" y2="570" stroke="currentColor" stroke-opacity=".25"/>
  <line x1="642.9" y1="430" x2="642.9" y2="570" stroke="currentColor" stroke-opacity=".25"/>
  <text x="254" y="449" text-anchor="middle" style="fill:var(--text2)">Vorlauf 72–168 h</text>
  <text x="546" y="449" text-anchor="middle" style="fill:var(--text2)">24–72 h</text>
  <text x="691" y="449" text-anchor="middle" style="fill:var(--text2)">0–24 h</text>

  <text x="72" y="474" style="fill:var(--text2)">stündlich gespeicherte Vorhersagen für T (Zeitstempel t)</text>

  <path d="M60.0 560v-8 M64.0 560v-4 M68.1 560v-4 M72.1 560v-4 M76.2 560v-4 M80.2 560v-4 M84.3 560v-4 M88.3 560v-4 M92.4 560v-4 M96.4 560v-4 M100.5 560v-4 M104.5 560v-4 M108.6 560v-4 M112.6 560v-4 M116.7 560v-4 M120.7 560v-4 M124.8 560v-4 M128.8 560v-4 M132.9 560v-4 M136.9 560v-4 M141.0 560v-4 M145.0 560v-4 M149.0 560v-4 M153.1 560v-4 M157.1 560v-8 M161.2 560v-4 M165.2 560v-4 M169.3 560v-4 M173.3 560v-4 M177.4 560v-4 M181.4 560v-4 M185.5 560v-4 M189.5 560v-4 M193.6 560v-4 M197.6 560v-4 M201.7 560v-4 M205.7 560v-4 M209.8 560v-4 M213.8 560v-4 M217.9 560v-4 M221.9 560v-4 M226.0 560v-4 M230.0 560v-4 M234.0 560v-4 M238.1 560v-4 M242.1 560v-4 M246.2 560v-4 M250.2 560v-4 M254.3 560v-8 M258.3 560v-4 M262.4 560v-4 M266.4 560v-4 M270.5 560v-4 M274.5 560v-4 M278.6 560v-4 M282.6 560v-4 M286.7 560v-4 M290.7 560v-4 M294.8 560v-4 M298.8 560v-4 M302.9 560v-4 M306.9 560v-4 M311.0 560v-4 M315.0 560v-4 M319.0 560v-4 M323.1 560v-4 M327.1 560v-4 M331.2 560v-4 M335.2 560v-4 M339.3 560v-4 M343.3 560v-4 M347.4 560v-4 M351.4 560v-8 M355.5 560v-4 M359.5 560v-4 M363.6 560v-4 M367.6 560v-4 M371.7 560v-4 M375.7 560v-4 M379.8 560v-4 M383.8 560v-4 M387.9 560v-4 M391.9 560v-4 M396.0 560v-4 M400.0 560v-4 M404.0 560v-4 M408.1 560v-4 M412.1 560v-4 M416.2 560v-4 M420.2 560v-4 M424.3 560v-4 M428.3 560v-4 M432.4 560v-4 M436.4 560v-4 M440.5 560v-4 M444.5 560v-4 M448.6 560v-8 M452.6 560v-4 M456.7 560v-4 M460.7 560v-4 M464.8 560v-4 M468.8 560v-4 M472.9 560v-4 M476.9 560v-4 M481.0 560v-4 M485.0 560v-4 M489.0 560v-4 M493.1 560v-4 M497.1 560v-4 M501.2 560v-4 M505.2 560v-4 M509.3 560v-4 M513.3 560v-4 M517.4 560v-4 M521.4 560v-4 M525.5 560v-4 M529.5 560v-4 M533.6 560v-4 M537.6 560v-4 M541.7 560v-4 M545.7 560v-8 M549.8 560v-4 M553.8 560v-4 M557.9 560v-4 M561.9 560v-4 M566.0 560v-4 M570.0 560v-4 M574.0 560v-4 M578.1 560v-4 M582.1 560v-4 M586.2 560v-4 M590.2 560v-4 M594.3 560v-4 M598.3 560v-4 M602.4 560v-4 M606.4 560v-4 M610.5 560v-4 M614.5 560v-4 M618.6 560v-4 M622.6 560v-4 M626.7 560v-4 M630.7 560v-4 M634.8 560v-4 M638.8 560v-4 M642.9 560v-8 M646.9 560v-4 M651.0 560v-4 M655.0 560v-4 M659.0 560v-4 M663.1 560v-4 M667.1 560v-4 M671.2 560v-4 M675.2 560v-4 M679.3 560v-4 M683.3 560v-4 M687.4 560v-4 M691.4 560v-4 M695.5 560v-4 M699.5 560v-4 M703.6 560v-4 M707.6 560v-4 M711.7 560v-4 M715.7 560v-4 M719.8 560v-4 M723.8 560v-4 M727.9 560v-4 M731.9 560v-4 M736.0 560v-4 M740.0 560v-8" stroke="currentColor" stroke-opacity=".3"/>
  <line x1="60" y1="560" x2="740" y2="560" stroke="currentColor"/>
  <path d="M60 554v12 M448.6 554v12 M642.9 554v12" stroke="currentColor"/>
  <g fill="none" stroke="currentColor" stroke-opacity=".55">
    <path d="M719.8 560 Q726.0 550.0 731.0 559.2"/>
    <path d="M659.0 560 Q699.1 530.0 731.8 556.2"/>
    <path d="M537.6 560 Q645.4 500.0 733.6 553.6"/>
    <path d="M250.2 560 Q517.5 464.0 736.2 551.8"/>
    <path d="M132.9 560 Q466.4 428.0 739.2 551.0"/>
  </g>
  <g><circle cx="719.8" cy="560" r="4"/><circle cx="659.0" cy="560" r="4"/><circle cx="537.6" cy="560" r="4"/><circle cx="132.9" cy="560" r="4"/><circle cx="246.2" cy="560" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="250.2" cy="560" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="254.3" cy="560" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/></g>
  <circle cx="740" cy="560" r="9" style="fill:var(--accent)"/>

  <text x="60" y="584" text-anchor="middle" style="fill:var(--text2)">T − 7 Tage</text>
  <path d="M242.2 566v4H258.3 v-4" fill="none" stroke="currentColor" stroke-opacity=".6"/>
  <path d="M250.2 570v3" stroke="currentColor" stroke-opacity=".6"/>
  <text x="250.2" y="584" text-anchor="middle" style="fill:var(--muted)" font-size="11">1 NWP-Lauf, 3× gespeichert</text>
  <text x="448.6" y="584" text-anchor="middle" style="fill:var(--text2)">T − 3 Tage</text>
  <text x="537.6" y="584" text-anchor="middle" font-weight="700">t</text>
  <text x="642.9" y="584" text-anchor="middle" style="fill:var(--text2)">T − 1 Tag</text>
  <text x="740" y="584" text-anchor="middle" font-weight="700">T</text>
  <text x="740" y="600" text-anchor="middle" style="fill:var(--accent)" font-size="11">Messung DWD</text>

  <path d="M537.6 606v12 M537.6 612H740 M740 606v12" fill="none" stroke="currentColor" stroke-opacity=".6"/>
  <text x="638.8" y="634" text-anchor="middle">Vorlauf = T − t, hier 50 h</text>
  <text x="22" y="604" style="fill:var(--text2)" font-size="11">Speicherzeitpunkt t →</text>

  <text x="790" y="444" style="fill:var(--text2)" font-size="11">für jedes Modell und jede Gültigkeit T:</text>
  <rect x="790" y="452" width="300" height="40" rx="8" style="fill:var(--box)" stroke="currentColor" stroke-opacity=".35"/>
  <text x="940" y="477" text-anchor="middle">Fehler = Vorhersage − Messung</text>
  <rect x="790" y="512" width="300" height="68" rx="8" style="fill:var(--box)" stroke="currentColor" stroke-opacity=".35"/>
  <text x="940" y="532" text-anchor="middle">je Modell und Vorlaufgruppe:</text>
  <text x="940" y="549" text-anchor="middle">MAE und Bias</text>
  <text x="940" y="566" text-anchor="middle">über alle T im 28-Tage-Fenster</text>
  <rect x="790" y="600" width="300" height="40" rx="8" style="fill:var(--box)" stroke="currentColor" stroke-opacity=".35"/>
  <text x="940" y="625" text-anchor="middle">Schrittweite 1 Woche → Zeitreihe</text>
  <line x1="940" y1="492" x2="940" y2="510" stroke="currentColor" marker-end="url(#setup-ar)"/>
  <line x1="940" y1="580" x2="940" y2="598" stroke="currentColor" marker-end="url(#setup-ar)"/>
  <path d="M750 560 C772 560 770 472 788 472" fill="none" stroke="currentColor" marker-end="url(#setup-ar)"/>
</g>
</svg>
<figcaption>Oben: Herkunft der Daten; blau: Weg der Messung. Unten: Für eine Gültigkeit T liegen viele gespeicherte Vorhersagen vor, jede mit eigener Vorlaufzeit T − t. Jedes Modell reicht nur so weit, wie es rechnet (z. B. ICON-D2 48&#160;h, ICON-CH1 33&#160;h). Bei den KI-Modellen ist t ebenfalls der Speicherzeitpunkt; wie ihre Vorhersagen entstehen, ist nicht bekannt. Ausgewertet werden Gültigkeiten T im 5-Stunden-Raster über ein Jahr.</figcaption>
</figure>"""


def artifact_fragment(page):
    """Strip the document skeleton; the Artifact publisher wraps the page in its own."""
    import re
    page = re.sub(r"<!doctype html>\s*<html[^>]*>\s*<head>", "", page, flags=re.I)
    page = re.sub(r'<meta charset="utf-8">\s*', "", page)
    page = re.sub(r'<meta name="viewport"[^>]*>\s*', "", page)
    page = page.replace("</head><body>", "").replace("</body></html>", "")
    return page.strip() + "\n"


def write_year_html(out_dir, path, window, artifact_path=None):
    import html as _h
    rolling = [r for r in csv.DictReader(open(os.path.join(out_dir, "rolling.csv"),
                                              newline="", encoding="utf-8"))
               if int(r["window_days"]) == window]
    if not rolling:
        print(f"no {window}-day windows in rolling.csv")
        return
    models = []
    for r in rolling:
        if r["model"] not in models:
            models.append(r["model"])
    series = defaultdict(lambda: defaultdict(lambda: {"x": [], "mae": [], "bias": [], "n": []}))
    for r in rolling:
        d = series[r["lead_group"]][r["model"]]
        d["x"].append(r["window_end"])
        d["mae"].append(round(float(r["mae"]), 3))
        d["bias"].append(round(float(r["bias"]), 3))
        d["n"].append(int(r["n"]))

    since, same, yearly = same_period(out_dir)
    groups = [g for g, _, _ in LEAD_GROUPS]
    all_models = sorted({m for m, _ in same}, key=lambda m: (m.startswith("ki_"), m))
    head = "".join(f"<th colspan='2'>{g}</th>" for g in groups)
    sub = "".join("<th>MAE</th><th>Bias ± SE</th>" for _ in groups)
    body = []
    for m in sorted(all_models, key=lambda m: same.get((m, "0-24h"), {"mae": 9})["mae"]):
        tag = " <span class='tag'>lokal</span>" if m.startswith("ki_") else ""
        cells = []
        for g in groups:
            sc = same.get((m, g))
            cells.append(f"<td>{sc['mae']:.2f}</td><td>{sc['bias']:+.2f} ± {sc['se']:.2f}</td>".replace(".", ",")
                         if sc else "<td>–</td><td>–</td>")
        body.append(f"<tr><th scope='row'><code>{_h.escape(m)}</code>{tag}</th>{''.join(cells)}</tr>")
    since_txt = (datetime.strptime(since, TS).strftime("%d.%m.%Y %H:%M UTC") if since else "–")

    # Whole-archive bias, only for models with a long enough record to say something.
    long_models = sorted({m for (m, g), y in yearly.items() if y["weeks"] >= 26},
                         key=lambda m: yearly.get((m, "0-24h"), {"bias": 9})["bias"])
    yhead = "".join(f"<th>{g}</th>" for g in groups)
    yrows = []
    for m in long_models:
        cells = []
        for g in groups:
            y = yearly.get((m, g))
            if y and y["weeks"] >= 26:
                t = y["bias"] / y["se"] if y["se"] else float("nan")
                strong = abs(t) >= 2
                val = f"{y['bias']:+.2f} ± {y['se']:.2f}".replace(".", ",")
                cells.append(f"<td>{'<strong>' + val + '</strong>' if strong else val}</td>")
            else:
                cells.append("<td>–</td>")
        yrows.append(f"<tr><th scope='row'><code>{_h.escape(m)}</code></th>{''.join(cells)}</tr>")
    year_table = (f"<div class='scroll'><table><thead><tr><th>Modell</th>{yhead}</tr></thead>"
                  f"<tbody>{''.join(yrows)}</tbody></table></div>")

    missing = [m for m in all_models if m not in models]
    data = {"groups": groups, "models": models, "series": series}
    page = YEAR_TEMPLATE
    for key, value in {
        "__WINDOW__": str(window),
        "__FIRST__": rolling[0]["window_end"],
        "__LAST__": rolling[-1]["window_end"],
        "__SINCE__": since_txt,
        "__TABLE__": (f"<div class='scroll'><table><thead><tr><th rowspan='2'>Modell</th>{head}</tr>"
                      f"<tr>{sub}</tr></thead><tbody>{''.join(body)}</tbody></table></div>"),
        "__MISSING__": ", ".join(f"<code>{_h.escape(m)}</code>" for m in missing) or "keine",
        "__GENERATED__": datetime.now().strftime("%d.%m.%Y %H:%M"),
        "__MODELS__": models_table_html(),
        "__YEARBIAS__": year_table,
        "__SETUP__": SETUP_FIGURE,
        "__DATA__": json.dumps(data).replace("</", "<\\/"),
    }.items():
        page = page.replace(key, value)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(page)
    print(f"wrote {path}")
    if artifact_path:
        with open(artifact_path, "w", encoding="utf-8") as fh:
            fh.write(artifact_fragment(page))
        print(f"wrote {artifact_path}")


YEAR_TEMPLATE = r"""<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FogCast-Jahresverifikation</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.27.0/plotly.min.js"></script>
<style>
:root{color-scheme:light;--bg:#f5f5f3;--surface:#fcfcfb;--text:#0b0b0b;--text2:#52514e;--muted:#77766f;
 --rule:#e2e1dc;--grid:#ecebe7;--tag:#e7eefa;--tag-ink:#1c5cab;
 --box:#f0efec;--accent:#2a78d6;--accent-soft:#cde2fb;--band1:#f1f5fb;--band2:#e2ebf7;--band3:#cfdff3;
 --s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--s7:#4a3aa7;--s8:#e34948;--other:#8a8983}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){color-scheme:dark;--bg:#121211;--surface:#1a1a19;
 --text:#fff;--text2:#c3c2b7;--muted:#9a998f;--rule:#2f2f2c;--grid:#262624;--tag:#1f2d42;--tag-ink:#86b6ef;
 --box:#232321;--accent:#3987e5;--accent-soft:#1c3556;--band1:#1b2230;--band2:#25324a;--band3:#2f4262;
 --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;--other:#7d7c75}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#121211;--surface:#1a1a19;--text:#fff;--text2:#c3c2b7;--muted:#9a998f;
 --rule:#2f2f2c;--grid:#262624;--tag:#1f2d42;--tag-ink:#86b6ef;
 --box:#232321;--accent:#3987e5;--accent-soft:#1c3556;--band1:#1b2230;--band2:#25324a;--band3:#2f4262;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;
 --s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;--other:#7d7c75}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding-inline:16px}
main{max-width:1120px;margin:0 auto;padding-block:28px 48px}
h1{font-size:26px;line-height:1.2;margin:0 0 6px} h2{font-size:18px;margin:34px 0 10px}
p.lede{color:var(--text2);margin:0 0 18px;max-width:72ch}
code{font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
.card,section.chart{background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:16px 18px;margin:14px 0}
ul{margin:4px 0 0;padding-left:20px} li{margin:4px 0}
.grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.grid>div{min-width:0}
@media (min-width:980px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.ptitle{font-size:13px;color:var(--text2);margin-bottom:4px} .plot{width:100%;height:330px}
h3{font-size:15px;margin:0 0 10px}
.scroll{overflow-x:auto}
table{border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:14px;min-width:100%}
th,td{padding:6px 10px;border-bottom:1px solid var(--rule);text-align:right;white-space:nowrap}
thead th{color:var(--text2);font-weight:600;text-align:center} tbody th{text-align:left;font-weight:normal}
table.models td,table.models th{text-align:left;white-space:normal}
.tag{display:inline-block;margin-left:6px;padding:0 7px;border-radius:999px;background:var(--tag);color:var(--tag-ink);font-size:11px;font-weight:600}
.note{font-size:13px;color:var(--text2)}
.formulas{display:grid;gap:10px;margin:14px 0;font-size:17px;overflow-x:auto}
.formulas math{margin:0;justify-self:start}
figure.setup{margin:14px 0;background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:16px 18px}
figure.setup{overflow-x:auto}
figure.setup svg{width:100%;min-width:760px;height:auto;display:block}
figure.setup figcaption{font-size:13px;color:var(--text2);margin-top:10px;max-width:95ch} footer{margin-top:30px;color:var(--muted);font-size:13px}
</style></head><body><main>
<h1>FogCast – Temperaturfehler im Jahresverlauf</h1>
<p class="lede">Wie gut treffen die Modelle die an der DWD-Station Konstanz gemessene Lufttemperatur –
und wie ändert sich das über das Jahr? Jeder Punkt fasst die Fehler der vorangehenden
__WINDOW__ Tage; das Fenster rückt wöchentlich weiter (Fensterenden __FIRST__ bis __LAST__).</p>

<h2>Aufbau</h2>
__SETUP__

<h2>Die Modelle</h2>
<div class="card">
__MODELS__
<p class="note" style="margin-bottom:0">Alle Wettermodelle werden am Stationspunkt abgefragt
(47,6952° N / 9,1307° E); verglichen wird also der Wert der Gitterzelle, in der die Station liegt.
Bei ECMWF ist das eine Zelle von etwa 28 × 19 km, die See und Hinterland mittelt; bei ICON-CH1 etwa
1 × 0,7 km. FogCast speichert ECMWF in der frei verfügbaren 0,25°-Version, nicht die 9-km-Version, und
in 3-stündlicher Zeitauflösung, die für stündliche Werte interpoliert wird. Die KI-Modelle rechnen
für einen einzigen Punkt 4,9 km südöstlich der Station; wie sie trainiert wurden, ist nicht öffentlich.
Ihr Wettercode stammt aus NWP-Modellen, sie sagen nur die Temperatur selbst vorher.
Angaben zu Gitter, Horizont und Takt: Open-Meteo-Modelldokumentation.</p>
</div>

<h2>Kennzahlen</h2>
<div class="card metrics">
<p class="note" style="margin-top:0">Für ein Modell und eine Vorlaufgruppe ist <em>i</em> = 1 … <em>N</em>
jedes Paar aus einer gespeicherten Vorhersage <em>f<sub>i</sub></em> für die Gültigkeit <em>T<sub>i</sub></em>
(gespeichert zur Zeit <em>t<sub>i</sub></em>, Vorlauf <em>T<sub>i</sub></em> − <em>t<sub>i</sub></em> in der Gruppe)
und der DWD-Messung <em>y<sub>i</sub></em> zur Zeit <em>T<sub>i</sub></em>. Jede gespeicherte Vorhersage zählt
einzeln.</p>
<div class="formulas">
<math display="block"><mrow><msub><mi>e</mi><mi>i</mi></msub><mo>=</mo><msub><mi>f</mi><mi>i</mi></msub><mo>−</mo><msub><mi>y</mi><mi>i</mi></msub></mrow></math>
<math display="block"><mrow><mtext>MAE</mtext><mo>=</mo><mfrac><mn>1</mn><mi>N</mi></mfrac><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>N</mi></munderover><mrow><mo>|</mo><msub><mi>e</mi><mi>i</mi></msub><mo>|</mo></mrow></mrow></math>
<math display="block"><mrow><mtext>Bias</mtext><mo>=</mo><mfrac><mn>1</mn><mi>N</mi></mfrac><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>N</mi></munderover><msub><mi>e</mi><mi>i</mi></msub></mrow></math>
<math display="block"><mrow><mtext>RMSE</mtext><mo>=</mo><msqrt><mfrac><mn>1</mn><mi>N</mi></mfrac><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>N</mi></munderover><msubsup><mi>e</mi><mi>i</mi><mn>2</mn></msubsup></msqrt></mrow></math>
<math display="block"><mrow><mtext>SE</mtext><mo>=</mo><mfrac><msub><mi>s</mi><mi>W</mi></msub><msqrt><mi>W</mi></msqrt></mfrac></mrow></math>
</div>
<p class="note" style="margin-bottom:0">Der Bias ist der mittlere Fehler, positiv heißt Vorhersage zu warm.
Beim Bias heben sich positive und negative Fehler auf, beim MAE nicht; es gilt RMSE ≥ MAE ≥ |Bias|.
Für den Standardfehler SE wird der Bias je Kalenderwoche berechnet; <em>s<sub>W</sub></em> ist deren
Standardabweichung, <em>W</em> die Zahl der Wochen. Wochen statt einzelner Paare, weil aufeinanderfolgende
Stunden und Tage korreliert sind; bei nur 2–3 Wochen ist der SE selbst noch grob. Der RMSE
steht nur in <code>rolling.csv</code>. In den Jahresgrafiken umfasst <em>N</em> alle <em>T</em> eines
28-Tage-Fensters, in der Vergleichstabelle alle <em>T</em> ab dem 19.09.2026.</p>
</div>

<h2>Ergebnis</h2>
<section class="chart"><h3>MAE (°C), niedriger ist besser</h3><div class="grid" id="mae"></div></section>
<section class="chart"><h3>Bias (°C), Vorhersage − Messung, nahe 0 ist besser; positiv = zu warm</h3><div class="grid" id="bias"></div></section>
<p class="note">Farbe = Modell. <code>icon_d2</code> und <code>icon_seamless</code> sind bis 48 h
praktisch identisch (seamless nutzt dort ICON-D2); <code>icon_seamless</code> ist deshalb gepunktet. Leere Panels bzw. fehlende Linien: Das Modell rechnet
nicht so weit voraus (ICON-D2 bis 48 h, CH1 bis 33 h, ICON-EU und CH2 bis 120 h).
Ohne Jahresverlauf, weil zu kurz im Archiv: __MISSING__.</p>

<h2>Bias über das ganze Jahr</h2>
<div class="card">
<p class="note" style="margin-top:0">Bias ± Standardfehler je Vorlaufgruppe, über alle Gültigkeiten des
Jahres. Fett: mindestens zwei Standardfehler von null entfernt. Nur Modelle mit mindestens 26 Wochen im
Archiv; die KI-Modelle haben dafür noch zu wenig Daten.</p>
__YEARBIAS__
</div>

<h2>Fairer Vergleich aller Modelle: gleicher Zeitraum</h2>
<div class="card">
<p class="note" style="margin-top:0">Nur Gültigkeitszeitpunkte ab __SINCE__ – ab da haben alle Modelle
Daten. Die lokalen KI-Modelle lassen sich nur so vergleichen; ihr Archiv beginnt erst im September.
Achtung: Das ist Spätsommer, nach dem Jahresverlauf oben die Jahreszeit mit den größten Fehlern.</p>
__TABLE__
</div>

<h2>Einschränkungen</h2>
<div class="card"><ul>
<li><strong>Vorlaufzeit = Gültigkeit minus Speicherzeitpunkt</strong> im FogCast-Cronjob, nicht minus
Modellstart. Der Cronjob speichert NWP-Vorhersagen stündlich neu, auch wenn das Modell nur alle 3–6 h
rechnet – dieselbe Vorhersage zählt daher mehrfach mit wachsender Vorlaufzeit.</li>
<li><strong>Eine Station:</strong> DWD 2712 Konstanz. Die Wettermodelle werden genau dort abgefragt,
die KI-Modelle 4,9 km entfernt (47,66/9,17) – ein kleiner, aber systematischer Unterschied.</li>
<li><strong>Die Gruppe 72–168 h ist nicht für alle gleich:</strong> CH2 endet bei 120 h und hat dort
nur die leichteren Vorlaufzeiten.</li>
<li>Fenster mit Daten an weniger als der Hälfte der Tage sind weggelassen.</li>
</ul></div>

<footer>Erzeugt __GENERATED__ mit <code>verify_fogcast_rolling.py --analyze-only --html</code>.
Daten: <code>fogcast-data/pairs.csv</code>, <code>rolling.csv</code>. Quelle: FogCast-API der HTWG Konstanz, DWD.</footer>
</main>
<script>
const DATA = __DATA__;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function draw(){
  const grids = {mae: document.getElementById('mae'), bias: document.getElementById('bias')};
  if (typeof Plotly === 'undefined'){ for (const g of Object.values(grids)) g.innerHTML =
    '<p class="note">Grafik nicht verfügbar (Plotly konnte nicht geladen werden).</p>'; return; }
  const surface=css('--surface'), text=css('--text'), text2=css('--text2'), grid=css('--grid'), rule=css('--rule');
  for (const metric of ['mae','bias']){
    let lo=Infinity, hi=-Infinity;
    for (const g of DATA.groups) for (const m in (DATA.series[g]||{}))
      for (const v of DATA.series[g][m][metric]){ lo=Math.min(lo,v); hi=Math.max(hi,v); }
    if (metric==='mae') lo = 0;
    const pad=(hi-lo)*0.06||0.1, range=[metric==='mae'?0:lo-pad, hi+pad];
    const container = grids[metric];
    if (!container.dataset.built){
      container.innerHTML = DATA.groups.map((g,i)=>`<div><div class="ptitle">Vorlauf ${g}</div><div class="plot" id="${metric}-${i}"></div></div>`).join('');
      container.dataset.built = '1';
    }
    DATA.groups.forEach((g,i)=>{
      const traces = DATA.models.filter(m => DATA.series[g] && DATA.series[g][m]).map(m=>{
        const c = css('--s'+(DATA.models.indexOf(m)+1)) || css('--other'), d = DATA.series[g][m];
        return {type:'scatter', mode:'lines', name:m, x:d.x, y:d[metric], customdata:d.n,
          // icon_seamless equals icon_d2 up to 48 h; dotted so the line underneath stays visible
          line:{color:c, width:2, dash: m==='icon_seamless' ? 'dot' : 'solid'},
          hovertemplate:'%{y:.2f} °C  (n=%{customdata})<extra>'+m+'</extra>'};
      });
      Plotly.react(document.getElementById(metric+'-'+i), traces, {
        paper_bgcolor:surface, plot_bgcolor:surface, separators:',.',
        font:{family:'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color:text2, size:12},
        margin:{l:44,r:8,t:6,b:70}, hovermode:'x unified',
        hoverlabel:{bgcolor:surface, bordercolor:rule, font:{color:text}},
        xaxis:{type:'date', tickformat:'%b %y', gridcolor:grid, linecolor:rule, showspikes:true,
               spikecolor:text2, spikethickness:1, spikemode:'across'},
        yaxis:{range, gridcolor:grid, zeroline:metric==='bias', zerolinecolor:text2, tickformat:'.1f'},
        legend:{orientation:'h', y:-0.22, x:0, font:{color:text, size:11}},
        shapes:[]
      }, {displayModeBar:false, responsive:true});
    });
  }
}
draw();
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw); } catch(e) {}
try { new MutationObserver(draw).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']}); } catch(e) {}
</script></body></html>
"""


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Rolling yearly verification of FogCast models.")
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--every", type=int, default=5,
                    help="hours between valid times; 5 cycles through every hour of the day")
    ap.add_argument("--models", default=",".join(DEFAULT_MODELS))
    ap.add_argument("--workers", type=int, default=2,
                    help="parallel requests to the university server (default 2)")
    ap.add_argument("--out", default="fogcast-data")
    ap.add_argument("--windows", default="14,21,28", help="window lengths in days")
    ap.add_argument("--step", type=int, default=7, help="days between windows")
    ap.add_argument("--min-coverage", type=float, default=0.5,
                    help="skip windows where the model has data on fewer days than this share")
    ap.add_argument("--notify", action="store_true", help="push progress via ntfy-send")
    ap.add_argument("--first-ping", type=float, default=10, help="minutes until the first status")
    ap.add_argument("--ping-every", type=float, default=30, help="minutes between statuses")
    ap.add_argument("--html", nargs="?", const="fogcast-report-jahr.html",
                    help="also write an HTML report of the yearly course "
                         "(default fogcast-report-jahr.html, gitignored)")
    ap.add_argument("--artifact", nargs="?", const="fogcast-artifact.html",
                    help="also write a version for the Artifact publisher (no html/head/body)")
    ap.add_argument("--html-window", type=int, default=28,
                    help="window length in days shown in the HTML report (default 28)")
    ap.add_argument("--analyze-only", action="store_true",
                    help="skip fetching, recompute rolling.csv from pairs.csv")
    args = ap.parse_args()

    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)
    windows = [int(w) for w in args.windows.split(",")]

    if args.analyze_only:
        analyze(out_dir, windows, args.step, args.min_coverage)
        print(summary_text(out_dir))
        if args.html or args.artifact:
            write_year_html(out_dir, args.html or "fogcast-report-jahr.html",
                            args.html_window, args.artifact)
        return

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    stop = now - timedelta(hours=2)
    start = stop - timedelta(days=args.days)
    valid_times = []
    t = start
    while t <= stop:
        valid_times.append(t)
        t += timedelta(hours=args.every)

    print(f"FogCast rolling verification")
    print(f"  period  {start:%Y-%m-%d %H:%M} .. {stop:%Y-%m-%d %H:%M} UTC, every {args.every} h "
          f"({len(valid_times)} valid times)")
    print(f"  models  {', '.join(models)}")
    print(f"  output  {out_dir}", flush=True)

    # --- observations ------------------------------------------------------
    print("fetching DWD observations month by month ...", flush=True)
    obs = get_observations_by_month(start, stop + timedelta(hours=1))
    with open(os.path.join(out_dir, "observations.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["valid_time", "observed"])
        for when in sorted(obs):
            w.writerow([when.strftime(TS), obs[when]])
    print(f"  {len(obs)} hourly observations", flush=True)
    if not obs:
        notify("FogCast-Jahresverifikation abgebrochen: keine DWD-Messwerte erhalten.", args.notify)
        sys.exit(1)

    # --- resume state ------------------------------------------------------
    done_path = os.path.join(out_dir, "done.txt")
    done = set()
    if os.path.exists(done_path):
        with open(done_path, encoding="utf-8") as fh:
            done = {line.strip() for line in fh if line.strip()}
        print(f"  resuming: {len(done)} model/time pairs already fetched", flush=True)

    # --- where each model's archive starts ----------------------------------
    print("probing where each model's archive starts ...", flush=True)
    starts = {}
    for model in models:
        first = first_available(model, valid_times)
        starts[model] = first
        print(f"  {model:22s} {first:%Y-%m-%d}" if first else f"  {model:22s} no data",
              flush=True)

    jobs = [(t, m) for t in valid_times for m in models
            if starts[m] is not None and t >= starts[m]
            and f"{m}|{t.strftime(TS)}" not in done]
    jobs.sort()
    total = len(jobs)
    print(f"  {total} requests to go", flush=True)

    # --- fetch ---------------------------------------------------------------
    pairs_path = os.path.join(out_dir, "pairs.csv")
    new_file = not os.path.exists(pairs_path)
    pairs_fh = open(pairs_path, "a", newline="", encoding="utf-8")
    pairs_writer = csv.writer(pairs_fh)
    if new_file:
        pairs_writer.writerow(["model", "valid_time", "run_time", "lead_h", "forecast", "observed"])
    done_fh = open(done_path, "a", encoding="utf-8")

    progress = Progress(total)
    stop_event = threading.Event()
    pinger = threading.Thread(target=ping_loop, daemon=True,
                              args=(progress, args.first_ping, args.ping_every,
                                    args.notify, stop_event))
    pinger.start()

    failed = []

    def handle(model, valid, rows):
        if rows is None:
            failed.append((valid, model))
            with progress.lock:
                progress.failed += 1
                progress.done += 1
            return
        observed = obs.get(valid)
        for run, lead, value in rows:
            pairs_writer.writerow([model, valid.strftime(TS), run.strftime(TS), f"{lead:.2f}",
                                   f"{value:.3f}", "" if observed is None else f"{observed:.1f}"])
        done_fh.write(f"{model}|{valid.strftime(TS)}\n")
        with progress.lock:
            progress.done += 1
            progress.pairs += len(rows)
            if progress.latest_valid is None or valid > progress.latest_valid:
                progress.latest_valid = valid

    try:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(fetch_forecasts, m, t): (m, t) for t, m in jobs}
            for i, fut in enumerate(as_completed(futures), 1):
                model, valid = futures[fut]
                handle(model, valid, fut.result())
                if i % 200 == 0:
                    pairs_fh.flush()
                    done_fh.flush()
                    print(progress.status(), flush=True)

        # One sequential retry for anything that failed.
        if failed:
            retry = list(failed)
            failed.clear()
            print(f"retrying {len(retry)} failed requests ...", flush=True)
            with progress.lock:
                progress.failed = 0
            for valid, model in retry:
                rows = fetch_forecasts(model, valid)
                if rows is None:
                    failed.append((valid, model))
                else:
                    with progress.lock:
                        progress.done -= 1  # handle() counts it again
                    handle(model, valid, rows)
    finally:
        stop_event.set()
        if not pairs_fh.closed:
            pairs_fh.close()
        if not done_fh.closed:
            done_fh.close()

    elapsed = _fmt_duration(time.time() - progress.started)
    print(f"fetch finished in {elapsed}, {progress.pairs} pairs, {len(failed)} failed", flush=True)

    # --- analysis ----------------------------------------------------------
    analyze(out_dir, windows, args.step, args.min_coverage)
    text = summary_text(out_dir)
    if args.html or args.artifact:
        write_year_html(out_dir, args.html or "fogcast-report-jahr.html",
                        args.html_window, args.artifact)
    print(text, flush=True)

    fails = f" {len(failed)} Anfragen endgültig fehlgeschlagen." if failed else ""
    notify(f"FogCast-Jahresverifikation **fertig** nach {elapsed}: {_n(progress.pairs)} Paare, "
           f"{_n(total)} Anfragen.{fails}\n\n{text}\n\nDaten: {out_dir}/",
           args.notify)


if __name__ == "__main__":
    main()
