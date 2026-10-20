"""Modelos procedurales de los prototipos de HarvestT para la demo (mm, Z arriba).

Son representaciones ilustrativas a partir de fotos y láminas del equipo, no planos de fabricación.
Cada función devuelve (Mesh, hotspots) con los puntos en las mismas coordenadas crudas del STL.
"""
import math

from scripts.demo.mesh import (
    ACRYLIC, ALUMINUM, DARK, FOIL, LEAF, LEAF_DARK, LED_PINK, LIME, PCB, PRINTED, SOIL, SOLAR, STEEL, STRUT,
    TERRACOTTA, WHITE, Mesh,
)

Hotspot = dict  # {"label", "description", "x", "y", "z"}


def _hs(label: str, x: float, y: float, z: float, description: str = "") -> Hotspot:
    return {"label": label, "description": description, "x": round(x, 2), "y": round(y, 2), "z": round(z, 2)}


# ---------------------------------------------------------------- Cultivador delta


def delta_grower() -> tuple[Mesh, list[Hotspot]]:
    """Gabinete prismático de aluminio con robot delta, visión por computadora y LED de fotoperiodo."""
    m = Mesh()
    half, post, top = 200.0, 15.0, 940.0

    m.color = WHITE
    m.box(-half - 10, -half - 10, 0, half + 10, half + 10, 40)          # base aislante
    m.color = ACRYLIC
    m.box(-180, -180, 40, 180, 180, 48)                                 # placa de acrílico inferior
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * (half - post), sy * (half - post)
            m.color = ALUMINUM
            m.box(cx - post, cy - post, 40, cx + post, cy + post, top)   # postes de aluminio
            m.color = PRINTED
            m.box_c(sx * 150, sy * 150, 56, 50, 30, 16)                  # soportes impresos de la base
    m.color = ALUMINUM
    for s in (-1, 1):
        m.box(-half, s * (half - post) - post, top - 40, half, s * (half - post) + post, top)  # marco superior X
        m.box(s * (half - post) - post, -half, top - 40, s * (half - post) + post, half, top)  # marco superior Y
        m.box(-half, s * (half - post) - post, 60, half, s * (half - post) + post, 90)          # marco inferior X
    m.color = ACRYLIC
    m.box(-half - 5, -half - 5, top, half + 5, half + 5, top + 8)       # placa superior de acrílico
    m.color = DARK
    m.box_c(0, 40, top + 40, 90, 70, 70)                                # motor y alimentador superior

    # Pared trasera reflectante con pliegues (papel aluminio)
    m.color = FOIL
    for i in range(12):
        x0 = -180 + i * 30
        depth = 6 if i % 2 else 0
        m.box(x0, 172 - depth, 48, x0 + 30, 178 - depth, top - 40)

    # Torres del delta: varilla + correa + carro, a 120° entre sí
    towers = [math.radians(a) for a in (90, 210, 330)]
    carriage_z, effector_z = 770.0, 470.0
    for a in towers:
        tx, ty = 150 * math.cos(a), 150 * math.sin(a)
        m.color = STEEL
        m.rod((tx, ty, 48), (tx, ty, top - 40), 5, n=10)
        m.color = DARK
        m.box_c(tx * 1.08, ty * 1.08, (48 + top - 40) / 2, 8, 8, top - 100)
        m.color = PRINTED
        m.box_c(tx, ty, carriage_z, 46, 46, 50)

    # Efector con cámara y sondas, unido por pares de brazos
    m.color = PRINTED
    m.cylinder(0, 0, effector_z - 8, effector_z + 8, 48, n=40)
    m.color = DARK
    for a in towers:
        tx, ty = 150 * math.cos(a), 150 * math.sin(a)
        ex, ey = 42 * math.cos(a), 42 * math.sin(a)
        px, py = -math.sin(a) * 16, math.cos(a) * 16
        for s in (-1, 1):
            m.rod((tx * 0.88 + s * px, ty * 0.88 + s * py, carriage_z - 20), (ex + s * px, ey + s * py, effector_z), 3.5, n=8)
    m.color = PCB
    m.box_c(0, -10, effector_z - 18, 30, 30, 14)                        # módulo de cámara
    m.color = DARK
    m.cylinder(0, -10, effector_z - 32, effector_z - 25, 7, n=20)       # lente
    m.color = STEEL
    for s in (-1, 1):
        m.rod((s * 18, 22, effector_z - 10), (s * 18, 22, effector_z - 90), 3, n=8)  # sondas de humedad
    m.color = PCB
    m.box(-55, 150, 600, 55, 170, 668)                                  # Raspberry Pi en la pared trasera
    m.box(-40, 146, 615, 10, 150, 640)
    m.box(-170, -170, 48, -60, -110, 62)                                # electrónica de potencia
    m.color = LED_PINK
    for s in (-1, 1):
        m.box(-180, s * 178 - 6, top - 52, 180, s * 178 + 6, top - 44)  # tiras LED de fotoperiodo

    # Maceta con sustrato y planta
    m.color = TERRACOTTA
    m.tube(0, 0, 48, 230, 100, 90, n=64)
    m.color = SOIL
    m.cylinder(0, 0, 48, 210, 90, n=64)
    m.color = LEAF_DARK
    m.rod((0, 0, 210), (0, 0, 330), 4, n=10)
    m.color = LEAF
    for k in range(7):
        a = k * 2.4
        h = 230 + k * 14
        m.leaf((0, 0, h), a, 70 - k * 4, 38 - k * 2, math.radians(20 - k * 4))

    hotspots = [
        _hs("Robot delta", 150 * math.cos(towers[1]), 150 * math.sin(towers[1]), carriage_z + 25,
            "Tres brazos articulados posicionan el cabezal sobre el cultivo"),
        _hs("Cámara de visión", 0, -25, effector_z - 18, "Visión por computadora en el efector final"),
        _hs("Sensores de humedad", 18, 22, effector_z - 90, "Sondas que bajan al sustrato"),
        _hs("Raspberry Pi", 0, 150, 640, "Procesamiento y control de variables"),
        _hs("LED de fotoperiodo", 0, -184, top - 48, "Iluminación cenital para controlar el fotoperiodo"),
        _hs("Pared reflectante", -120, 172, 420, "Recubrimiento tipo aluminio que distribuye la luz"),
        _hs("Chasis de aluminio", half, -half, 500, "Estructura prismática con paredes transparentes"),
        _hs("Maceta y planta", 100, 0, 150, "Temperatura, humedad y crecimiento monitoreados con IA y lógica difusa"),
    ]
    return m, hotspots


# ---------------------------------------------------------------- Invernadero geodésico


def _icosphere(freq: int) -> tuple[list[tuple[float, float, float]], set[tuple[int, int]]]:
    """Vértices unitarios y aristas de un icosaedro subdividido `freq` veces por arista, con un polo en +Z."""
    z = 1 / math.sqrt(5)
    r = 2 / math.sqrt(5)
    base = [(0.0, 0.0, 1.0)]
    base += [(r * math.cos(2 * math.pi * i / 5), r * math.sin(2 * math.pi * i / 5), z) for i in range(5)]
    base += [(r * math.cos(2 * math.pi * (i + 0.5) / 5), r * math.sin(2 * math.pi * (i + 0.5) / 5), -z) for i in range(5)]
    base.append((0.0, 0.0, -1.0))
    faces = []
    for i in range(5):
        j = (i + 1) % 5
        faces += [(0, 1 + i, 1 + j), (1 + i, 6 + i, 1 + j), (1 + j, 6 + i, 6 + j), (11, 6 + j, 6 + i)]

    verts: list[tuple[float, float, float]] = []
    index: dict[tuple[int, int, int], int] = {}

    def vid(p: tuple[float, float, float]) -> int:
        n = math.sqrt(sum(c * c for c in p))
        q = (p[0] / n, p[1] / n, p[2] / n)
        key = tuple(round(c * 1e6) for c in q)
        if key not in index:
            index[key] = len(verts)
            verts.append(q)
        return index[key]

    edges: set[tuple[int, int]] = set()
    for a, b, c in faces:
        A, B, C = base[a], base[b], base[c]
        grid: dict[tuple[int, int], int] = {}
        for i in range(freq + 1):
            for j in range(freq + 1 - i):
                k = freq - i - j
                p = tuple((A[t] * k + B[t] * i + C[t] * j) / freq for t in range(3))
                grid[(i, j)] = vid(p)
        for i in range(freq + 1):
            for j in range(freq + 1 - i):
                for di, dj in ((1, 0), (0, 1), (-1, 1)):
                    if (i + di, j + dj) in grid:
                        e = tuple(sorted((grid[(i, j)], grid[(i + di, j + dj)])))
                        edges.add(e)  # type: ignore[arg-type]
    return verts, edges


def geodesic_greenhouse() -> tuple[Mesh, list[Hotspot]]:
    """Invernadero geodésico modular y desplegable con columna instrumental y colector solar en sombrilla."""
    m = Mesh()
    R, base_top = 1500.0, 350.0

    m.color = WHITE
    m.tube(0, 0, 0, base_top, 1580, 1460, n=96)                # jardinera perimetral
    m.color = SOIL
    m.cylinder(0, 0, 0, base_top - 40, 1460, n=96)             # tierra fértil
    m.color = STRUT
    m.tube(0, 0, base_top - 20, base_top + 20, 1600, 1500, n=96)  # anillo de anclaje del domo

    verts, edges = _icosphere(4)
    pts = [(v[0] * R, v[1] * R, base_top + v[2] * R) for v in verts]
    upper = {i for i, v in enumerate(verts) if v[2] > -1e-3}
    for a, b in edges:
        if a in upper and b in upper:
            m.rod(pts[a], pts[b], 16, n=8, caps=False)          # puntales de kevlar
    for i in upper:
        m.sphere(pts[i], 30, n=10, m=6)                          # nodos

    # Columna central con módulo de instrumentos
    m.color = DARK
    m.cylinder(0, 0, base_top - 40, 2450, 110, n=32)
    m.color = STEEL
    m.cylinder(0, 0, 1850, 2120, 280, n=48)
    m.cylinder(0, 0, 2120, 2260, 200, n=48)
    m.color = DARK
    m.box_c(300, 0, 1990, 80, 140, 120)                          # espectrómetro APXS
    m.box_c(-300, 0, 1990, 80, 140, 120)                         # detector RAD
    m.cylinder(0, -290, 1940, 2040, 45, n=20)                    # albedo de neutrones DAN
    m.rod((0, 0, 2260), (0, 0, 2520), 30, n=16)

    # Colector solar tipo sombrilla: pétalos inclinados con costillas
    hub, n_petals, rim, droop = 2500.0, 16, 950.0, 260.0
    for k in range(n_petals):
        a0 = 2 * math.pi * k / n_petals
        a1 = a0 + 2 * math.pi / n_petals * 0.86
        am = (a0 + a1) / 2
        p_hub = (90 * math.cos(am), 90 * math.sin(am), hub)
        e0 = (rim * math.cos(a0), rim * math.sin(a0), hub - droop)
        e1 = (rim * math.cos(a1), rim * math.sin(a1), hub - droop)
        m.color = SOLAR
        m.tri(p_hub, e0, e1)
        m.tri(p_hub, e1, e0)                                     # dos caras: se ve desde arriba y abajo
        m.color = DARK
        m.rod(p_hub, (rim * 1.02 * math.cos(am), rim * 1.02 * math.sin(am), hub - droop - 10), 9, n=6)

    # Riego automático: anillo de tubería con goteros
    m.color = LIME
    seg = 72
    ring_r, ring_z = 1300.0, base_top - 20
    for k in range(seg):
        a0, a1 = 2 * math.pi * k / seg, 2 * math.pi * (k + 1) / seg
        m.rod((ring_r * math.cos(a0), ring_r * math.sin(a0), ring_z), (ring_r * math.cos(a1), ring_r * math.sin(a1), ring_z), 14, n=8, caps=False)

    # Cultivos ilustrativos dentro del domo
    for k in range(14):
        a = k * 2.399
        rr = 380 + (k * 173) % 800
        x, y = rr * math.cos(a), rr * math.sin(a)
        h = 160 + (k * 37) % 220
        m.color = LEAF_DARK
        m.rod((x, y, base_top - 40), (x, y, base_top - 40 + h), 10, n=6)
        m.color = LEAF if k % 2 else LEAF_DARK
        m.ellipsoid((x, y, base_top - 40 + h), 120 + (k % 3) * 30, 110, 90, n=14, m=8)

    front = math.radians(-90)
    node = max(upper, key=lambda i: (verts[i][2] < 0.55) * (-verts[i][1]) + (verts[i][2] < 0.55) * verts[i][2] * 0.3)
    return m, [
        _hs("Estructura de kevlar", *pts[node], description="Domo geodésico ligero y resistente"),
        _hs("Placas traslúcidas", R * 0.62 * math.cos(math.radians(-60)), R * 0.62 * math.sin(math.radians(-60)), base_top + R * 0.78,
            "Matrices termoestables epoxi"),
        _hs("Celdas fotovoltaicas", rim * math.cos(front), rim * math.sin(front), hub - droop, "Colector en sombrilla: energía limpia"),
        _hs("Espectrómetro APXS", 340, 0, 1990, "Espectrometría de rayos X por partículas alfa"),
        _hs("Detector RAD", -340, 0, 1990, "Evaluación de radiación"),
        _hs("Albedo de neutrones (DAN)", 0, -335, 1990, "Composición del suelo circundante"),
        _hs("Riego automático", ring_r * math.cos(front), ring_r * math.sin(front), ring_z, "Sistema automático de irrigación"),
        _hs("Tierra fértil 2 m³", 1580 * math.cos(math.radians(-120)), 1580 * math.sin(math.radians(-120)), base_top * 0.5,
            "Hasta 4 clases de plantas y vegetales"),
    ]


# ---------------------------------------------------------------- Germinador de escritorio


def germinator() -> tuple[Mesh, list[Hotspot]]:
    m = Mesh(WHITE)
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 2
        m.cylinder(65 * math.cos(a), 65 * math.sin(a), -10, 0, 9, n=24)
    m.frustum(0, 0, 0, 60, 96, 90, n=72)
    m.color = LIME
    m.cylinder(0, 0, 60, 70, 92, n=72)
    m.color = ACRYLIC
    m.dome(0, 0, 70, 84)
    m.color = LED_PINK
    m.cylinder(0, 0, 150, 160, 30, n=48)
    m.color = DARK
    m.box(-28, -104, 12, 28, -90, 44)
    m.box(-12, 88, 20, 12, 104, 50)
    return m, [
        _hs("LED espectro completo", 0, 0, 160, "Módulo de iluminación superior"),
        _hs("Sensor de humedad", 0, -64.3, 124, "Dentro del domo"),
        _hs("Panel de control", 0, -104, 28, "Pantalla y botones"),
        _hs("Bandeja de germinación", 79.7, -46, 65),
        _hs("Bomba de riego", 0, 104, 35, "Recircula el agua"),
    ]


MODELS = {"delta": delta_grower, "geodesico": geodesic_greenhouse, "germinador": germinator}
