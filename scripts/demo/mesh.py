"""Primitivas mínimas para generar mallas STL binarias de demostración (mm, Z arriba).

Sin dependencias: solo math y struct. Las piezas se acumulan como triángulos en un Mesh
y se escriben como un único STL binario.
"""
import math
import struct

Vec = tuple[float, float, float]


def _sub(a: Vec, b: Vec) -> Vec:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a: Vec, b: Vec) -> Vec:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _scale(a: Vec, s: float) -> Vec:
    return (a[0] * s, a[1] * s, a[2] * s)


def _cross(a: Vec, b: Vec) -> Vec:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _norm(a: Vec) -> Vec:
    n = math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) or 1.0
    return (a[0] / n, a[1] / n, a[2] / n)


def _basis(axis: Vec) -> tuple[Vec, Vec]:
    """Dos vectores unitarios perpendiculares a `axis` y entre sí."""
    helper = (0.0, 0.0, 1.0) if abs(axis[2]) < 0.9 else (1.0, 0.0, 0.0)
    u = _norm(_cross(axis, helper))
    return u, _cross(axis, u)


Color = tuple[int, int, int]

# Paleta de materiales (sRGB 0-255)
ALUMINUM: Color = (196, 201, 204)
DARK: Color = (52, 56, 58)
PRINTED: Color = (236, 196, 52)
ACRYLIC: Color = (214, 232, 236)
FOIL: Color = (222, 224, 226)
LEAF: Color = (92, 156, 64)
LEAF_DARK: Color = (58, 118, 46)
SOIL: Color = (96, 70, 48)
TERRACOTTA: Color = (176, 98, 62)
PCB: Color = (36, 128, 72)
LED_PINK: Color = (236, 92, 196)
WHITE: Color = (238, 240, 236)
STRUT: Color = (88, 98, 118)
SOLAR: Color = (232, 128, 44)
STEEL: Color = (150, 156, 164)
LIME: Color = (166, 226, 46)


class Mesh:
    """Triángulos con color por cara (formato STL binario con encabezado COLOR=, el que lee three)."""

    def __init__(self, color: Color = WHITE) -> None:
        self.tris: list[tuple[Vec, Vec, Vec]] = []
        self.colors: list[Color] = []
        self.color: Color = color

    def tri(self, a: Vec, b: Vec, c: Vec) -> None:
        self.tris.append((a, b, c))
        self.colors.append(self.color)

    def quad(self, a: Vec, b: Vec, c: Vec, d: Vec) -> None:
        self.tri(a, b, c)
        self.tri(a, c, d)

    def box(self, x0: float, y0: float, z0: float, x1: float, y1: float, z1: float) -> None:
        p = lambda x, y, z: (x, y, z)  # noqa: E731
        self.quad(p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), p(x1, y0, z0))
        self.quad(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1))
        self.quad(p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1))
        self.quad(p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0))
        self.quad(p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0))
        self.quad(p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1))

    def box_c(self, cx: float, cy: float, cz: float, sx: float, sy: float, sz: float) -> None:
        self.box(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2)

    def rod(self, p0: Vec, p1: Vec, r: float, n: int = 12, caps: bool = True) -> None:
        """Cilindro entre dos puntos cualesquiera."""
        axis = _norm(_sub(p1, p0))
        u, v = _basis(axis)
        ring = lambda c, i: _add(c, _add(_scale(u, r * math.cos(2 * math.pi * i / n)), _scale(v, r * math.sin(2 * math.pi * i / n))))  # noqa: E731
        for i in range(n):
            a0, a1, b0, b1 = ring(p0, i), ring(p0, i + 1), ring(p1, i), ring(p1, i + 1)
            self.quad(a0, a1, b1, b0)
            if caps:
                self.tri(p0, a1, a0)
                self.tri(p1, b0, b1)

    def frustum(self, cx: float, cy: float, z0: float, z1: float, r0: float, r1: float, n: int = 48, caps: bool = True) -> None:
        p = lambda r, a, z: (cx + r * math.cos(a), cy + r * math.sin(a), z)  # noqa: E731
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            self.quad(p(r0, a0, z0), p(r0, a1, z0), p(r1, a1, z1), p(r1, a0, z1))
            if caps:
                self.tri((cx, cy, z0), p(r0, a1, z0), p(r0, a0, z0))
                self.tri((cx, cy, z1), p(r1, a0, z1), p(r1, a1, z1))

    def cylinder(self, cx: float, cy: float, z0: float, z1: float, r: float, n: int = 48) -> None:
        self.frustum(cx, cy, z0, z1, r, r, n)

    def tube(self, cx: float, cy: float, z0: float, z1: float, r_out: float, r_in: float, n: int = 64) -> None:
        """Anillo con espesor (maceta, aro, base)."""
        p = lambda r, a, z: (cx + r * math.cos(a), cy + r * math.sin(a), z)  # noqa: E731
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            self.quad(p(r_out, a0, z0), p(r_out, a1, z0), p(r_out, a1, z1), p(r_out, a0, z1))
            self.quad(p(r_in, a1, z0), p(r_in, a0, z0), p(r_in, a0, z1), p(r_in, a1, z1))
            self.quad(p(r_in, a0, z1), p(r_out, a0, z1), p(r_out, a1, z1), p(r_in, a1, z1))
            self.quad(p(r_in, a1, z0), p(r_out, a1, z0), p(r_out, a0, z0), p(r_in, a0, z0))

    def ellipsoid(self, c: Vec, rx: float, ry: float, rz: float, n: int = 20, m: int = 12, rot_z: float = 0.0, tilt: float = 0.0) -> None:
        """Elipsoide, opcionalmente girado en Z e inclinado sobre su eje X local (hojas)."""
        def pt(i: int, j: int) -> Vec:
            th = 2 * math.pi * i / n
            ph = math.pi * j / m - math.pi / 2
            x, y, z = rx * math.cos(ph) * math.cos(th), ry * math.cos(ph) * math.sin(th), rz * math.sin(ph)
            y, z = y * math.cos(tilt) - z * math.sin(tilt), y * math.sin(tilt) + z * math.cos(tilt)
            x, y = x * math.cos(rot_z) - y * math.sin(rot_z), x * math.sin(rot_z) + y * math.cos(rot_z)
            return (c[0] + x, c[1] + y, c[2] + z)

        for i in range(n):
            for j in range(m):
                a, b, cc, d = pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)
                if j > 0:
                    self.tri(a, b, cc)
                if j < m - 1:
                    self.tri(a, cc, d)

    def dome(self, cx: float, cy: float, z0: float, r: float, n: int = 72, m: int = 24) -> None:
        """Hemisferio superior con base cerrada."""
        p = lambda i, j: (cx + r * math.cos(math.pi / 2 * j / m) * math.cos(2 * math.pi * i / n),  # noqa: E731
                          cy + r * math.cos(math.pi / 2 * j / m) * math.sin(2 * math.pi * i / n),
                          z0 + r * math.sin(math.pi / 2 * j / m))
        for i in range(n):
            for j in range(m):
                self.tri(p(i, j), p(i + 1, j), p(i + 1, j + 1))
                if j < m - 1:
                    self.tri(p(i, j), p(i + 1, j + 1), p(i, j + 1))
            self.tri((cx, cy, z0), p(i + 1, 0), p(i, 0))

    def sphere(self, c: Vec, r: float, n: int = 16, m: int = 10) -> None:
        self.ellipsoid(c, r, r, r, n, m)

    def leaf(self, base: Vec, angle: float, length: float, width: float, droop: float) -> None:
        """Hoja: elipsoide plano que sale de `base` en dirección `angle` y cae `droop` radianes."""
        cx = base[0] + math.cos(angle) * length / 2 * math.cos(droop)
        cy = base[1] + math.sin(angle) * length / 2 * math.cos(droop)
        cz = base[2] + length / 2 * math.sin(droop)
        self.ellipsoid((cx, cy, cz), length / 2, width / 2, width / 10, n=16, m=8, rot_z=angle, tilt=0.0)

    def save(self, path: str) -> int:
        # "COLOR=" + RGBA por defecto; cada cara lleva su color en 5 bits por canal (bit 15 en 0 = color válido).
        header = b"HarvestT demo COLOR=" + bytes((238, 240, 236, 255))
        out = bytearray(header.ljust(80, b"\0"))
        out += struct.pack("<I", len(self.tris))
        for (a, b, c), (r, g, bl) in zip(self.tris, self.colors):
            nrm = _norm(_cross(_sub(b, a), _sub(c, a)))
            packed = (r * 31 // 255) | ((g * 31 // 255) << 5) | ((bl * 31 // 255) << 10)
            out += struct.pack("<3f", *nrm) + struct.pack("<3f", *a) + struct.pack("<3f", *b) + struct.pack("<3f", *c)
            out += struct.pack("<H", packed)
        with open(path, "wb") as fh:
            fh.write(out)
        return len(self.tris)
