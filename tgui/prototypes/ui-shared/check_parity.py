"""Dependency-free source parity checks; not a browser or visual test."""

from pathlib import Path
import re


HERE = Path(__file__).resolve().parent


def rules(path):
    css = re.sub(r"/\*.*?\*/", "", path.read_text(), flags=re.S)
    result = {}
    for selectors, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
        declarations = {}
        for declaration in body.split(";"):
            if declaration.strip():
                name, value = declaration.split(":", 1)
                declarations[name.strip()] = " ".join(value.split())
        for selector in selectors.split(","):
            result.setdefault(selector.strip(), {}).update(declarations)
    return css, result


_, source = rules(HERE.parent / "crafting-workbench/workbench.css")
shared = {}
for filename in ("tokens.css", "controls.css"):
    css, parsed = rules(HERE / filename)
    assert "url(" not in css and "@import" not in css and "@font-face" not in css
    assert parsed, filename
    for selector, declarations in parsed.items():
        assert selector == ".TithewoodSurface" or selector.startswith(
            ".TithewoodSurface "
        ), selector
        shared.setdefault(selector, {}).update(declarations)


def same(original, candidate, *properties):
    for prop in properties:
        expected = source[original][prop].replace("--wb-", "--tw-")
        assert shared[candidate][prop] == expected, (candidate, prop, expected)


palette = {key.replace("--wb-", "--tw-"): value
           for key, value in source[".Workbench"].items() if key.startswith("--wb-")}
assert palette == {key: value for key, value in shared[".TithewoodSurface"].items()
                   if key.startswith("--tw-")}
same(".Workbench", ".TithewoodSurface", "color", "background", "font", "color-scheme")
same(".Workbench h1", ".TithewoodSurface .TithewoodHeading", "color", "font", "margin")
same(".Workbench__intro", ".TithewoodSurface .TithewoodMuted", "color", "font-size")
for element in ("button", "input", "select"):
    target = f".TithewoodSurface {element}.TithewoodControl"
    same(".Workbench button", target, "font", "min-height", "border", "border-radius",
         "color", "background")
same(".Workbench button", ".TithewoodSurface button.TithewoodControl", "padding", "cursor")
same(".Workbench__search input", ".TithewoodSurface input.TithewoodControl", "min-width", "padding")
same(".Workbench__category select", ".TithewoodSurface select.TithewoodControl", "padding")
same(".Workbench__search input::placeholder", ".TithewoodSurface input.TithewoodControl::placeholder",
     "color", "opacity")
for state in ("hover", "active"):
    same(f".Workbench button:{state}:not(:disabled)",
         f".TithewoodSurface button.TithewoodControl:{state}:not(:disabled)",
         "background", "border-color")
same(".Workbench button:disabled", ".TithewoodSurface .TithewoodControl:disabled", "opacity", "cursor")
same(".Workbench :focus-visible", ".TithewoodSurface :focus-visible", "outline", "outline-offset")
print("PASS: scoped palette, typography, controls and interaction source values match.")
