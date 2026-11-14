"""Ardi: relief around the pilot point -> terrain.json (read by the app's "Parts of your land" block).
Input : *SRTMGL1-NC-003-results.csv from AppEEARS (already in this folder; every request point has an SRTM height)
Output: terrain.json  - heights relative to the point, the range, and a least-squares tilt (direction + %)
Nothing is typed in by hand. SRTM heights are whole metres with a vertical error of a few metres, so the
app describes this as a gentle tilt of the AREA, never as a measured dip or ridge inside one plot.
pip install pandas numpy"""
import glob, json, math, datetime as dt
import numpy as np, pandas as pd
from config import LAT, LON, POINT_NAME

f = sorted(glob.glob("*SRTMGL1-NC-003-results.csv"))[0]
s = pd.read_csv(f).drop_duplicates("ID")
c = [x for x in s.columns if x.endswith("SRTMGL1_DEM")][0]
kx = 111_320.0 * math.cos(math.radians(LAT)); ky = 110_574.0
s["x_m"] = (s["Longitude"] - LON) * kx          # east +
s["y_m"] = (s["Latitude"] - LAT) * ky           # north +
s["elev_m"] = s[c].astype(float)
# two points in the same 30 m SRTM pixel carry the same height: keep one per pixel for the fit
px = s.drop_duplicates(["SRTMGL1_NC_003_Line_Y_30m", "SRTMGL1_NC_003_Sample_X_30m"]) if "SRTMGL1_NC_003_Line_Y_30m" in s else s
A = np.c_[px.x_m, px.y_m, np.ones(len(px))]
(a, b, z0), *_ = np.linalg.lstsq(A, px.elev_m, rcond=None)     # z = a*x + b*y + z0
grad = 100 * math.hypot(a, b)
bearing = (math.degrees(math.atan2(-a, -b)) + 360) % 360        # downhill direction, 0 = north
names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]
resid = px.elev_m - (A @ np.array([a, b, z0]))
centre = float(s.loc[s.ID.astype(str) == "center", "elev_m"].iloc[0]) if (s.ID.astype(str) == "center").any() else float(z0)
out = {
  "generated": dt.datetime.now().isoformat(timespec="minutes"),
  "point": {"name": POINT_NAME, "lat": LAT, "lon": LON, "elev_m": centre},
  "source": "NASA SRTM v3 (SRTMGL1_NC.003), ~30 m pixels, whole-metre heights, acquired Feb 2000",
  "file": f, "n_points": int(len(s)), "n_pixels": int(len(px)),
  "extent_m": {"east_west": round(float(s.x_m.max() - s.x_m.min())), "north_south": round(float(s.y_m.max() - s.y_m.min()))},
  "elev_min_m": float(s.elev_m.min()), "elev_max_m": float(s.elev_m.max()), "elev_range_m": float(s.elev_m.max() - s.elev_m.min()),
  "tilt": {"gradient_pct": round(grad, 1), "downhill_bearing_deg": round(bearing), "downhill_toward": names[int((bearing + 22.5) // 45) % 8],
           "fit_residual_sd_m": round(float(resid.std()), 1)},
  "points": [{"id": str(r.ID), "x_m": round(r.x_m), "y_m": round(r.y_m), "elev_m": r.elev_m, "rel_m": r.elev_m - centre} for r in s.itertuples()],
  "limit": "SRTM pixels are ~30 m and heights are whole metres with a vertical error of a few metres. This shows the gentle tilt of the area; it cannot show a dip, a stony edge or weak margins inside one plot."
}
json.dump(out, open("terrain.json", "w"), indent=1)
print(json.dumps({k: out[k] for k in ("n_points", "n_pixels", "extent_m", "elev_min_m", "elev_max_m", "elev_range_m", "tilt")}, indent=1))
