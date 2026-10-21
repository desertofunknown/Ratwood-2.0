"""Extract a bounded source-derived MiaCraft fixture, not a runtime payload.

Usage: python3 tools/extract-miacraft-workload.py /tmp/miacraft-fixture.json

Only roguetown.dme's explicit DM includes and the current top-level literal
recipe/skill declarations are supported. This is not a DM parser or compiler:
it does not evaluate macros, conditionals, interpolation, or runtime changes.
Ancestor overrides are merged; hidden, learned-only, and tech-gated recipes
are excluded. Include order approximates, but does not prove, runtime order.
"""

import argparse
import collections
import json
import pathlib
import re


def extract(root):
    includes = re.findall(
        r'^#include "([^\"]+\.dm)"',
        (root / 'roguetown.dme').read_text(),
        re.MULTILINE,
    )
    definitions = {}
    skills = {}
    for include in includes:
        path = root / include.replace('\\', '/')
        # Fail rather than silently shrink a fixture when the checkout is partial.
        # Some unrelated included files contain legacy-encoded comments. Keep
        # scanning; reject any replacement byte that reaches a recipe label.
        source = re.sub(
            r'/\*.*?\*/', '', path.read_text(errors='replace'), flags=re.DOTALL
        )
        recipe = skill = None
        for line in source.splitlines():
            if line.startswith('/'):
                match = re.match(
                    r'^(/datum/crafting_recipe(?:/\w+)*)/?\s*(?://.*)?$', line
                )
                recipe = match.group(1) if match else None
                if recipe:
                    definitions.setdefault(recipe, {})
                match = re.match(r'^(/datum/skill(?:/\w+)*)/?\s*(?://.*)?$', line)
                skill = match.group(1) if match else None
            elif recipe:
                match = re.match(
                    r'^\t(?:var/)?(name|always_availible|hides_from_crafting_menu|'
                    r'required_tech_node|skillcraft|parent_type)\s*=\s*(.*?)\s*'
                    r'(?://.*)?$',
                    line,
                )
                if match:
                    definitions[recipe][match.group(1)] = match.group(2)
            elif skill:
                match = re.match(r'^\tname\s*=\s*"(.*?)"', line)
                if match:
                    skills[skill] = match.group(1)

    def inherited(path):
        if not path.startswith('/datum/crafting_recipe'):
            return {}
        values = definitions.get(path, {})
        if 'parent_type' in values:
            raise ValueError(f'Unsupported explicit parent_type on {path}')
        return {**inherited(path.rsplit('/', 1)[0]), **values}

    def literal_string(value):
        if '\ufffd' in value:
            raise ValueError(f'Unsupported legacy encoding in recipe name: {value}')
        if not (value.startswith('"') and value.endswith('"')):
            raise ValueError(f'Unsupported nonliteral recipe name: {value}')
        return value[1:-1].replace('\\"', '"').replace('\\n', '\n')

    categories = collections.defaultdict(list)
    names = {}
    for path in definitions:
        if path == '/datum/crafting_recipe':
            continue
        values = inherited(path)
        for flag in ('hides_from_crafting_menu', 'always_availible'):
            if values.get(flag, 'FALSE') not in ('FALSE', 'TRUE'):
                raise ValueError(f'Unsupported nonliteral {flag} on {path}')
        if values.get('hides_from_crafting_menu', 'FALSE') != 'FALSE':
            continue
        if values.get('always_availible', 'FALSE') != 'TRUE':
            continue
        if values.get('required_tech_node', 'null') != 'null':
            continue
        name = literal_string(values.get('name', '""'))
        # ui_data includes an unnamed key; ui_static_data omits unnamed rows.
        names[name] = None
        if not name:
            continue
        skill_path = values.get('skillcraft')
        category = skills[skill_path] if skill_path != 'null' else 'Other'
        categories[category].append({'name': name, 'path': path})

    return {
        'note': (
            'Source-derived included DM literal inheritance approximation, not '
            'observed runtime. No tech-gated or learned-only rows. Recipe order '
            'uses include order, not observed subtypesof order. Craftability '
            'distribution is simulated by the benchmark. No DM compilation.'
        ),
        'included_file_count': len(includes),
        'recipe_definition_count': len(definitions),
        'categories': dict(categories),
        'names': list(names),
        'recipe_count': sum(map(len, categories.values())),
        'category_counts': {key: len(value) for key, value in categories.items()},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=pathlib.Path, help='Output fixture JSON path')
    arguments = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parents[2]
    fixture = extract(root)
    arguments.output.write_text(json.dumps(fixture, indent=2) + '\n')
    print(json.dumps({key: value for key, value in fixture.items()
                      if key not in ('categories', 'names')}))


if __name__ == '__main__':
    main()
