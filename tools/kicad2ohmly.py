#!/usr/bin/env python3
"""Convert a KiCad 10 board (.kicad_pcb) into the JSON the Teardown view draws.

Usage:  python3 -I tools/kicad2ohmly.py BOARD.kicad_pcb data/ull-pocket.json

Stdlib only. The board file is read as data: nothing in its folder is run.
Coordinates are millimetres from the board's top-left corner (KiCad's
origin of the Edge.Cuts bounding box), y down, rounded to 0.01 mm.
Angles are degrees counter-clockwise as seen from the front, as in KiCad.

Output schema (keys kept short; the file is fetched by the browser):
  meta     title, rev, date, w, h, layers [copper names, top to bottom], stackup [[name, type, mm]]
  nets     [name, ...]; index 0 is "" (no net). Everything else refers to nets by index.
  outline  [[x,y, x,y, ...], ...] closed Edge.Cuts loops, arcs flattened
  holes    [[x, y, d], ...] non-plated holes
  fp       [{ref, val, x, y, r, side, bb:[x0,y0,x1,y1], pads, silk:[x,y,a,size] | absent,
             mpn, lcsc, mfr, desc}]   bb boxes the fab outline (or courtyard) and pads, in board coords
           pads: [num, shape, x, y, w, h, angle, net, side, extra]
             shape r rect, rr roundrect (extra = corner ratio), c circle, o oval,
             p polygon (extra = [x,y, ...] absolute points); side F, B or * (through-hole)
  tracks   {layer: [[x1,y1,x2,y2,width,net], ...]}  arcs are split into short segments
  vias     [[x, y, size, drill, net], ...]
  zones    {layer: [[net, [x,y, ...]], ...]}       filled copper, simplified
  rules    [{name, layers, pts:[x,y,...]}]           keep-out rule areas
  silk     {F: {lines: [[x1,y1,x2,y2], ...], text: [[str, x, y, angle, size], ...]}, B: {...}}
"""
import json
import math
import re
import sys

ROUND = 2          # decimals: 0.01 mm
ZONE_TOL = 0.04    # Douglas-Peucker tolerance for zone fills, mm
ARC_STEP = 8.0     # degrees per segment when flattening arcs
COPPER = ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"]


# ---------- s-expression parser ----------
TOKEN = re.compile(r'\s*(?:(\()|(\))|"((?:[^"\\]|\\.)*)"|([^\s()"]+))', re.S)


def parse(text):
    """Return the nested list for the first s-expression in text. Strings stay str; bare atoms stay str."""
    stack, cur = [], []
    pos, n = 0, len(text)
    while pos < n:
        m = TOKEN.match(text, pos)
        if not m:
            break
        pos = m.end()
        if m.group(1):
            stack.append(cur)
            cur = []
        elif m.group(2):
            done = cur
            cur = stack.pop()
            cur.append(done)
        elif m.group(3) is not None:
            cur.append(Q(m.group(3).replace('\\"', '"').replace("\\\\", "\\")))
        else:
            cur.append(m.group(4))
    return cur[0]


class Q(str):
    """A quoted string, so names like "1" are not mistaken for numbers."""


def kids(node, name):
    return [c for c in node[1:] if isinstance(c, list) and c and c[0] == name]


def kid(node, name):
    for c in node[1:]:
        if isinstance(c, list) and c and c[0] == name:
            return c
    return None


def val(node, name, default=None):
    k = kid(node, name)
    return k[1] if k and len(k) > 1 else default


def num(node, name, i=1, default=0.0):
    k = kid(node, name)
    return float(k[i]) if k and len(k) > i else default


def xy(node, name):
    k = kid(node, name)
    return (float(k[1]), float(k[2])) if k else None


def pts(node):
    p = kid(node, "pts")
    return [(float(c[1]), float(c[2])) for c in (p or [])[1:] if isinstance(c, list) and c[0] == "xy"]


def layers_of(node):
    k = kid(node, "layers")
    if k:
        return [str(x) for x in k[1:]]
    k = kid(node, "layer")
    return [str(k[1])] if k else []


# ---------- geometry ----------
def rot(px, py, deg):
    """Rotate a point by deg, counter-clockwise as seen on screen (KiCad, y down)."""
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (px * c + py * s, -px * s + py * c)


def arc_points(a, m, b):
    """Points along the circle through start a, mid m, end b."""
    ax, ay = a
    bx, by = m
    cx, cy = b
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(d) < 1e-12:
        return [a, b]
    ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
    uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
    r = math.hypot(ax - ux, ay - uy)
    t0 = math.atan2(ay - uy, ax - ux)
    t1 = math.atan2(by - uy, bx - ux)
    t2 = math.atan2(cy - uy, cx - ux)

    def norm(t):
        return t % (2 * math.pi)

    # sweep from t0 to t2 in the direction that passes t1
    ccw = norm(t1 - t0) < norm(t2 - t0)
    sweep = norm(t2 - t0) if ccw else -norm(t0 - t2)
    n = max(2, int(abs(math.degrees(sweep)) / ARC_STEP) + 1)
    return [(ux + r * math.cos(t0 + sweep * i / n), uy + r * math.sin(t0 + sweep * i / n)) for i in range(n + 1)]


def circle_points(c, r, n=24):
    return [(c[0] + r * math.cos(2 * math.pi * i / n), c[1] + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def rdp(points, tol):
    """Douglas-Peucker on an open polyline."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = points[i]
        bx, by = points[j]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-12
        best, bi = -1.0, -1
        for k in range(i + 1, j):
            px, py = points[k]
            dist = abs(dx * (ay - py) - dy * (ax - px)) / L
            if dist > best:
                best, bi = dist, k
        if best > tol:
            keep[bi] = True
            stack.append((i, bi))
            stack.append((bi, j))
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(points, tol):
    if len(points) < 4:
        return points
    # split the ring at its farthest point from the start so both halves are open polylines
    far = max(range(len(points)), key=lambda k: (points[k][0] - points[0][0]) ** 2 + (points[k][1] - points[0][1]) ** 2)
    a = rdp(points[:far + 1], tol)
    b = rdp(points[far:] + [points[0]], tol)
    return a[:-1] + b[:-1]


def ring_area(points):
    s = 0.0
    for i in range(len(points)):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % len(points)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def chain(segments, eps=0.01):
    """Join open polylines into closed loops by matching end points."""
    segs = [list(s) for s in segments]
    loops = []
    while segs:
        cur = segs.pop(0)
        grown = True
        while grown and math.dist(cur[0], cur[-1]) > eps:
            grown = False
            for i, s in enumerate(segs):
                if math.dist(cur[-1], s[0]) <= eps:
                    cur += s[1:]
                elif math.dist(cur[-1], s[-1]) <= eps:
                    cur += s[::-1][1:]
                elif math.dist(cur[0], s[-1]) <= eps:
                    cur = s[:-1] + cur
                elif math.dist(cur[0], s[0]) <= eps:
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                grown = True
                break
        if math.dist(cur[0], cur[-1]) <= eps:
            cur = cur[:-1]
        loops.append(cur)
    return loops


def shape_points(g):
    """Return (points, closed) for a gr_/fp_ line, arc, circle, rect or poly, in its own coordinates."""
    t = g[0][3:]
    if t == "line":
        return [xy(g, "start"), xy(g, "end")], False
    if t == "arc":
        return arc_points(xy(g, "start"), xy(g, "mid"), xy(g, "end")), False
    if t == "circle":
        c, e = xy(g, "center"), xy(g, "end")
        return circle_points(c, math.dist(c, e)), True
    if t == "rect":
        (x0, y0), (x1, y1) = xy(g, "start"), xy(g, "end")
        return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], True
    if t == "poly":
        return pts(g), True
    return [], False


# ---------- conversion ----------
def convert(board):
    R = lambda v: round(v, ROUND)

    # nets: KiCad 10 names nets inline; collect every name in order of first use
    nets = [""]
    net_ix = {"": 0}

    def N(node):
        k = kid(node, "net")
        if not k:
            return 0
        name = str(k[-1]) if len(k) > 1 else ""
        if name not in net_ix:
            net_ix[name] = len(nets)
            nets.append(name)
        return net_ix[name]

    # outline first: it sets the origin
    edge = []
    for g in board[1:]:
        if isinstance(g, list) and g and str(g[0]).startswith("gr_") and "Edge.Cuts" in layers_of(g):
            p, closed = shape_points(g)
            edge.append(p + [p[0]] if closed else p)
    loops = chain(edge)
    allp = [p for lp in loops for p in lp]
    ox, oy = min(p[0] for p in allp), min(p[1] for p in allp)
    W, H = max(p[0] for p in allp) - ox, max(p[1] for p in allp) - oy
    loops.sort(key=ring_area, reverse=True)
    T = lambda p: (p[0] - ox, p[1] - oy)
    flat = lambda ps: [R(c) for p in ps for c in T(p)]

    tb = kid(board, "title_block")
    meta = {"title": str(val(tb, "title", "")), "rev": str(val(tb, "rev", "")), "date": str(val(tb, "date", "")),
            "w": R(W), "h": R(H), "layers": COPPER, "stackup": []}
    su = kid(kid(board, "setup") or [], "stackup")
    for L in kids(su or [], "layer"):
        meta["stackup"].append([str(L[1]), str(val(L, "type", "")), R(num(L, "thickness")) if kid(L, "thickness") else 0,
                                str(val(L, "material", ""))])
        # keep three decimals for thin copper and prepreg
        if kid(L, "thickness"):
            meta["stackup"][-1][2] = round(num(L, "thickness"), 4)

    out = {"meta": meta, "nets": nets, "outline": [flat(lp) for lp in loops], "holes": [], "fp": [],
           "tracks": {L: [] for L in COPPER}, "vias": [], "zones": {L: [] for L in COPPER}, "rules": [],
           "silk": {"F": {"lines": [], "text": []}, "B": {"lines": [], "text": []}}}

    def silk_add(side, ps, closed):
        if closed:
            ps = ps + [ps[0]]
        for a, b in zip(ps, ps[1:]):
            (x1, y1), (x2, y2) = T(a), T(b)
            out["silk"][side]["lines"].append([R(x1), R(y1), R(x2), R(y2)])

    def side_of(layers):
        f = any(L.startswith("F.") or L == "*.Cu" for L in layers)
        b = any(L.startswith("B.") or L == "*.Cu" for L in layers)
        return "*" if (f and b) else "F" if f else "B" if b else "F"

    # ---- footprints
    for fp in kids(board, "footprint"):
        at = kid(fp, "at")
        fx, fy = float(at[1]), float(at[2])
        fa = float(at[3]) if len(at) > 3 else 0.0
        fside = "B" if str(val(fp, "layer")) == "B.Cu" else "F"
        props = {str(p[1]): str(p[2]) for p in kids(fp, "property")}
        ref = props.get("Reference", "?")
        place = lambda lx, ly: (fx + rot(lx, ly, fa)[0], fy + rot(lx, ly, fa)[1])
        boxes = {"CrtYd": [], "Fab": [], "Pad": []}
        for g in fp[1:]:
            if not (isinstance(g, list) and g and str(g[0]).startswith("fp_") and g[0] != "fp_text"):
                continue
            ls = layers_of(g)
            ps, closed = shape_points(g)
            if not ps:
                continue
            abs_ps = [place(*p) for p in ps]
            for L in ls:
                if L.endswith("CrtYd"):
                    boxes["CrtYd"] += abs_ps
                elif L.endswith("Fab"):
                    boxes["Fab"] += abs_ps
                elif L.endswith("SilkS"):
                    silk_add("B" if L.startswith("B") else "F", abs_ps, closed)
                elif L == "Edge.Cuts":
                    out["outline"].append(flat(abs_ps))
        pads = []
        for pd in kids(fp, "pad"):
            pnum, ptype, pshape = str(pd[1]), str(pd[2]), str(pd[3])
            pat = kid(pd, "at")
            lx, ly = float(pat[1]), float(pat[2])
            pa = float(pat[3]) if len(pat) > 3 else 0.0
            px, py = place(lx, ly)
            sz = kid(pd, "size")
            w, h = float(sz[1]), float(sz[2])
            dr = kid(pd, "drill")
            if ptype == "np_thru_hole":
                d = float(dr[1]) if dr and len(dr) > 1 and re.match(r"^[\d.]+$", str(dr[1])) else w
                tx, ty = T((px, py))
                out["holes"].append([R(tx), R(ty), R(d)])
                continue
            cu = [L for L in layers_of(pd) if L.endswith(".Cu")]
            if not cu:
                continue  # paste or mask aperture only
            side = side_of(cu)
            shape = {"rect": "r", "roundrect": "rr", "circle": "c", "oval": "o", "custom": "p", "trapezoid": "r"}.get(pshape, "r")
            extra = 0
            if shape == "rr":
                extra = R(num(pd, "roundrect_rratio"))
            if shape == "p":
                prim = kid(pd, "primitives")
                poly = kid(prim, "gr_poly") if prim else None
                if poly:
                    ring = [(px + rot(x, y, pa)[0], py + rot(x, y, pa)[1]) for x, y in pts(poly)]
                    extra = flat(ring)
                else:
                    shape = "r"
            tx, ty = T((px, py))
            pads.append([Q(pnum), shape, R(tx), R(ty), R(w), R(h), R(pa), N(pd), side, extra])
            hw, hh = w / 2, h / 2
            for cx, cy in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)):
                rx, ry = rot(cx, cy, pa)
                boxes["Pad"].append((px + rx, py + ry))
        # body box: fab outline plus pads; the courtyard only when there is no fab drawing
        # (a module's courtyard can include its whole antenna keep-out)
        src = (boxes["Fab"] or boxes["CrtYd"]) + boxes["Pad"] or [(fx, fy)]
        bb = [min(p[0] for p in src) - ox, min(p[1] for p in src) - oy, max(p[0] for p in src) - ox, max(p[1] for p in src) - oy]
        tx, ty = T((fx, fy))
        e = {"ref": ref, "val": props.get("Value", ""), "x": R(tx), "y": R(ty), "r": R(fa), "side": fside,
             "bb": [R(v) for v in bb], "pads": pads}
        # reference text, when it is printed on silkscreen
        rp = next((p for p in kids(fp, "property") if str(p[1]) == "Reference"), None)
        if rp and str(val(rp, "layer", "")).endswith("SilkS") and val(rp, "hide") != "yes":
            ra = kid(rp, "at")
            sx, sy = place(float(ra[1]), float(ra[2]))
            ta = float(ra[3]) if len(ra) > 3 else 0.0
            fs = kid(kid(rp, "effects") or [], "font")
            size = num(fs, "size", 2, 1.0) if fs else 1.0
            sx, sy = T((sx, sy))
            e["silk"] = [R(sx), R(sy), R(ta), R(size)]
        for k, pk in (("mpn", "MPN"), ("lcsc", "LCSC"), ("mfr", "Manufacturer"), ("desc", "Description")):
            v = props.get(pk) or (props.get("LCSC Part") if pk == "LCSC" else None)
            if v and v not in ("~", "-"):
                e[k] = v
        out["fp"].append(e)
        # footprint-level rule areas (the module's antenna keep-out); KiCad stores their points in board coordinates
        for z in kids(fp, "zone"):
            if kid(z, "keepout"):
                out["rules"].append({"name": ref + ":" + str(val(z, "name", "keepout")), "layers": layers_of(z),
                                     "pts": flat(pts(kid(z, "polygon")))})

    # ---- board graphics: silkscreen lines and text
    for g in board[1:]:
        if not (isinstance(g, list) and g and str(g[0]).startswith("gr_")):
            continue
        ls = layers_of(g)
        silk = [L for L in ls if L.endswith("SilkS")]
        if not silk:
            continue
        side = "B" if silk[0].startswith("B") else "F"
        if g[0] == "gr_text":
            a = kid(g, "at")
            tx, ty = T((float(a[1]), float(a[2])))
            fs = kid(kid(g, "effects") or [], "font")
            size = num(fs, "size", 2, 1.0) if fs else 1.0
            out["silk"][side]["text"].append([str(g[1]), R(tx), R(ty), R(float(a[3]) if len(a) > 3 else 0), R(size)])
        else:
            ps, closed = shape_points(g)
            if ps:
                silk_add(side, ps, closed)

    # ---- tracks, arcs, vias
    for s in kids(board, "segment"):
        L = str(val(s, "layer"))
        if L in out["tracks"]:
            (x1, y1), (x2, y2) = T(xy(s, "start")), T(xy(s, "end"))
            out["tracks"][L].append([R(x1), R(y1), R(x2), R(y2), R(num(s, "width")), N(s)])
    for s in kids(board, "arc"):
        L = str(val(s, "layer"))
        if L in out["tracks"]:
            ps = [T(p) for p in arc_points(xy(s, "start"), xy(s, "mid"), xy(s, "end"))]
            w, n = R(num(s, "width")), N(s)
            for a, b in zip(ps, ps[1:]):
                out["tracks"][L].append([R(a[0]), R(a[1]), R(b[0]), R(b[1]), w, n])
    for v in kids(board, "via"):
        x, y = T(xy(v, "at"))
        out["vias"].append([R(x), R(y), R(num(v, "size")), R(num(v, "drill")), N(v)])

    # ---- zones: filled copper, simplified; keep-out rule areas as outlines
    for z in kids(board, "zone"):
        if kid(z, "keepout"):
            out["rules"].append({"name": str(val(z, "name", "keepout")), "layers": layers_of(z),
                                 "pts": flat(pts(kid(z, "polygon")))})
            continue
        n = N(z)
        for fpoly in kids(z, "filled_polygon"):
            L = str(val(fpoly, "layer"))
            ring = pts(fpoly)
            if L not in out["zones"] or ring_area(ring) < 0.05:
                continue
            ring = simplify_ring(ring, ZONE_TOL)
            out["zones"][L].append([n, flat(ring)])
    return out


def main(argv):
    if len(argv) != 3:
        sys.stderr.write(__doc__.split("\n\n")[1] + "\n")
        return 2
    with open(argv[1], encoding="utf-8") as f:
        board = parse(f.read())
    if not board or board[0] != "kicad_pcb":
        sys.stderr.write("not a .kicad_pcb file\n")
        return 1
    out = convert(board)
    text = json.dumps(out, separators=(",", ":"), ensure_ascii=False)
    with open(argv[2], "w", encoding="utf-8") as f:
        f.write(text + "\n")
    z = sum(len(r[1]) // 2 for L in out["zones"].values() for r in L)
    t = sum(len(v) for v in out["tracks"].values())
    print(f"{argv[2]}: {len(text) / 1024:.0f} KB, {len(out['fp'])} footprints, {t} track segments, "
          f"{len(out['vias'])} vias, {z} zone points, {len(out['nets']) - 1} nets")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
